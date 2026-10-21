import { createLocalMcpServer, McpRegistryService, type McpRegistryListing } from '../../nest-mcp';
import type { AiToolSpec } from '../ai-connections/ai-chat-client.interface';
import { AuditService } from '../audit/audit.service';
import { traceEntry } from '../audit/entry-trace.logger';
import { withRequestContext } from '../database/request-context';
import { REMEMBER_SPEC } from './assistant-memory';
import {
  ASSISTANT_TOOL_GROUPS,
  checkDenylist,
  groupOf,
  HELD_READS,
  isOfferedTool,
  USE_TOOLS_SPEC,
  USE_TOOLS_TOOL,
} from './assistant-tool-offer';
import {
  ASSISTANT_ARG_POLICY,
  ASSISTANT_SCOPES,
  ASSISTANT_SERVER_TOOLS,
  ASSISTANT_UNDO_MAP,
  ASSISTANT_WRITE_TOOLS,
  PINNED_ARG,
  REMEMBER_TOOL,
} from './assistant-tools.constants';
import { MikroORM } from '@mikro-orm/core';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

type ToolArgs = Record<string, unknown>;

/** What a tool call came back with: its JSON parsed where it was JSON, its text otherwise. */
export interface ToolRun {
  ok: boolean;
  value: unknown;
}

/** Whether a tool runs at once or waits for the user. */
export type AssistantToolKind = 'read' | 'write';

/** What a card for a tool without one of its own goes by: what the tool says it does, and where it works. */
export interface ToolHint {
  destructive: boolean;
  creates: boolean;
  group: string | null;
}

interface ListedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: AssistantToolKind;
  pinned: boolean;
  hint: ToolHint;
}

/** A turn's session offers every tool (the core first, the rest by group); an undo's holds its one target. */
type SessionMode = 'turn' | 'undo';

/**
 * What is wrong with the tool catalog the assistant relies on, given what the
 * registry holds: a tool with a card of its own or an undo target that no
 * longer exists, a sharing tool the denylist missed, or a tool named like one
 * of the server's own steps. Empty when all is well.
 */
export function checkToolCatalog(listing: readonly McpRegistryListing[]): string[] {
  const tools = new Set(listing.filter((entry) => entry.kind === 'tool').map((entry) => entry.name));
  const problems: string[] = [];
  for (const name of Object.keys(ASSISTANT_WRITE_TOOLS)) {
    if (!tools.has(name)) problems.push(`tool "${name}" with a card of its own is not registered`);
  }
  for (const undo of Object.values(ASSISTANT_UNDO_MAP)) {
    if (!tools.has(undo.tool)) problems.push(`undo tool "${undo.tool}" is not registered`);
  }
  // The server's own steps are told apart from tool calls by name alone.
  for (const name of [...ASSISTANT_SERVER_TOOLS, USE_TOOLS_TOOL]) {
    if (tools.has(name)) problems.push(`"${name}" is the server's own step`);
  }
  return [...problems, ...checkDenylist(tools)];
}

/**
 * How a listed tool is treated: a read runs at once, everything else waits
 * for the user. A tool counts as a read only when its own annotation says so
 * and it fetches nothing a message could have planted, so a tool whose
 * annotation is missing or wrong costs an extra card, never a silent write.
 */
function kindOf(name: string, readOnly: boolean): AssistantToolKind {
  return readOnly && !HELD_READS.has(name) ? 'read' : 'write';
}

function hiddenArgs(name: string): Set<string> {
  const policy = ASSISTANT_ARG_POLICY[name];
  return new Set([PINNED_ARG, ...Object.keys(policy?.forced ?? {}), ...(policy?.stripped ?? [])]);
}

/** The tool's JSON Schema without the arguments the server sets or takes away. */
function modelSchema(name: string, schema: Record<string, unknown>): Record<string, unknown> {
  const hidden = hiddenArgs(name);
  const properties = { ...((schema.properties as Record<string, unknown> | undefined) ?? {}) };
  for (const key of hidden) delete properties[key];
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((key) => typeof key === 'string' && !hidden.has(key))
    : [];
  const { required: _required, ...rest } = schema;
  return { ...rest, properties, ...(required.length > 0 ? { required } : {}) };
}

