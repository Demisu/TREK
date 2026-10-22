/**
 * HikePlanMcp: a hike planned with the traveller over MCP. The proposal
 * reads only; the hike is created through ToursService.createTour, changed
 * through the route write the planner's edit uses, and a GPX text taken in
 * through the tours' file import, all real here over a snapshot test db. The
 * way is planned by HikeRoutingService, a stub in this suite (its own suite
 * plans against a stubbed Valhalla). The suite takes its subject from the
 * container and seeds through the ORM factories.
 */
import { Places } from '../../../src/db/entities/Places.entity';
import { TourTypes } from '../../../src/db/entities/TourTypes.entity';
import { TourWaypoints } from '../../../src/db/entities/TourWaypoints.entity';
import { Tours } from '../../../src/db/entities/Tours.entity';
import type { McpContext } from '../../../src/nest-mcp';
import { getEntry, type ClassRef } from '../../../src/nest-mcp/metadata';
import { DomainError } from '../../../src/nest/common/domain-error';
import { McpToolGuardsService } from '../../../src/nest/mcp-shared/mcp-tool-guards.service';
import { HikePlanMcp } from '../../../src/nest/tours/hike-plan.mcp';
import { HikeRoutingService, type PlannedHike } from '../../../src/nest/tours/hike-routing.service';
import { ToursModule } from '../../../src/nest/tours/tours.module';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import { makePlace } from '../../helpers/factories/places';
import { countRows, findRow, findRows, updateRows } from '../../helpers/factories/rows';
import { addTourWaypoints, makeTour } from '../../helpers/factories/tours';
import { makeTrip } from '../../helpers/factories/trips';
import { makeUser } from '../../helpers/factories/users';
import { resetTestDb } from '../../helpers/test-db';
import { createTestModule, type TestModule } from '../../helpers/test-module';
import { MikroORM } from '@mikro-orm/core';
import {
  HIKE_PLAN_MAX_WAYPOINTS,
  hikeProposalSchema,
  type GeometryPoint,
  type HikePlanRequest,
  type HikeSacSegment,
  type UnroutedHikePlan,
} from '@trek/shared';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// HIKE-MCP-001 to HIKE-MCP-017

const db = createSnapshotTestDb();
const plan = vi.fn<HikeRoutingService['plan']>();
let t: TestModule;
let mcp: HikePlanMcp;
const orm = () => t.get(MikroORM);

beforeAll(async () => {
  t = await createTestModule({
    db,
    imports: [ToursModule],
    overrides: [{ provide: HikeRoutingService, useValue: { plan } }],
  });
  mcp = t.get(HikePlanMcp);
});
beforeEach(() => {
  resetTestDb(db);
  plan.mockReset().mockImplementation(async (_userId, _tripId, request) => routed(request));
  t.realtime.broadcastMock.mockReset();
});
afterAll(async () => {
  await t.close();
  db.close();
});

const ctx = (userId: number) => ({ userId }) as McpContext;

/** The JSON a tool answered, or the error text it refused with. */
function read(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  const text = result.content[0]?.text ?? '';
  return result.isError ? { error: text } : JSON.parse(text);
}

/** A way up 100 m a point, the router's answer with every height read. */
const LINE: GeometryPoint[] = [
  [47.5, 11.1, 800],
  [47.505, 11.1, 900],
  [47.51, 11.1, 1000],
];
const GRADES: HikeSacSegment[] = [
  { from_m: 0, to_m: 600, sac: 2 },
  { from_m: 600, to_m: 1112, sac: 3 },
];

/** The stub's plan: the way above (or `line`) under the limit and preferences asked for. */
function routed(request: HikePlanRequest, line: GeometryPoint[] = LINE): PlannedHike {
  return {
    plan: {
      kind: 'routed',
      max_hiking_difficulty: request.max_hiking_difficulty ?? 2,
      hiking_preferences: request.hiking_preferences ?? null,
      distance_m: 1112,
      ascent_m: 200,
      descent_m: 0,
      duration_minutes: 52,
      duration_basis: 'din33466',
      has_heights: true,
      line,
      profile: [
        [0, 800],
        [556, 900],
        [1112, 1000],
      ],
      grades: { segments: GRADES, highest: 3, unknown_share: 0 },
    },
    line,
  };
}

