import { McpRegistryService, type McpRegistryListing } from '../../nest-mcp';
import type { AiToolSpec } from '../ai-connections/ai-chat-client.interface';
import { AuditService } from '../audit/audit.service';
import { traceEntry } from '../audit/entry-trace.logger';
import { withRequestContext } from '../database/request-context';
import {
  ASSISTANT_ARG_POLICY,
  ASSISTANT_READ_TOOLS,
  ASSISTANT_SCOPES,
  ASSISTANT_SERVER_TOOLS,
  ASSISTANT_TOOL_ALLOWLIST,
  ASSISTANT_UNDO_MAP,
  ASSISTANT_WRITE_TOOLS,
  isDeniedTool,
  PINNED_ARG,
} from './assistant-tools.constants';
import { MikroORM } from '@mikro-orm/core';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

type ToolArgs = Record<string, unknown>;

/** What a tool call came back with: its JSON parsed where it was JSON, its text otherwise. */
export interface ToolRun {
  ok: boolean;
  value: unknown;
}

/** Whether a tool runs at once or waits for the user. */
export type AssistantToolKind = 'read' | 'write';

interface ListedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  kind: AssistantToolKind;
  pinned: boolean;
}

/**
 * What is wrong with the tool catalog the assistant relies on, given what the
 * registry holds: an allowlisted tool or an undo target that no longer exists,
 * an allowlisted tool that is also denied, or a tool named like one of the
 * server's own steps. Empty when all is well.
 */
export function checkToolCatalog(listing: readonly McpRegistryListing[]): string[] {
  const tools = new Set(listing.filter((entry) => entry.kind === 'tool').map((entry) => entry.name));
  const problems: string[] = [];
  for (const name of ASSISTANT_TOOL_ALLOWLIST) {
    if (!tools.has(name)) problems.push(`allowlisted tool "${name}" is not registered`);
    if (isDeniedTool(name)) problems.push(`tool "${name}" is both allowlisted and denied`);
  }
  for (const undo of Object.values(ASSISTANT_UNDO_MAP)) {
    if (!tools.has(undo.tool)) problems.push(`undo tool "${undo.tool}" is not registered`);
  }
  // The server's own steps are told apart from tool calls by name alone.
  for (const name of ASSISTANT_SERVER_TOOLS) {
    if (tools.has(name) || ASSISTANT_TOOL_ALLOWLIST.has(name)) problems.push(`"${name}" is the server's own step`);
  }
  return problems;
}

/**
 * How a listed tool is treated: a read runs at once, a write waits for the
 * user. A tool counts as a read only when both the list and its own
 * annotation say so, and as a write only when the list names it; anything
 * else is not offered, so a tool whose annotation changed fails closed.
 */
function kindOf(name: string, readOnly: boolean): AssistantToolKind | null {
  if (readOnly && ASSISTANT_READ_TOOLS.includes(name)) return 'read';
  return ASSISTANT_WRITE_TOOLS[name] ? 'write' : null;
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
    private readonly client: Client,
    private readonly server: McpServer,
    private readonly tools: ReadonlyMap<string, ListedTool>,
    private readonly tripId: number,
    private readonly audit: (toolName: string) => void,
  ) {}

  /** The tools as the model is offered them. */
  specs(): AiToolSpec[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: modelSchema(tool.name, tool.inputSchema),
    }));
  }

  kindOf(name: string): AssistantToolKind | null {
    return this.tools.get(name)?.kind ?? null;
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
    const run = await this.invoke(name, args);
    this.audit(name);
    return run;
  }

  /** Reads for the server's own use (the trip card, the undo check), not audited as the user's calls. */
  read(name: string, args: ToolArgs = {}): Promise<ToolRun> {
    return this.invoke(name, args);
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
   * A session for one user and trip holding the named tools (the allowlist by
   * default, a single undo target for an undo). No plugin tools are ever
   * attached: the assistant passes no dynamic tool source.
   */
  async open(userId: number, tripId: number, include: ReadonlySet<string> = ASSISTANT_TOOL_ALLOWLIST) {
    const server = new McpServer({ name: 'TREK assistant', version: '1.0.0' });
    const around = (info: { kind: string; name: string }, call: () => unknown): unknown =>
      traceEntry('mcp', `${info.kind} ${info.name} user=${userId} client=assistant`, () =>
        withRequestContext(this.orm, call),
      );
    await withRequestContext(this.orm, () =>
      this.registry.attach(
        server,
        { userId, scopes: [...ASSISTANT_SCOPES], isStaticToken: false },
        { include: (kind, name) => kind === 'tool' && include.has(name), around },
      ),
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'trek-assistant', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = new Map<string, ListedTool>();
    for (const tool of (await client.listTools()).tools) {
      const isUndoTarget = !ASSISTANT_TOOL_ALLOWLIST.has(tool.name);
      const kind = isUndoTarget ? 'write' : kindOf(tool.name, tool.annotations?.readOnlyHint === true);
      if (!kind) continue;
      const inputSchema = tool.inputSchema as Record<string, unknown>;
      const properties = (inputSchema.properties as Record<string, unknown> | undefined) ?? {};
      tools.set(tool.name, {
        name: tool.name,
        description: tool.description ?? '',
        inputSchema,
        kind,
        pinned: PINNED_ARG in properties,
      });
    }
    return new AssistantToolSession(client, server, tools, tripId, (toolName) => this.audit(userId, toolName));
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