function readResult(result: unknown): ToolRun {
  const record = (result ?? {}) as { content?: unknown; isError?: unknown };
  const text = Array.isArray(record.content)
    ? record.content
        .filter(
          (item): item is { type: 'text'; text: string } => item?.type === 'text' && typeof item.text === 'string',
        )
        .map((item) => item.text)
        .join('\n')
    : '';
  let value: unknown = text;
  try {
    value = JSON.parse(text);
  } catch {
    // Plain text: a refusal or a message, kept as it was written.
  }
  return { ok: record.isError !== true, value };
}

/**
 * One turn's view of the MCP tools: a server holding only the tools the turn
 * may use, attached for the user with the assistant's scopes and connected to
 * a client over an in-memory transport. The tools run exactly as they do for
 * an MCP client, with the user's own rights and the registry's demo gate, and
 * broadcast their changes the same way.
 *
 * Every tool that takes a trip runs on the conversation's trip: the model
 * never sees that argument, and one it sends anyway must name this trip.
 */
export class AssistantToolSession {
  constructor(
    private readonly client: InstanceType<typeof Client>,
    private readonly server: ReturnType<typeof createLocalMcpServer>,
    private readonly tools: ReadonlyMap<string, ListedTool>,
    private readonly tripId: number,
    private readonly audit: (toolName: string) => void,
    private readonly mode: SessionMode,
  ) {}

  /** The groups this turn loaded; the core is always there. */
  private readonly loaded = new Set<string>();

  /**
   * The tools as the model is offered them: the core and the groups it
   * loaded, the trip notes, and the step that loads the other groups.
   */
  specs(): AiToolSpec[] {
    const listed = [...this.tools.values()]
      .filter((tool) => this.mode === 'undo' || tool.hint.group === null || this.loaded.has(tool.hint.group))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: modelSchema(tool.name, tool.inputSchema),
      }));
    if (this.mode === 'undo') return listed;
    const more = Object.keys(ASSISTANT_TOOL_GROUPS).some((group) => !this.loaded.has(group));
    return [...listed, REMEMBER_SPEC, ...(more ? [USE_TOOLS_SPEC] : [])];
  }

  kindOf(name: string): AssistantToolKind | null {
    if (name === REMEMBER_TOOL) return this.mode === 'turn' ? 'write' : null;
    if (name === USE_TOOLS_TOOL) return this.mode === 'turn' ? 'read' : null;
    return this.tools.get(name)?.kind ?? null;
  }

  /** What a card for this tool goes by; null for a tool this session does not hold. */
  hintOf(name: string): ToolHint | null {
    return this.tools.get(name)?.hint ?? null;
  }

  /**
   * The model's arguments as they are shown and stored: the trip, the forced
   * and the stripped arguments taken out. A trip id other than this
   * conversation's is refused.
   */
  pinArgs(name: string, args: ToolArgs): { args: ToolArgs } | { error: string } {
    const given = args[PINNED_ARG];
    if (given !== undefined && Number(given) !== this.tripId) {
      return { error: 'This conversation is about one trip; its id is set by the app and cannot be changed.' };
    }
    const hidden = hiddenArgs(name);
    return { args: Object.fromEntries(Object.entries(args).filter(([key]) => !hidden.has(key))) };
  }

  /** Runs a tool on the user's behalf (a read the model asked for, an applied change, an undo), audited. */
  async call(name: string, args: ToolArgs): Promise<ToolRun> {
    if (name === USE_TOOLS_TOOL) return this.load(args);
    const run = await this.invoke(name, args);
    this.audit(name);
    return run;
  }

  /** Reads for the server's own use (the trip card, the undo check), not audited as the user's calls. */
  read(name: string, args: ToolArgs = {}): Promise<ToolRun> {
    return this.invoke(name, args);
  }

  /** Loads tool groups for the rest of the turn, and says which tools came with them. */
  private load(args: ToolArgs): ToolRun {
    const asked = Array.isArray(args.groups) ? args.groups.filter((g): g is string => typeof g === 'string') : [];
    const groups = asked.filter((group) => group in ASSISTANT_TOOL_GROUPS);
    if (groups.length === 0)
      return { ok: false, value: `Name one of: ${Object.keys(ASSISTANT_TOOL_GROUPS).join(', ')}` };
    for (const group of groups) this.loaded.add(group);
    const tools = [...this.tools.values()].filter((tool) => tool.hint.group && groups.includes(tool.hint.group));
    return { ok: true, value: { loaded: groups, tools: tools.map((tool) => tool.name) } };
  }

  async close(): Promise<void> {
    await this.client.close().catch(() => undefined);
    await this.server.close().catch(() => undefined);
  }

  private async invoke(name: string, args: ToolArgs): Promise<ToolRun> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, value: `Unknown tool: ${name}` };
    const forced = ASSISTANT_ARG_POLICY[name]?.forced ?? {};
    const final = { ...args, ...(tool.pinned ? { [PINNED_ARG]: this.tripId } : {}), ...forced };
    try {
      return readResult(await this.client.callTool({ name, arguments: final }));
    } catch (err) {
      return { ok: false, value: err instanceof Error ? err.message : String(err) };
    }
  }
}