/** The stub's plan of the way above whose heights the router did not give. */
function flat(): PlannedHike {
  const line = LINE.map(([lat, lng]): GeometryPoint => [lat, lng]);
  return {
    plan: {
      kind: 'routed',
      max_hiking_difficulty: 2,
      hiking_preferences: null,
      distance_m: 1112,
      ascent_m: null,
      descent_m: null,
      duration_minutes: 17,
      duration_basis: 'router',
      has_heights: false,
      line,
      profile: [],
      grades: null,
    },
    line,
  };
}

function unrouted(why: UnroutedHikePlan['why'], position: number | null = null): PlannedHike {
  return {
    plan: { kind: 'unrouted', max_hiking_difficulty: 2, why, position, snapped_m: position === null ? null : 420 },
    line: null,
  };
}

const WAYPOINTS = [
  { lat: 47.5, lng: 11.1, name: 'Car park' },
  { lat: 47.505, lng: 11.1 },
  { lat: 47.51, lng: 11.1, name: 'Summit' },
];

const GPX = `<gpx>
  <trk><name>Ridge</name><trkseg>
    <trkpt lat="47.5" lon="11.1"><ele>800</ele></trkpt>
    <trkpt lat="47.51" lon="11.1"><ele>1000</ele></trkpt>
  </trkseg></trk>
</gpx>`;

async function fixture() {
  const { user } = await makeUser(orm());
  const { user: outsider } = await makeUser(orm());
  const trip = await makeTrip(orm(), user.id);
  return { user, outsider, trip };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** A hike created through the tool, as its answer reads. */
async function createdHike(f: Fixture, over: Record<string, unknown> = {}) {
  return read(
    await mcp.createHike({ tripId: f.trip.id, name: 'Herzogstand', waypoints: WAYPOINTS, ...over }, ctx(f.user.id)),
  );
}

const events = () =>
  t.realtime.broadcastMock.mock.calls.map(([tripId, event, , excluded]) => [tripId, event, excluded]);

describe('HikePlanMcp: the tools and their gates', () => {
  it('HIKE-MCP-001: the proposal reads only, the create, change and import write, all on the Tours addon', async () => {
    const options = (method: string) => {
      const entry = getEntry(HikePlanMcp as unknown as ClassRef, method);
      if (!entry || entry.kind !== 'tool') throw new Error(`${method} is no MCP tool`);
      return entry.options;
    };
    const tools = ['proposeHike', 'createHike', 'updateTour', 'importTourGpx'].map(options);
    expect(
      tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint, tool.annotations?.idempotentHint, tool.access]),
    ).toEqual([
      ['propose_hike', true, true, { group: 'trips', mode: 'read' }],
      ['create_hike', false, false, { group: 'trips', mode: 'write' }],
      ['update_tour', false, true, { group: 'trips', mode: 'write' }],
      ['import_tour_gpx', false, false, { group: 'trips', mode: 'write' }],
    ]);
    expect(tools[0].description).toContain('variant_label');
    expect(tools[0].description).toContain('never list coordinates');
    expect(tools[1].description).toContain('route_pending');
    expect(tools[2].description).toContain('expected_revision');
    expect(tools[3].description).toContain('skipped');
    const isAddonEnabled = vi.fn(async (id: string) => id === 'tours');
    const gated = await Promise.all(tools.map((tool) => tool.when?.(ctx(1), { addons: { isAddonEnabled } })));
    expect(gated).toEqual([true, true, true, true]);
    expect(isAddonEnabled).toHaveBeenCalledWith('tours');
  });

  it('HIKE-MCP-002: an outsider is refused every tool, and the writes are refused without place_edit, as REST refuses them', async () => {
    const f = await fixture();
    const outsider = ctx(f.outsider.id);
    const noAccess = { error: 'Trip not found or access denied.' };
    expect(read(await mcp.proposeHike({ tripId: f.trip.id, waypoints: WAYPOINTS }, outsider))).toEqual(noAccess);
    expect(read(await mcp.createHike({ tripId: f.trip.id, name: 'X', waypoints: WAYPOINTS }, outsider))).toEqual(
      noAccess,
    );
    expect(read(await mcp.updateTour({ tripId: f.trip.id, placeId: 1, expected_revision: 1 }, outsider))).toEqual(
      noAccess,
    );
    expect(read(await mcp.importTourGpx({ tripId: f.trip.id, gpx: GPX, tour_type: 'hike' }, outsider))).toEqual(
      noAccess,
    );

    const created = await createdHike(f);
    const denied = vi.spyOn(t.get(McpToolGuardsService), 'hasTripPermission').mockResolvedValue(false);
    try {
      const own = ctx(f.user.id);
      const refusals = [
        await mcp.createHike({ tripId: f.trip.id, name: 'X', waypoints: WAYPOINTS }, own),
        await mcp.updateTour(
          { tripId: f.trip.id, placeId: created.tour.place_id, expected_revision: 1, name: 'Y' },
          own,
        ),
        await mcp.importTourGpx({ tripId: f.trip.id, gpx: GPX, tour_type: 'hike' }, own),
      ];
      expect(refusals.map(read)).toEqual(
        Array(3).fill({ error: 'You do not have permission to perform this action on this trip.' }),
      );
      expect(denied).toHaveBeenCalledWith('place_edit', f.trip.id, f.user.id);
      // The proposal only reads, and is open to anyone who sees the trip.
      expect(read(await mcp.proposeHike({ tripId: f.trip.id, waypoints: WAYPOINTS }, own)).route).toEqual({
        planned: true,
      });
    } finally {
      denied.mockRestore();
    }
    expect(await countRows(orm(), Tours, {})).toBe(1);
    expect((await findRow(orm(), Places, { id: created.tour.place_id }))?.name).toBe('Herzogstand');
  });
});

