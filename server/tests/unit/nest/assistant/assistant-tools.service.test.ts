/**
 * The assistant's tool sessions over the container's real MCP registry: every
 * registered tool is offered but the denied ones, a sharing tool cannot slip
 * past the denylist, what runs at once is what the tools call read-only, a
 * turn starts with the core and loads an addon's tools on request; a session
 * hides the trip and the arguments the server sets, and its calls run on the
 * conversation's trip with the user's rights, broadcasting and auditing as an
 * MCP client's would.
 */
import { AuditLog } from '../../../../src/db/entities/AuditLog.entity';
import { McpRegistryService } from '../../../../src/nest-mcp';
import {
  ASSISTANT_DENIED_TOOLS,
  ASSISTANT_TOOL_GROUPS,
  checkDenylist,
  isOfferedTool,
} from '../../../../src/nest/assistant/assistant-tool-offer';
import {
  ASSISTANT_ARG_POLICY,
  ASSISTANT_SCOPES,
  ASSISTANT_SERVER_TOOLS,
  ASSISTANT_WRITE_TOOLS,
} from '../../../../src/nest/assistant/assistant-tools.constants';
import { AssistantToolsService, checkToolCatalog } from '../../../../src/nest/assistant/assistant-tools.service';
import { withRequestContext } from '../../../../src/nest/database/request-context';
import { makePlace } from '../../../helpers/factories/places';
import { findRows } from '../../../helpers/factories/rows';
import { setAddonEnabled } from '../../../helpers/factories/settings';
import { makeTrip } from '../../../helpers/factories/trips';
import { makeUser } from '../../../helpers/factories/users';
import { FakeRealtimeService } from '../../../helpers/fake-realtime';
import { bootTestApp } from '../../../helpers/test-app';
import { MikroORM } from '@mikro-orm/core';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

import { beforeAll, describe, expect, it, vi } from 'vitest';

const realtime = new FakeRealtimeService();
let orm: MikroORM;
let registry: McpRegistryService;
let tools: AssistantToolsService;

interface ListedTool {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}
let listed: Map<string, ListedTool>;