/**
 * Builds the assistant's tool sessions over the container's MCP registry, and
 * checks at boot that every tool the assistant names still exists.
 */
@Injectable()
export class AssistantToolsService implements OnApplicationBootstrap {
  constructor(
    private readonly registry: McpRegistryService,
    private readonly orm: MikroORM,
    private readonly auditLog: AuditService,
  ) {}

  onApplicationBootstrap(): void {
    const problems = checkToolCatalog(this.registry.list());
    if (problems.length > 0) throw new Error(`Assistant tool catalog is out of date: ${problems.join('; ')}`);
  }

  /**
   * A session for one user and trip: for a turn every tool the assistant is
   * offered, for an undo only the named targets. No plugin tools are ever
   * attached: the assistant passes no dynamic tool source.
   */
  async open(userId: number, tripId: number, undoTargets?: ReadonlySet<string>) {
    const include = (name: string) => (undoTargets ? undoTargets.has(name) : isOfferedTool(name));
    const classOf = new Map(this.registry.list().map((entry) => [entry.name, entry] as const));
    const server = createLocalMcpServer('TREK assistant');
    const around = (info: { kind: string; name: string }, call: () => unknown): unknown =>
      traceEntry('mcp', `${info.kind} ${info.name} user=${userId} client=assistant`, () =>
        withRequestContext(this.orm, call),
      );
    await withRequestContext(this.orm, () =>
      this.registry.attach(
        server,
        { userId, scopes: [...ASSISTANT_SCOPES], isStaticToken: false },
        { include: (kind, name) => kind === 'tool' && include(name), around },
      ),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'trek-assistant', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = new Map<string, ListedTool>();
    for (const tool of (await client.listTools()).tools) {
      const annotations = tool.annotations ?? {};
      const kind = undoTargets ? 'write' : kindOf(tool.name, annotations.readOnlyHint === true);
      const inputSchema = tool.inputSchema as Record<string, unknown>;
      const properties = (inputSchema.properties as Record<string, unknown> | undefined) ?? {};
      const entry = classOf.get(tool.name);
      tools.set(tool.name, {
        name: tool.name,
        description: tool.description ?? '',
        inputSchema,
        kind,
        pinned: PINNED_ARG in properties,
        hint: {
          destructive: annotations.destructiveHint === true,
          creates: annotations.idempotentHint === false,
          group: entry ? groupOf(entry) : null,
        },
      });
    }
    const mode: SessionMode = undoTargets ? 'undo' : 'turn';
    return new AssistantToolSession(client, server, tools, tripId, (name) => this.audit(userId, name), mode);
  }

  /** The audit row an MCP client's call writes, marked as the assistant's. A failed write never fails the call. */
  private audit(userId: number, toolName: string): void {
    void withRequestContext(this.orm, () =>
      this.auditLog.writeAudit({
        userId,
        action: 'mcp.tool_call',
        resource: toolName,
        details: { clientId: 'assistant' },
      }),
    ).catch(() => undefined);
  }
}