describe('HikePlanMcp: propose_hike', () => {
  it('HIKE-MCP-003: proposes the way with its measures, grades and where each point lies, and writes nothing', async () => {
    const f = await fixture();
    const proposal = read(
      await mcp.proposeHike(
        {
          tripId: f.trip.id,
          name: 'Herzogstand',
          waypoints: WAYPOINTS,
          max_hiking_difficulty: 3,
          hiking_preferences: { avoid_steps: true },
          variant_label: 'short and steep',
          date: '2027-07-10',
          start_time: '08:30',
        },
        ctx(f.user.id),
      ),
    );
    expect(hikeProposalSchema.parse(proposal)).toEqual(proposal);
    expect(proposal).toMatchObject({
      name: 'Herzogstand',
      variant_label: 'short and steep',
      route: { planned: true },
      unreachable: null,
      distance_m: 1112,
      ascent_m: 200,
      duration_minutes: 52,
      duration_basis: 'din33466',
      heights_known: true,
      min_ele_m: 800,
      max_ele_m: 1000,
      sac: { highest: 3, segments: GRADES, unknown_share: 0 },
      max_hiking_difficulty: 3,
      hiking_preferences: { avoid_steps: true },
      round_trip: false,
      date: '2027-07-10',
      start_time: '08:30',
    });
    expect(proposal.waypoints.map((point: { name: string | null; at_m: number }) => [point.name, point.at_m])).toEqual([
      ['Car park', 0],
      [null, 556],
      ['Summit', 1112],
    ]);
    expect(plan).toHaveBeenCalledWith(
      f.user.id,
      f.trip.id,
      { waypoints: WAYPOINTS, max_hiking_difficulty: 3, hiking_preferences: { avoid_steps: true } },
      { grades: true },
    );
    expect(await countRows(orm(), Tours, {})).toBe(0);
    expect(t.realtime.broadcastMock).not.toHaveBeenCalled();
  });

  it('HIKE-MCP-004: a round trip is planned back to its start, and a proposal without a way says why', async () => {
    const f = await fixture();
    // Up the way and back down it.
    plan.mockResolvedValueOnce(routed({ waypoints: WAYPOINTS }, [...LINE, ...LINE.slice(0, -1).reverse()]));
    const round = read(
      await mcp.proposeHike({ tripId: f.trip.id, waypoints: WAYPOINTS.slice(0, 2), round_trip: true }, ctx(f.user.id)),
    );
    expect(plan.mock.calls[0][2].waypoints).toEqual([WAYPOINTS[0], WAYPOINTS[1], WAYPOINTS[0]]);
    expect(round.round_trip).toBe(true);
    expect(round.waypoints.map((point: { name: string | null; at_m: number }) => [point.name, point.at_m])).toEqual([
      ['Car park', 0],
      [null, 556],
      ['Car park', 2224],
    ]);

    plan.mockResolvedValueOnce(unrouted('point_off_the_way', 2));
    const off = read(await mcp.proposeHike({ tripId: f.trip.id, waypoints: WAYPOINTS }, ctx(f.user.id)));
    expect(hikeProposalSchema.parse(off)).toEqual(off);
    expect(off).toMatchObject({
      route: { planned: false, why: 'point_off_the_way', position: 2 },
      unreachable: { position: 2, snapped_m: 420 },
      distance_m: null,
      duration_minutes: null,
      heights_known: false,
      line: [],
      sac: null,
    });
    expect(off.waypoints.every((point: { at_m: number | null }) => point.at_m === null)).toBe(true);
  });
});