/** Every registered tool as the registry attaches it, with full scopes and every addon on. */
async function listRaw(userId: number): Promise<Map<string, ListedTool>> {
  const names = new Set(registry.list().map((entry) => entry.name));
  const server = new McpServer({ name: 'assistant-test', version: '1.0.0' });
  await withRequestContext(orm, () =>
    registry.attach(
      server,
      { userId, scopes: null, isStaticToken: false },
      { include: (kind, name) => kind === 'tool' && names.has(name) },
    ),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'assistant-test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const result = (await client.listTools()).tools as ListedTool[];
  await client.close();
  await server.close();
  return new Map(result.map((tool) => [tool.name, tool]));
}

beforeAll(async () => {
  const app = await bootTestApp(realtime);
  orm = app.get(MikroORM);
  registry = app.get(McpRegistryService);
  tools = app.get(AssistantToolsService);
  await Promise.all(['packing', 'budget'].map((addon) => setAddonEnabled(orm, addon, true)));
  const { user } = await makeUser(orm);
  listed = await listRaw(user.id);
});

describe('the assistant tool catalog', () => {
  it('ASTTOOL-001: the tools with a card of their own and the undo targets are registered', () => {
    expect(checkToolCatalog(registry.list())).toEqual([]);
    expect(Object.keys(ASSISTANT_WRITE_TOOLS).filter((name) => !listed.has(name))).toEqual([]);
  });

  it('ASTTOOL-002: names what is missing, what clashes and a sharing tool the denylist missed', () => {
    expect(checkToolCatalog([])).toContain('tool "create_place" with a card of its own is not registered');
    expect(checkToolCatalog([])).toContain('undo tool "delete_place" is not registered');
    const entry = (name: string) => ({ kind: 'tool' as const, name, className: 'X', methodName: 'y' });
    expect(checkToolCatalog([entry('import_booking')])).toContain('"import_booking" is the server\'s own step');
    expect(checkToolCatalog([entry('use_addon_tools')])).toContain('"use_addon_tools" is the server\'s own step');
    expect(checkDenylist(['create_party_invite'])).toEqual([
      '"create_party_invite" shares, invites or publishes; deny it or list it as safe',
    ]);
  });

  it("ASTTOOL-006: the server's own steps are no MCP tools", () => {
    for (const name of ASSISTANT_SERVER_TOOLS) expect(listed.has(name), name).toBe(false);
  });

  it('ASTTOOL-003: every registered tool that shares, invites or publishes is denied or only takes back', () => {
    expect(checkDenylist(listed.keys())).toEqual([]);
    for (const name of ['delete_trip', 'create_share_link', 'enable_trip_calendar_feed', 'import_places_from_url']) {
      expect(isOfferedTool(name), name).toBe(false);
    }
    for (const name of ['delete_place', 'list_upcoming_reservations', 'send_collab_message', 'toggle_vacay_entry']) {
      expect(isOfferedTool(name), name).toBe(true);
    }
    for (const reason of Object.values(ASSISTANT_DENIED_TOOLS)) expect(reason.length).toBeGreaterThan(10);
  });

  it('ASTTOOL-004: the tools with a card of their own write; every group names controllers that exist', () => {
    for (const name of Object.keys(ASSISTANT_WRITE_TOOLS)) {
      expect(listed.get(name)?.annotations?.readOnlyHint === true, name).toBe(false);
    }
    const controllers = new Set(registry.list().map((entry) => entry.className));
    for (const [group, { controllers: names }] of Object.entries(ASSISTANT_TOOL_GROUPS)) {
      for (const name of names) expect(controllers.has(name), `${group}: ${name}`).toBe(true);
    }
  });

  it('ASTTOOL-005: the assistant scopes are real scopes', () => {
    const allowed = new Set(
      registry
        .list()
        .flatMap((entry) => (typeof entry.access === 'object' ? [`${entry.access.group}:${entry.access.mode}`] : [])),
    );
    for (const scope of ASSISTANT_SCOPES) expect(allowed.has(scope), scope).toBe(true);
  });
});

describe('an assistant tool session', () => {
  async function ownerWithTrips() {
    const { user } = await makeUser(orm);
    const trip = await makeTrip(orm, user.id, { title: 'Kyoto' });
    const other = await makeTrip(orm, user.id, { title: 'Lisbon' });
    await makePlace(orm, trip.id, { name: 'Kinkaku-ji' });
    await makePlace(orm, other.id, { name: 'Belém Tower' });
    return { userId: user.id, tripId: trip.id, otherId: other.id };
  }

  it('ASTTOOL-010: offers the core and its own steps, never a denied tool, without the trip or what the server sets', async () => {
    const { userId, tripId } = await ownerWithTrips();
    const session = await tools.open(userId, tripId);
    try {
      const specs = session.specs();
      const names = specs.map((spec) => spec.name);
      expect(names).toEqual(expect.arrayContaining(['get_trip_summary', 'create_place', 'remember_for_trip']));
      expect(names).toContain('use_addon_tools');
      // An addon's tools wait until the model loads their group.
      expect(names).not.toContain('list_tours');
      for (const spec of specs) {
        expect(isOfferedTool(spec.name), spec.name).toBe(true);
        const properties = Object.keys((spec.parameters.properties as Record<string, unknown> | undefined) ?? {});
        expect(properties, spec.name).not.toContain('tripId');
        const policy = ASSISTANT_ARG_POLICY[spec.name];
        for (const key of [...Object.keys(policy?.forced ?? {}), ...(policy?.stripped ?? [])]) {
          expect(properties, spec.name).not.toContain(key);
        }
        expect((spec.parameters.required as string[] | undefined) ?? [], spec.name).not.toContain('tripId');
      }
      const pinned = [...listed.values()].filter((tool) => 'tripId' in (tool.inputSchema.properties ?? {}));
      expect(pinned.length).toBeGreaterThan(10);
    } finally {
      await session.close();
    }
  });

  it('ASTTOOL-011: a call runs on the conversation trip, and another trip id is refused', async () => {
    const { userId, tripId, otherId } = await ownerWithTrips();
    const session = await tools.open(userId, tripId);
    try {
      const run = await session.call('list_places', {});
      expect(run.ok).toBe(true);
      expect((run.value as { places: Array<{ name: string }> }).places.map((p) => p.name)).toEqual(['Kinkaku-ji']);
      expect(session.pinArgs('list_places', { tripId: otherId })).toEqual({
        error: expect.stringContaining('one trip'),
      });
      expect(session.pinArgs('list_places', { tripId, search: 'x' })).toEqual({ args: { search: 'x' } });
      expect(session.pinArgs('create_place', { name: 'A', image_url: 'https://track.example/pixel.png' })).toEqual({
        args: { name: 'A' },
      });
      expect(session.pinArgs('get_place_details', { placeId: 'abc', expand: true, refresh: true })).toEqual({
        args: { placeId: 'abc' },
      });
      expect(session.kindOf('list_places')).toBe('read');
      expect(session.kindOf('create_place')).toBe('write');
      // A deletion waits as a card; a read that fetches a planted address does too.
      expect(session.kindOf('delete_place')).toBe('write');
      expect(session.kindOf('resolve_maps_url')).toBe('write');
      expect(session.kindOf('delete_trip')).toBeNull();
      expect(session.hintOf('delete_place')).toMatchObject({ destructive: true, group: null });
    } finally {
      await session.close();
    }
  });

  it('ASTTOOL-012: a change runs with the user rights, broadcasts like any MCP call and is audited as the assistant', async () => {
    const { userId, tripId } = await ownerWithTrips();
    realtime.broadcastMock.mockClear();
    const session = await tools.open(userId, tripId);
    try {
      const run = await session.call('create_place', { name: 'Ryoan-ji' });
      expect(run.ok).toBe(true);
      expect(realtime.broadcastMock).toHaveBeenCalledWith(tripId, 'place:created', expect.anything());
      await vi.waitFor(async () => {
        const rows = await findRows(orm, AuditLog, { user: userId, action: 'mcp.tool_call' });
        expect(rows.map((row) => [row.resource, row.details])).toContainEqual([
          'create_place',
          '{"clientId":"assistant"}',
        ]);
      });
    } finally {
      await session.close();
    }
  });

  it('ASTTOOL-013: a stranger gets the tool refusal, not the trip', async () => {
    const { tripId } = await ownerWithTrips();
    const { user: stranger } = await makeUser(orm);
    const session = await tools.open(stranger.id, tripId);
    try {
      const run = await session.call('list_places', {});
      expect(run).toEqual({ ok: false, value: 'Trip not found or access denied.' });
    } finally {
      await session.close();
    }
  });

  it('ASTTOOL-015: the model loads an addon group for the rest of the turn; an unknown group is refused', async () => {
    const { userId, tripId } = await ownerWithTrips();
    const session = await tools.open(userId, tripId);
    try {
      expect(session.kindOf('use_addon_tools')).toBe('read');
      expect((await session.call('use_addon_tools', { groups: ['nope'] })).ok).toBe(false);
      const run = await session.call('use_addon_tools', { groups: ['tours'] });
      expect(run).toMatchObject({ ok: true, value: { loaded: ['tours'] } });
      expect((run.value as { tools: string[] }).tools).toContain('list_tours');
      expect(session.specs().map((spec) => spec.name)).toContain('list_tours');
      expect(session.hintOf('list_tours')).toMatchObject({ group: 'tours' });
    } finally {
      await session.close();
    }
  });

  it('ASTTOOL-014: an undo session holds its target and nothing else', async () => {
    const { userId, tripId } = await ownerWithTrips();
    const session = await tools.open(userId, tripId, new Set(['delete_place']));
    try {
      expect(session.specs().map((spec) => spec.name)).toEqual(['delete_place']);
      expect(session.kindOf('delete_place')).toBe('write');
      expect((await session.read('list_places')).value).toBe('Unknown tool: list_places');
    } finally {
      await session.close();
    }
  });
});