describe('HikePlanMcp: create_hike', () => {
  it('HIKE-MCP-005: creates the hike the way the planner saves one, with its whole line, time and limit, and tells the whole trip', async () => {
    const f = await fixture();
    const created = await createdHike(f, {
      description: 'Up from the car park',
      max_hiking_difficulty: 3,
      hiking_preferences: { avoid_steps: true, avoid_climbs: false },
      planned_duration_minutes: 240,
    });
    expect(created.route).toEqual({ planned: true });
    expect(created.tour).toMatchObject({
      name: 'Herzogstand',
      description: 'Up from the car park',
      tour_type: 'hike',
      max_hiking_difficulty: 3,
      hiking_preferences: { avoid_steps: true },
      duration: 52,
      planned_duration_minutes: 240,
      elevation_gain: 200,
      revision: 1,
      route_pending: false,
    });
    expect(
      created.waypoints.map((point: { role: string; sequence: number; name?: string | null }) => [
        point.role,
        point.sequence,
        point.name ?? null,
      ]),
    ).toEqual([
      ['start', 0, 'Car park'],
      ['via', 1, null],
      ['end', 2, 'Summit'],
    ]);
    const placeId = created.tour.place_id;
    const place = await findRow(orm(), Places, { id: placeId });
    expect(JSON.parse(String(place?.route_geometry))).toEqual(LINE);
    // A hike being saved reads no grades: nothing of them is kept.
    expect(plan.mock.calls[0][3]).toEqual({ grades: false });
    // Made in one write, its place stamped once: an undo tells a change later from it by its updated_at.
    expect(place?.updated_at).toBe(place?.created_at);
    // A tour sent with no socket to leave out: the tab that asked shows it too.
    expect(events()).toEqual([
      [String(f.trip.id), 'tours:changed', undefined],
      [String(f.trip.id), 'place:created', undefined],
    ]);
  });

  it('HIKE-MCP-006: saves the hike with its points only where no way was planned, and refuses a switched-off hike', async () => {
    const f = await fixture();
    plan.mockResolvedValueOnce(unrouted('router_unavailable'));
    const created = await createdHike(f);
    expect(created.route).toEqual({ planned: false, why: 'router_unavailable', position: null });
    expect(created.tour).toMatchObject({ route_pending: true, distance: null, duration: null });
    const place = await findRow(orm(), Places, { id: created.tour.place_id });
    expect([place?.route_geometry, place?.lat, place?.lng]).toEqual([null, 47.5, 11.1]);

    // A way whose heights the router did not give is not kept either: the planner saves none without them.
    plan.mockResolvedValueOnce(flat());
    const level = await createdHike(f, { name: 'Level' });
    expect(level.route).toEqual({ planned: false, why: 'router_unavailable', position: null });
    expect(level.tour).toMatchObject({ route_pending: true, distance: null, elevation_gain: null });
    expect((await findRow(orm(), Places, { id: level.tour.place_id }))?.route_geometry).toBeNull();

    await updateRows(orm(), TourTypes, { key: 'hike' }, { enabled: 0 });
    try {
      await expect(createdHike(f)).rejects.toThrow('Tour type is not available');
    } finally {
      await updateRows(orm(), TourTypes, { key: 'hike' }, { enabled: 1 });
    }
    expect(await countRows(orm(), Tours, {})).toBe(2);
  });

  it('HIKE-MCP-013: refuses a hike whose way the planner could not plan either, and writes nothing', async () => {
    const f = await fixture();
    const refusals: Array<[UnroutedHikePlan['why'], number | null, string]> = [
      ['no_valhalla', null, 'TREK has no Valhalla router here'],
      ['no_way', null, 'No way within the hiking limit joins these points'],
      ['point_off_the_way', 2, 'Point 2 is further than 300 m from any way'],
      ['too_long', null, 'The way is too long to plan as one hike'],
    ];
    // One create after the other, each planned by the next answer of the stub.
    const refused = await refusals.reduce<Promise<unknown[]>>(async (before, [why, position]) => {
      const done = await before;
      plan.mockResolvedValueOnce(unrouted(why, position));
      return [...done, await createdHike(f).catch((err: unknown) => err)];
    }, Promise.resolve([]));
    refused.forEach((err, index) => {
      const [why, , words] = refusals[index];
      expect(err, why).toBeInstanceOf(DomainError);
      expect(err, why).toMatchObject({ code: 'hike_not_routed', publicMessage: expect.stringContaining(words) });
      expect(err instanceof DomainError && err.publicMessage.endsWith(' Nothing was saved.'), why).toBe(true);
      expect(err instanceof DomainError && err.getStatus(), why).toBe(422);
    });
    expect(await countRows(orm(), Tours, {})).toBe(0);
    expect(await countRows(orm(), Places, { trip: f.trip.id })).toBe(0);
    expect(t.realtime.broadcastMock).not.toHaveBeenCalled();
  });
});

describe('HikePlanMcp: update_tour', () => {
  it('HIKE-MCP-007: a new name keeps the way, raises the revision and tells the whole trip', async () => {
    const f = await fixture();
    const created = await createdHike(f);
    plan.mockClear();
    t.realtime.broadcastMock.mockReset();
    const changed = read(
      await mcp.updateTour(
        {
          tripId: f.trip.id,
          placeId: created.tour.place_id,
          expected_revision: 1,
          name: 'Herzogstand loop',
          description: 'Now with a description',
          planned_duration_minutes: 300,
        },
        ctx(f.user.id),
      ),
    );
    expect(plan).not.toHaveBeenCalled();
    expect(changed).toMatchObject({ replanned: false, route: { planned: true } });
    expect(changed.tour).toMatchObject({
      name: 'Herzogstand loop',
      description: 'Now with a description',
      revision: 2,
      duration: 52,
      planned_duration_minutes: 300,
      max_hiking_difficulty: 2,
    });
    expect(changed.waypoints.map((point: { key: string }) => point.key)).toEqual(
      created.waypoints.map((point: { key: string }) => point.key),
    );
    const place = await findRow(orm(), Places, { id: created.tour.place_id });
    expect(JSON.parse(String(place?.route_geometry))).toEqual(LINE);
    expect(events()).toEqual([
      [String(f.trip.id), 'tours:changed', undefined],
      [String(f.trip.id), 'place:updated', undefined],
    ]);
  });

  it('HIKE-MCP-008: new points, a new limit or new preferences plan the way anew; a stale revision is refused', async () => {
    const f = await fixture();
    const created = await createdHike(f);
    const placeId = created.tour.place_id;
    const own = ctx(f.user.id);

    plan.mockClear();
    const harder = read(
      await mcp.updateTour({ tripId: f.trip.id, placeId, expected_revision: 1, max_hiking_difficulty: 4 }, own),
    );
    expect(harder).toMatchObject({ replanned: true, route: { planned: true } });
    expect(harder.tour).toMatchObject({ max_hiking_difficulty: 4, revision: 2 });
    expect(plan.mock.calls[0][2]).toEqual({
      waypoints: WAYPOINTS.map(({ lat, lng }) => ({ lat, lng })),
      max_hiking_difficulty: 4,
      hiking_preferences: null,
    });

    plan.mockClear();
    const gentler = read(
      await mcp.updateTour(
        { tripId: f.trip.id, placeId, expected_revision: 2, hiking_preferences: { avoid_climbs: true } },
        own,
      ),
    );
    expect(gentler.tour).toMatchObject({ hiking_preferences: { avoid_climbs: true }, revision: 3 });
    expect(plan).toHaveBeenCalledTimes(1);

    const moved = [WAYPOINTS[0], { lat: 47.52, lng: 11.1, name: 'Heimgarten' }];
    const repointed = read(
      await mcp.updateTour({ tripId: f.trip.id, placeId, expected_revision: 3, waypoints: moved }, own),
    );
    expect(repointed.waypoints.map((point: { name?: string }) => point.name)).toEqual(['Car park', 'Heimgarten']);
    expect(repointed.tour.revision).toBe(4);
    expect(await countRows(orm(), TourWaypoints, { place: placeId })).toBe(2);

    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId, expected_revision: 3, name: 'Stale' }, own),
    ).rejects.toThrow('This tour was changed in the meantime');
    expect((await findRow(orm(), Places, { id: placeId }))?.name).toBe('Herzogstand');
    expect((await findRow(orm(), Tours, { place: placeId }))?.revision).toBe(4);
  });

  it('HIKE-MCP-009: a new way that cannot be planned leaves the hike as it was; one still waiting for its way is planned', async () => {
    const f = await fixture();
    const created = await createdHike(f);
    const placeId = created.tour.place_id;
    plan.mockResolvedValueOnce(unrouted('no_way'));
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId, expected_revision: 1, max_hiking_difficulty: 1 }, ctx(f.user.id)),
    ).rejects.toThrow('No way within the hiking limit joins these points');
    expect(await findRow(orm(), Tours, { place: placeId })).toMatchObject({ revision: 1, max_hiking_difficulty: 2 });

    // A hike saved while the router was away is planned on its next change, a rename alone included.
    plan.mockResolvedValueOnce(unrouted('router_unavailable'));
    const pending = await createdHike(f, { name: 'Pending' });
    plan.mockResolvedValueOnce(unrouted('router_unavailable'));
    const still = read(
      await mcp.updateTour(
        { tripId: f.trip.id, placeId: pending.tour.place_id, expected_revision: 1, name: 'Still pending' },
        ctx(f.user.id),
      ),
    );
    expect(still).toMatchObject({ replanned: true, route: { planned: false, why: 'router_unavailable' } });
    expect(still.tour).toMatchObject({ name: 'Still pending', route_pending: true, revision: 2 });
    const planned = read(
      await mcp.updateTour(
        { tripId: f.trip.id, placeId: pending.tour.place_id, expected_revision: 2, name: 'Planned' },
        ctx(f.user.id),
      ),
    );
    expect(planned).toMatchObject({ replanned: true, route: { planned: true } });
    expect(planned.tour).toMatchObject({ route_pending: false, duration: 52, revision: 3 });
  });

  it('HIKE-MCP-010: changes only a hike planned in TREK, and says which tour it cannot find', async () => {
    const f = await fixture();
    const own = ctx(f.user.id);
    const walk = await makePlace(orm(), f.trip.id, { name: 'Old town' });
    await makeTour(orm(), walk.id, { tourTypeRef: 'walk', max_hiking_difficulty: null });
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId: walk.id, expected_revision: 1, name: 'X' }, own),
    ).rejects.toThrow('Only a hike is changed here');

    // An import is a recorded track: renamed elsewhere, planned over only with new points.
    const track = await makePlace(orm(), f.trip.id, {
      name: 'Recorded',
      route_geometry: JSON.stringify(LINE),
    });
    await makeTour(orm(), track.id, { origin: 'gpx', max_hiking_difficulty: null, duration: null });
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId: track.id, expected_revision: 1, name: 'X' }, own),
    ).rejects.toThrow('a recorded track without points of its own');
    const plannedOver = read(
      await mcp.updateTour({ tripId: f.trip.id, placeId: track.id, expected_revision: 1, waypoints: WAYPOINTS }, own),
    );
    expect(plannedOver.tour).toMatchObject({ has_waypoints: true, has_recorded_track: true, max_hiking_difficulty: 2 });

    // A section drawn by hand is planned around in the planner only.
    const ferrata = await makePlace(orm(), f.trip.id, { name: 'Iron path', route_geometry: JSON.stringify(LINE) });
    await makeTour(orm(), ferrata.id, { duration: null });
    const free = {
      kind: 'free',
      geometry: [
        [47.505, 11.1],
        [47.51, 11.1],
      ],
    };
    await addTourWaypoints(orm(), ferrata.id, [
      { lat: 47.5, lng: 11.1 },
      { lat: 47.505, lng: 11.1, fixed_leg: JSON.stringify(free) },
      { lat: 47.51, lng: 11.1 },
    ]);
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId: ferrata.id, expected_revision: 1, max_hiking_difficulty: 3 }, own),
    ).rejects.toThrow('a section drawn by hand');
    // New points would drop the section with the point it starts at.
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId: ferrata.id, expected_revision: 1, waypoints: WAYPOINTS }, own),
    ).rejects.toThrow('a section drawn by hand');
    // A rename keeps it whole, its unknown time included.
    const renamed = read(
      await mcp.updateTour({ tripId: f.trip.id, placeId: ferrata.id, expected_revision: 1, name: 'Iron way' }, own),
    );
    expect(renamed.tour).toMatchObject({ name: 'Iron way', duration: null, revision: 2 });
    expect(renamed.waypoints[1].fixed_leg).toMatchObject({ kind: 'free' });

    expect(read(await mcp.updateTour({ tripId: f.trip.id, placeId: 999999, expected_revision: 1 }, own))).toEqual({
      error: 'Tour not found.',
    });
    const other = await makeTrip(orm(), f.user.id);
    await expect(
      mcp.updateTour({ tripId: other.id, placeId: 1, expected_revision: 1, name: 'X' }, ctx(f.outsider.id)),
    ).resolves.toMatchObject({ isError: true });
  });

  it('HIKE-MCP-014: refuses a change based on an older revision before the router is asked', async () => {
    const f = await fixture();
    const created = await createdHike(f);
    const placeId = created.tour.place_id;
    read(await mcp.updateTour({ tripId: f.trip.id, placeId, expected_revision: 1, name: 'Renamed' }, ctx(f.user.id)));
    plan.mockClear();
    t.realtime.broadcastMock.mockReset();
    const stale = await mcp
      .updateTour({ tripId: f.trip.id, placeId, expected_revision: 1, max_hiking_difficulty: 5 }, ctx(f.user.id))
      .catch((err: unknown) => err);
    expect(stale).toMatchObject({
      publicMessage: 'This tour was changed in the meantime',
      code: 'tour_revision_conflict',
    });
    expect(stale instanceof DomainError && stale.getStatus()).toBe(409);
    expect(plan).not.toHaveBeenCalled();
    expect(t.realtime.broadcastMock).not.toHaveBeenCalled();
    expect(await findRow(orm(), Tours, { place: placeId })).toMatchObject({ revision: 2, max_hiking_difficulty: 2 });
  });

  it('HIKE-MCP-015: a new way without its heights is not saved over a way; a hike waiting for one keeps waiting', async () => {
    const f = await fixture();
    const created = await createdHike(f);
    const placeId = created.tour.place_id;
    plan.mockResolvedValueOnce(flat());
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId, expected_revision: 1, max_hiking_difficulty: 3 }, ctx(f.user.id)),
    ).rejects.toThrow(
      'for the way or for its heights; try again in a moment. Nothing was saved and the hike keeps its way.',
    );
    expect(plan.mock.calls.at(-1)?.[3]).toEqual({ grades: false });
    const place = await findRow(orm(), Places, { id: placeId });
    expect(JSON.parse(String(place?.route_geometry))).toEqual(LINE);
    expect(await findRow(orm(), Tours, { place: placeId })).toMatchObject({ revision: 1, max_hiking_difficulty: 2 });

    plan.mockResolvedValueOnce(unrouted('router_unavailable'));
    const pending = await createdHike(f, { name: 'Pending' });
    plan.mockResolvedValueOnce(flat());
    const still = read(
      await mcp.updateTour(
        { tripId: f.trip.id, placeId: pending.tour.place_id, expected_revision: 1, name: 'Still pending' },
        ctx(f.user.id),
      ),
    );
    expect(still).toMatchObject({ replanned: true, route: { planned: false, why: 'router_unavailable' } });
    expect(still.tour).toMatchObject({ name: 'Still pending', route_pending: true });
    expect((await findRow(orm(), Places, { id: pending.tour.place_id }))?.route_geometry).toBeNull();
  });

  it('HIKE-MCP-016: refuses new points for a hike with stages, and a way through more points than it plans', async () => {
    const f = await fixture();
    const own = ctx(f.user.id);
    const staged = await makePlace(orm(), f.trip.id, { name: 'Two days', route_geometry: JSON.stringify(LINE) });
    await makeTour(orm(), staged.id, { duration: 52 });
    await addTourWaypoints(orm(), staged.id, [
      { lat: 47.5, lng: 11.1 },
      { lat: 47.505, lng: 11.1, stage_end: 1 },
      { lat: 47.51, lng: 11.1 },
    ]);
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId: staged.id, expected_revision: 1, waypoints: WAYPOINTS }, own),
    ).rejects.toThrow('This hike is split into stages over several days');
    // A new limit plans the same points anew, the end of the first stage kept.
    const harder = read(
      await mcp.updateTour(
        { tripId: f.trip.id, placeId: staged.id, expected_revision: 1, max_hiking_difficulty: 4 },
        own,
      ),
    );
    expect(harder.tour).toMatchObject({ max_hiking_difficulty: 4, revision: 2, stage_count: 2 });
    expect(harder.waypoints.map((point: { stage_end?: boolean }) => point.stage_end === true)).toEqual([
      false,
      true,
      false,
    ]);

    // A hike drawn in the planner through more points than a change plans through here.
    const long = await makePlace(orm(), f.trip.id, { name: 'Long', route_geometry: JSON.stringify(LINE) });
    await makeTour(orm(), long.id);
    await addTourWaypoints(
      orm(),
      long.id,
      Array.from({ length: HIKE_PLAN_MAX_WAYPOINTS + 1 }, (_, k) => ({ lat: 47.5 + k / 1000, lng: 11.1 })),
    );
    plan.mockClear();
    await expect(
      mcp.updateTour({ tripId: f.trip.id, placeId: long.id, expected_revision: 1, max_hiking_difficulty: 3 }, own),
    ).rejects.toThrow(`This hike has more than ${HIKE_PLAN_MAX_WAYPOINTS} points`);
    expect(plan).not.toHaveBeenCalled();
    // New points plan it all the same.
    const repointed = read(
      await mcp.updateTour({ tripId: f.trip.id, placeId: long.id, expected_revision: 1, waypoints: WAYPOINTS }, own),
    );
    expect(repointed.waypoints).toHaveLength(3);
  });

  it('HIKE-MCP-017: new points keep the link and the name of a saved point they stand on', async () => {
    const f = await fixture();
    const own = ctx(f.user.id);
    const hut = await makePlace(orm(), f.trip.id, { name: 'Herzogstandhaus', lat: 47.505, lng: 11.1 });
    const hike = await makePlace(orm(), f.trip.id, { name: 'Linked', route_geometry: JSON.stringify(LINE) });
    await makeTour(orm(), hike.id, { duration: 52 });
    await addTourWaypoints(orm(), hike.id, [
      { lat: 47.5, lng: 11.1 },
      { lat: 47.505, lng: 11.1, name: 'Hut', linkedPlace: hut.id },
      { lat: 47.51, lng: 11.1 },
    ]);
    const changed = read(
      await mcp.updateTour(
        {
          tripId: f.trip.id,
          placeId: hike.id,
          expected_revision: 1,
          waypoints: [
            { lat: 47.5, lng: 11.1 },
            { lat: 47.50505, lng: 11.1 },
            { lat: 47.52, lng: 11.1, name: 'Heimgarten' },
          ],
        },
        own,
      ),
    );
    expect(
      changed.waypoints.map((point: { name?: string | null; linked_place_id?: number | null }) => [
        point.name ?? null,
        point.linked_place_id ?? null,
      ]),
    ).toEqual([
      [null, null],
      ['Hut', hut.id],
      ['Heimgarten', null],
    ]);
  });
});

describe('HikePlanMcp: import_tour_gpx', () => {
  it('HIKE-MCP-011: takes in each track of a GPX text as a hike, as the file import does, and tells the whole trip', async () => {
    const f = await fixture();
    const imported = read(
      await mcp.importTourGpx({ tripId: f.trip.id, gpx: GPX, file_name: 'ridge', tour_type: 'hike' }, ctx(f.user.id)),
    );
    expect(imported).toMatchObject({ caution: false, skipped: 0 });
    expect(imported.tours).toHaveLength(1);
    expect(imported.tours[0]).toMatchObject({ name: 'Ridge', tour_type: 'hike', origin: 'gpx', elevation_gain: 200 });
    const tour = await findRow(orm(), Tours, { place: imported.tours[0].place_id });
    expect(tour?.origin_file_name).toBe('ridge.gpx');
    expect(events()).toEqual([
      [String(f.trip.id), 'tours:changed', undefined],
      [String(f.trip.id), 'place:created', undefined],
    ]);

    // The same track again is skipped, as the file import skips it.
    const again = read(
      await mcp.importTourGpx(
        { tripId: f.trip.id, gpx: GPX, file_name: 'ridge.GPX', tour_type: 'hike' },
        ctx(f.user.id),
      ),
    );
    expect(again).toMatchObject({ tours: [], skipped: 1 });
  });

  it('HIKE-MCP-012: refuses a file without a track and fields a type does not take, and writes nothing', async () => {
    const f = await fixture();
    const own = ctx(f.user.id);
    await expect(
      mcp.importTourGpx({ tripId: f.trip.id, gpx: '<gpx><wpt lat="1" lon="2"/></gpx>', tour_type: 'hike' }, own),
    ).rejects.toThrow('No track or route found in GPX file');
    await expect(mcp.importTourGpx({ tripId: f.trip.id, gpx: GPX, tour_type: 'bike' }, own)).rejects.toThrow(
      'a bike import needs bike_profile',
    );
    const bike = read(
      await mcp.importTourGpx({ tripId: f.trip.id, gpx: GPX, tour_type: 'bike', bike_profile: 'gravel' }, own),
    );
    expect(bike.tours[0]).toMatchObject({ tour_type: 'bike', bike_profile: 'gravel' });
    const rows = await findRows(orm(), Tours, {});
    expect(rows.map((row) => row.origin_file_name)).toEqual(['import.gpx']);
  });
});
