/**
 * ToursMcp (P2D-MCP-01): the saved tours of a trip, read only, over the same
 * services the REST list, detail and city walk visits (CW-09) use. The suite
 * takes its subject from the container over a snapshot test db; the addon gate
 * of the tools is the registry's and is covered with the other addon-gated tools.
 */
import { Places } from '../../../src/db/entities/Places.entity';
import { TourStationVisits } from '../../../src/db/entities/TourStationVisits.entity';
import { TourWaypoints } from '../../../src/db/entities/TourWaypoints.entity';
import { Tours } from '../../../src/db/entities/Tours.entity';
import type { McpContext } from '../../../src/nest-mcp';
import { getEntry, type ClassRef } from '../../../src/nest-mcp/metadata';
import { PlacesMcp } from '../../../src/nest/places/places.mcp';
import { TourLibraryMcp } from '../../../src/nest/tours/tour-library.mcp';
import { TOUR_PLAN_LINE_POINTS } from '../../../src/nest/tours/tour-plan-read';
import { TourVisitsService } from '../../../src/nest/tours/tour-visits.service';
import { ToursMcp } from '../../../src/nest/tours/tours.mcp';
import { ToursModule } from '../../../src/nest/tours/tours.module';
import { ToursService } from '../../../src/nest/tours/tours.service';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import {
  addTripMember,
  createDay,
  createDayAssignment,
  createPlace,
  createTrip,
  createUser,
} from '../../helpers/factories';
import { makeDayAssignment } from '../../helpers/factories/itinerary';
import { makePlace } from '../../helpers/factories/places';
import { countRows, findRow, insertRows, updateRows } from '../../helpers/factories/rows';
import { addTourWaypoints, makeTour, markStationVisit } from '../../helpers/factories/tours';
import { resetTestDb } from '../../helpers/test-db';
import { createTestModule, type TestModule } from '../../helpers/test-module';
import { createTestOrm } from '../../helpers/test-orm';
import { createTour } from '../../helpers/tours-repos';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = createSnapshotTestDb();
let t: TestModule;
let mcp: ToursMcp;

beforeAll(async () => {
  t = await createTestModule({ db, imports: [ToursModule] });
  mcp = t.get(ToursMcp);
});
beforeEach(() => resetTestDb(db));
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

function fixture() {
  const { user } = createUser(db);
  const { user: outsider } = createUser(db);
  const { user: member } = createUser(db);
  const trip = createTrip(db, user.id);
  addTripMember(db, trip.id, member.id);
  const day1 = createDay(db, trip.id, { day_number: 1, date: '2026-07-10', title: 'Arrive' });
  const day2 = createDay(db, trip.id, { day_number: 2, date: '2026-07-11' });
  const ridge = createPlace(db, trip.id, { name: 'Ridge' });
  createTour(db, ridge.id, { distance: 8.2, max_hiking_difficulty: 3 });
  const gorge = createPlace(db, trip.id, { name: 'Gorge' });
  createTour(db, gorge.id);
  const cafe = createPlace(db, trip.id, { name: 'Cafe' });
  createDayAssignment(db, day2.id, ridge.id);
  createDayAssignment(db, day1.id, ridge.id);
  createDayAssignment(db, day1.id, cafe.id);
  return { user, outsider, member, trip, day1, day2, ridge, gorge };
}

describe('ToursMcp', () => {
  it('TOURS-MCP-001: list_tours lists the tours of the trip with their days in day order, no other place', async () => {
    const { user, trip, day1, day2, ridge, gorge } = fixture();
    const { tours } = read(await mcp.listTours({ tripId: trip.id }, ctx(user.id)));
    expect(tours.map((tour: { place_id: number }) => tour.place_id).sort()).toEqual([ridge.id, gorge.id].sort());
    const listedRidge = tours.find((tour: { place_id: number }) => tour.place_id === ridge.id);
    expect(listedRidge).toMatchObject({ name: 'Ridge', origin: expect.any(String), max_hiking_difficulty: 3 });
    expect(listedRidge.days).toEqual([
      { day_id: day1.id, day_number: 1, date: '2026-07-10', title: 'Arrive' },
      { day_id: day2.id, day_number: 2, date: '2026-07-11', title: null },
    ]);
    expect(tours.find((tour: { place_id: number }) => tour.place_id === gorge.id).days).toEqual([]);
  });

  it('TOURS-MCP-002: get_tour_plan reads one tour with its control points, provenance and days, without the track', async () => {
    const { member, trip, ridge } = fixture();
    const plan = read(await mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id }, ctx(member.id)));
    expect(plan.tour).toMatchObject({ place_id: ridge.id, name: 'Ridge' });
    expect(plan.tour.days).toHaveLength(2);
    expect(Array.isArray(plan.waypoints)).toBe(true);
    expect(plan.provenance).toMatchObject({ origin: expect.any(String), source: { kind: expect.any(String) } });
    expect(JSON.stringify(plan)).not.toContain('route_geometry');
  });

  it('TOURS-MCP-003: find_tours_for_day lists only the tours on that day', async () => {
    const { user, trip, day1, day2, ridge } = fixture();
    expect(
      read(await mcp.findToursForDay({ tripId: trip.id, dayId: day1.id }, ctx(user.id))).tours.map(
        (tour: { place_id: number }) => tour.place_id,
      ),
    ).toEqual([ridge.id]);
    expect(read(await mcp.findToursForDay({ tripId: trip.id, dayId: day2.id + 1000 }, ctx(user.id))).tours).toEqual([]);
  });

  it('TOURS-MCP-004: someone outside the trip learns nothing, and a place that is no tour is not found', async () => {
    const { user, outsider, trip, ridge } = fixture();
    for (const result of [
      await mcp.listTours({ tripId: trip.id }, ctx(outsider.id)),
      await mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id }, ctx(outsider.id)),
      await mcp.findToursForDay({ tripId: trip.id, dayId: 1 }, ctx(outsider.id)),
    ]) {
      expect(read(result)).toEqual({ error: 'Trip not found or access denied.' });
    }
    const cafe = createPlace(db, trip.id, { name: 'Plain' });
    expect(read(await mcp.getTourPlan({ tripId: trip.id, placeId: cafe.id }, ctx(user.id)))).toEqual({
      error: 'Tour not found.',
    });
  });

  it('TOURS-MCP-005: a failure other than a missing tour is not passed off as not found', async () => {
    const { user, trip, ridge } = fixture();
    const failure = new Error('database gone');
    const getTour = vi.spyOn(t.get(ToursService), 'getTour').mockRejectedValueOnce(failure);
    try {
      await expect(mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id }, ctx(user.id))).rejects.toBe(failure);
    } finally {
      getTour.mockRestore();
    }
  });

  it('TOURS-MCP-006: export_tour_gpx hands over the saved line as GPX, and only to someone who sees the trip', async () => {
    const { user, member, outsider, trip, ridge, gorge } = fixture();
    const orm = await createTestOrm(db);
    await updateRows(
      orm,
      Places,
      { id: ridge.id },
      {
        route_geometry: JSON.stringify([
          [47, 11, 600],
          [47.01, 11.01, 650],
        ]),
      },
    );
    await orm.close();
    const exported = read(await mcp.exportTourGpx({ tripId: trip.id, placeId: ridge.id }, ctx(member.id)));
    expect(exported.filename).toBe('Ridge.gpx');
    expect(exported.gpx).toContain('<type>hiking</type>');
    expect(exported.gpx.match(/<trkpt /g)).toHaveLength(2);
    // The registry answers a DomainError with its message; called directly, the tool lets it through.
    await expect(mcp.exportTourGpx({ tripId: trip.id, placeId: gorge.id }, ctx(user.id))).rejects.toThrow(
      'This tour has no route to export',
    );
    expect(read(await mcp.exportTourGpx({ tripId: trip.id, placeId: ridge.id }, ctx(outsider.id)))).toEqual({
      error: 'Trip not found or access denied.',
    });
    const cafe = createPlace(db, trip.id, { name: 'Plain' });
    expect(read(await mcp.exportTourGpx({ tripId: trip.id, placeId: cafe.id }, ctx(user.id)))).toEqual({
      error: 'Tour not found.',
    });
  });

  it('TOURS-MCP-007: get_tour_plan names the place a control point stands for (PR1-10)', async () => {
    const { user, trip, ridge } = fixture();
    const hut = createPlace(db, trip.id, { name: 'Hut' });
    const orm = await createTestOrm(db);
    await insertRows(orm, TourWaypoints, [
      { place: ridge.id, lat: 47, lng: 11, role: 'start', sequence: 0, linkedPlace: hut.id },
      { place: ridge.id, lat: 47.1, lng: 11.1, role: 'end', sequence: 1 },
    ]);
    await orm.close();
    const plan = read(await mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id }, ctx(user.id)));
    expect(plan.waypoints[0]).toMatchObject({ linked_place_id: hut.id, linked_place_name: 'Hut' });
    expect(plan.waypoints[1].linked_place_name).toBeUndefined();
  });

  /** CW-09: a city walk on day 1 with three stops, the first visited and the second skipped that day. */
  async function walkFixture() {
    const base = fixture();
    const orm = await createTestOrm(db);
    const walk = await makePlace(orm, base.trip.id, { name: 'Old town' });
    await makeTour(orm, walk.id, { tourTypeRef: 'walk', duration: 80 });
    await addTourWaypoints(orm, walk.id, [
      { lat: 48.1, lng: 11.5, station_key: 'stop-cathedral', name: 'Cathedral', stay_minutes: 30 },
      { lat: 48.11, lng: 11.51, station_key: 'stop-market', stay_minutes: 20 },
      { lat: 48.12, lng: 11.52, station_key: 'stop-park', importance: 'must', opening_hours: 'Mo-Su 09:00-18:00' },
    ]);
    const onDay1 = await makeDayAssignment(orm, base.day1.id, walk.id);
    await markStationVisit(orm, onDay1.id, 'stop-cathedral', 'visited');
    await markStationVisit(orm, onDay1.id, 'stop-market', 'skipped');
    await orm.close();
    return { ...base, walk, onDay1 };
  }

  it('TOURS-MCP-008: get_city_walk_progress reads the stations of a walk with their status that day, and changes nothing', async () => {
    const { member, trip, day1, walk, onDay1 } = await walkFixture();
    const orm = await createTestOrm(db);
    const before = await countRows(orm, TourStationVisits, {});
    const progress = read(
      await mcp.getCityWalkProgress({ tripId: trip.id, placeId: walk.id, dayId: day1.id }, ctx(member.id)),
    );
    expect(progress).toMatchObject({ place_id: walk.id, day_id: day1.id, assignment_id: onDay1.id });
    expect(
      progress.stations.map((station: { name: string | null; status: string }) => [station.name, station.status]),
    ).toEqual([
      ['Cathedral', 'visited'],
      [null, 'skipped'],
      [null, 'planned'],
    ]);
    expect(progress.open).toEqual({ stations: 1, stay_minutes_known: 0, stays_unknown: 1 });
    expect(progress.walking_minutes).toBe(80);
    expect(await countRows(orm, TourStationVisits, {})).toBe(before);
    await orm.close();
  });

  it('TOURS-MCP-009: someone outside the trip learns nothing, and a day without the walk names no walk', async () => {
    const { user, outsider, trip, day1, day2, ridge, walk } = await walkFixture();
    expect(
      read(await mcp.getCityWalkProgress({ tripId: trip.id, placeId: walk.id, dayId: day1.id }, ctx(outsider.id))),
    ).toEqual({ error: 'Trip not found or access denied.' });
    const orm = await createTestOrm(db);
    const cafe = await makePlace(orm, trip.id, { name: 'Plain' });
    await makeDayAssignment(orm, day1.id, cafe.id);
    await orm.close();
    const notThere = [
      { placeId: walk.id, dayId: day2.id },
      { placeId: ridge.id, dayId: day1.id },
      { placeId: cafe.id, dayId: day1.id },
    ];
    const answers = await notThere.reduce<Promise<unknown[]>>(
      async (done, args) => [
        ...(await done),
        read(await mcp.getCityWalkProgress({ tripId: trip.id, ...args }, ctx(user.id))),
      ],
      Promise.resolve([]),
    );
    expect(answers).toEqual(notThere.map(() => ({ error: 'No city walk of this trip is on that day.' })));
  });

  it('TOURS-MCP-010: a failure other than a missing walk is not passed off as no walk', async () => {
    const { user, trip, day1, walk } = await walkFixture();
    const failure = new Error('database gone');
    const progress = vi.spyOn(t.get(TourVisitsService), 'progress').mockRejectedValueOnce(failure);
    try {
      await expect(
        mcp.getCityWalkProgress({ tripId: trip.id, placeId: walk.id, dayId: day1.id }, ctx(user.id)),
      ).rejects.toBe(failure);
    } finally {
      progress.mockRestore();
    }
  });

  it("TOURS-MCP-011: get_tour_plan spells out every field of a city walk's stations, and leaves its other points and a hike as stored", async () => {
    const { user, trip, ridge } = fixture();
    const orm = await createTestOrm(db);
    const walk = await makePlace(orm, trip.id, { name: 'Loop' });
    await makeTour(orm, walk.id, { tourTypeRef: 'walk' });
    await addTourWaypoints(orm, walk.id, [
      {
        lat: 48.1,
        lng: 11.5,
        station_key: 'stop-gate',
        name: 'Gate',
        stay_minutes: 15,
        importance: 'optional',
        protected: 1,
        opening_hours: 'Mo-Su 08:00-20:00',
      },
      { lat: 48.105, lng: 11.505, station_key: 'shape-1', shaping: 1 },
      { lat: 48.11, lng: 11.51, station_key: 'stop-bare' },
      { lat: 48.1, lng: 11.5, station_key: 'stop-back' },
    ]);
    await addTourWaypoints(orm, ridge.id, [
      { lat: 47, lng: 11 },
      { lat: 47.1, lng: 11.1 },
    ]);
    await orm.close();

    const plan = read(await mcp.getTourPlan({ tripId: trip.id, placeId: walk.id }, ctx(user.id)));
    const fields = ['key', 'name', 'stay_minutes', 'importance', 'protected', 'opening_hours'] as const;
    const spelled = (point: Record<string, unknown>) => fields.map((field) => point[field]);
    expect(spelled(plan.waypoints[0])).toEqual(['stop-gate', 'Gate', 15, 'optional', true, 'Mo-Su 08:00-20:00']);
    expect(spelled(plan.waypoints[2])).toEqual(['stop-bare', null, null, null, false, null]);
    // A shaping point and the way back of a loop are no stations: as stored.
    expect('stay_minutes' in plan.waypoints[1] || 'protected' in plan.waypoints[1]).toBe(false);
    expect('stay_minutes' in plan.waypoints[3] || 'protected' in plan.waypoints[3]).toBe(false);
    const hike = read(await mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id }, ctx(user.id)));
    expect(hike.waypoints.some((point: object) => 'stay_minutes' in point || 'protected' in point)).toBe(false);
  });

  it("TOURS-MCP-012: list_tours counts a walk's stations and says while its way waits to be planned", async () => {
    const { user, trip, walk, gorge } = await walkFixture();
    const listed = async () => {
      const { tours } = read(await mcp.listTours({ tripId: trip.id }, ctx(user.id)));
      return new Map(tours.map((tour: { place_id: number }) => [tour.place_id, tour]));
    };
    expect((await listed()).get(walk.id)).toMatchObject({ station_count: 3, route_pending: true });
    // A tour without points has nothing to plan a way between.
    expect((await listed()).get(gorge.id)).toMatchObject({ station_count: null, route_pending: false });
    const orm = await createTestOrm(db);
    await updateRows(
      orm,
      Places,
      { id: walk.id },
      {
        route_geometry: JSON.stringify([
          [48.1, 11.5, 520],
          [48.12, 11.52, 530],
        ]),
      },
    );
    await orm.close();
    expect((await listed()).get(walk.id)).toMatchObject({ station_count: 3, route_pending: false });
  });

  it('TOURS-MCP-013: get_city_walk_progress names each station by its key and gives its opening hours', async () => {
    const { member, trip, day1, walk } = await walkFixture();
    const { stations } = read(
      await mcp.getCityWalkProgress({ tripId: trip.id, placeId: walk.id, dayId: day1.id }, ctx(member.id)),
    );
    expect(
      stations.map((station: { key: string; opening_hours: string | null }) => [station.key, station.opening_hours]),
    ).toEqual([
      ['stop-cathedral', null],
      ['stop-market', null],
      ['stop-park', 'Mo-Su 09:00-18:00'],
    ]);
  });

  it('TOURS-MCP-015: list_tours counts the stages of a multi-day tour and get_tour_plan marks where each ends (MDT-01)', async () => {
    const { user, trip, ridge, gorge } = fixture();
    const orm = await createTestOrm(db);
    await addTourWaypoints(orm, ridge.id, [
      { lat: 47, lng: 11 },
      { lat: 47.05, lng: 11.05, stage_end: 1 },
      { lat: 47.1, lng: 11.1, stage_end: 1 },
      { lat: 47.15, lng: 11.15 },
    ]);
    await orm.close();

    const { tours } = read(await mcp.listTours({ tripId: trip.id }, ctx(user.id)));
    const stages = new Map(
      tours.map((tour: { place_id: number; stage_count: number | null }) => [tour.place_id, tour.stage_count]),
    );
    expect(stages.get(ridge.id)).toBe(3);
    expect(stages.get(gorge.id)).toBeNull();
    const plan = read(await mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id }, ctx(user.id)));
    expect(plan.waypoints.map((point: { stage_end?: boolean }) => point.stage_end === true)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it('TOURS-MCP-014: the tools name the station fields, and the deletes ask before a walk takes its protected stations along', () => {
    const description = (ctor: unknown, method: string) => {
      const entry = getEntry(ctor as ClassRef, method);
      if (!entry || entry.kind !== 'tool') throw new Error(`${method} is no MCP tool`);
      return entry.options.description ?? '';
    };
    expect(description(ToursMcp, 'listTours')).toMatch(/station_count.*route_pending/);
    expect(description(ToursMcp, 'listTours')).toContain('stage_count');
    expect(description(ToursMcp, 'getTourPlan')).toContain('stage_end');
    const planFields = ['key', 'stay_minutes', 'importance', 'protected', 'opening_hours', 'visit_status', 'derived'];
    for (const field of planFields) {
      expect(description(ToursMcp, 'getTourPlan')).toContain(field);
    }
    expect(description(ToursMcp, 'getCityWalkProgress')).toMatch(/key .*opening hours/);
    expect(description(ToursMcp, 'searchTourPois')).toContain('route_pending');
    expect(description(ToursMcp, 'searchTourPois')).toMatch(/best known places.*highlight: true/);
    expect(description(TourLibraryMcp, 'takeOverTour')).toContain('protection');
    for (const method of ['deletePlace', 'bulkDeletePlaces']) {
      expect(description(PlacesMcp, method)).toContain(
        'protected ones included: name those to the traveller and ask first',
      );
    }
  });

  /** MCP-T01: a hike at revision 4 over a saved line of 450 points, a routed leg, a via ferrata and a free leg. */
  async function legsFixture() {
    const base = fixture();
    const orm = await createTestOrm(db);
    const hike = await makePlace(orm, base.trip.id, { name: 'Crest' });
    await makeTour(orm, hike.id, { revision: 4, distance: 12.5 });
    const line = Array.from({ length: 450 }, (_, index) => [47 + index * 0.0001, 11, 900 + index]);
    await updateRows(orm, Places, { id: hike.id }, { route_geometry: JSON.stringify(line) });
    const ferrata = {
      kind: 'ferrata',
      ref: 'way/77',
      name: 'Iron path',
      geometry: [
        [47.01, 11],
        [47.02, 11],
      ],
    };
    const free = {
      kind: 'free',
      geometry: [
        [47.02, 11],
        [47.02, 11.01],
      ],
    };
    await addTourWaypoints(orm, hike.id, [
      { lat: 47, lng: 11, station_key: 'pt-start' },
      { lat: 47.01, lng: 11, station_key: 'pt-wall', fixed_leg: JSON.stringify(ferrata) },
      { lat: 47.02, lng: 11, station_key: 'pt-lake', fixed_leg: JSON.stringify(free) },
      { lat: 47.02, lng: 11.01, station_key: 'pt-end' },
    ]);
    await orm.close();
    return { ...base, hike };
  }

  it('TOURS-MCP-015: get_tour_plan answers each leg with how its line came to be, a fixed one with its own length', async () => {
    const { member, trip, hike } = await legsFixture();
    const plan = read(await mcp.getTourPlan({ tripId: trip.id, placeId: hike.id }, ctx(member.id)));
    expect(plan.tour).toMatchObject({ place_id: hike.id, tour_type: 'hike', revision: 4, distance: 12.5 });
    expect(plan.waypoints.map((point: { key: string }) => point.key)).toEqual([
      'pt-start',
      'pt-wall',
      'pt-lake',
      'pt-end',
    ]);
    expect(plan.legs).toEqual([
      expect.objectContaining({ from_key: 'pt-start', to_key: 'pt-wall', kind: 'routed', name: null, length_km: null }),
      expect.objectContaining({ from_sequence: 1, to_sequence: 2, kind: 'ferrata', name: 'Iron path' }),
      expect.objectContaining({ from_key: 'pt-lake', to_key: 'pt-end', kind: 'free', name: null }),
    ]);
    expect(plan.legs[1].length_km).toBeCloseTo(1.11, 1);
    expect(plan.legs[2].length_km).toBeCloseTo(0.76, 1);
    // A hike carries no city walk fields at all.
    expect('run' in plan).toBe(false);
    expect(plan.waypoints.some((point: object) => 'visit_status' in point)).toBe(false);
  });

  it('TOURS-MCP-016: get_tour_plan gives the saved line in brief and names what it worked out, and reading moves no revision', async () => {
    const { user, trip, hike } = await legsFixture();
    const plan = read(await mcp.getTourPlan({ tripId: trip.id, placeId: hike.id }, ctx(user.id)));
    expect(plan.line).toMatchObject({ point_count: 450, has_heights: true });
    expect(plan.line.preview).toHaveLength(TOUR_PLAN_LINE_POINTS);
    expect(plan.line.preview[0]).toEqual([47, 11, 900]);
    expect(plan.line.preview.at(-1)).toEqual([47 + 449 * 0.0001, 11, 1349]);
    expect(plan.derived).toEqual(expect.arrayContaining(['legs[].length_km', 'line.preview', 'tour.caution']));
    // Stored facts are never listed as worked out: the points are its own, the distance was saved.
    expect(plan.derived).not.toContain('waypoints');
    expect(plan.derived).not.toContain('tour.distance');
    expect(plan.derived.some((field: string) => field.startsWith('tour.station') || field === 'run.open')).toBe(false);
    const orm = await createTestOrm(db);
    expect((await findRow(orm, Tours, { place: hike.id }))?.revision).toBe(4);
    await orm.close();
  });

  it('TOURS-MCP-017: an import without control points answers the ends of its track as worked out and its leg as track, a tour without a line none', async () => {
    const { user, trip, ridge, gorge } = fixture();
    const orm = await createTestOrm(db);
    const track = [
      [47, 11],
      [47.005, 11.005],
      [47.01, 11.01],
    ];
    await updateRows(orm, Places, { id: ridge.id }, { route_geometry: JSON.stringify(track) });
    await orm.close();
    const plan = read(await mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id }, ctx(user.id)));
    expect(plan.waypoints.map((point: { lat: number; key?: string }) => [point.lat, point.key])).toEqual([
      [47, undefined],
      [47.01, undefined],
    ]);
    expect(plan.legs).toEqual([
      { from_sequence: 0, to_sequence: 1, from_key: null, to_key: null, kind: 'track', name: null, length_km: null },
    ]);
    expect(plan.line).toEqual({ point_count: 3, has_heights: false, preview: track });
    expect(plan.derived).toContain('waypoints');
    const bare = read(await mcp.getTourPlan({ tripId: trip.id, placeId: gorge.id }, ctx(user.id)));
    expect(bare).toMatchObject({ waypoints: [], legs: [], line: null });
    expect(bare.derived).not.toContain('line.preview');
  });

  it('TOURS-MCP-018: a city walk read for one of its days carries the visits of that day, and of no other', async () => {
    const { member, trip, day1, day2, walk, onDay1 } = await walkFixture();
    const orm = await createTestOrm(db);
    await makeDayAssignment(orm, day2.id, walk.id);
    const before = await countRows(orm, TourStationVisits, {});
    const plan = async (dayId?: number) =>
      read(await mcp.getTourPlan({ tripId: trip.id, placeId: walk.id, dayId }, ctx(member.id)));
    const statuses = (answer: { waypoints: Array<{ key: string; visit_status: string | null }> }) =>
      answer.waypoints.map((point) => [point.key, point.visit_status]);

    const first = await plan(day1.id);
    expect(statuses(first)).toEqual([
      ['stop-cathedral', 'visited'],
      ['stop-market', 'skipped'],
      ['stop-park', 'planned'],
    ]);
    expect(first.run).toEqual({
      day_id: day1.id,
      assignment_id: onDay1.id,
      open: { stations: 1, stay_minutes_known: 0, stays_unknown: 1 },
    });
    expect(first.derived).toEqual(expect.arrayContaining(['tour.station_count', 'run.open']));
    // The same walk on another day keeps its own visits: none were made there.
    expect(statuses(await plan(day2.id)).map(([, status]) => status)).toEqual(['planned', 'planned', 'planned']);
    // Without a day no visit is told, rather than the visits of one day passed off as the walk's.
    const undated = await plan();
    expect(undated.run).toBeNull();
    expect(statuses(undated).map(([, status]) => status)).toEqual([null, null, null]);
    expect(undated.derived).not.toContain('run.open');
    expect(await countRows(orm, TourStationVisits, {})).toBe(before);
    await orm.close();
  });

  it('TOURS-MCP-019: a day is read for a city walk only, and only for a day it is on', async () => {
    const { user, trip, day1, day2, ridge, walk } = await walkFixture();
    expect(read(await mcp.getTourPlan({ tripId: trip.id, placeId: ridge.id, dayId: day1.id }, ctx(user.id)))).toEqual({
      error: 'Only a city walk keeps visits for a day: read this tour without dayId.',
    });
    expect(read(await mcp.getTourPlan({ tripId: trip.id, placeId: walk.id, dayId: day2.id }, ctx(user.id)))).toEqual({
      error: 'This city walk is not on that day.',
    });
    const failure = new Error('database gone');
    const progress = vi.spyOn(t.get(TourVisitsService), 'progress').mockRejectedValueOnce(failure);
    try {
      await expect(mcp.getTourPlan({ tripId: trip.id, placeId: walk.id, dayId: day1.id }, ctx(user.id))).rejects.toBe(
        failure,
      );
    } finally {
      progress.mockRestore();
    }
  });

  it('TOURS-MCP-020: list_tours names the winter label of a hike, and says it is only a label (HIK-01)', async () => {
    const { user, trip, ridge, gorge } = fixture();
    const orm = await createTestOrm(db);
    await updateRows(orm, Tours, { place: ridge.id }, { winter_activity: 'snowshoe' });
    await orm.close();
    const { tours } = read(await mcp.listTours({ tripId: trip.id }, ctx(user.id)));
    const byId = new Map(tours.map((tour: { place_id: number }) => [tour.place_id, tour]));
    expect(byId.get(ridge.id)).toMatchObject({ tour_type: 'hike', winter_activity: 'snowshoe' });
    expect(byId.get(gorge.id)).toMatchObject({ winter_activity: null });
    const entry = getEntry(ToursMcp as unknown as ClassRef, 'listTours');
    const description = entry?.kind === 'tool' ? (entry.options.description ?? '') : '';
    expect(description).toMatch(/winter_activity: winter_hike or snowshoe/);
    expect(description).toContain('never a statement that a way can be walked in winter');
  });

  it('TOURS-MCP-021: list_tours names a run with its profile and pace, and says its time is a plan at that pace only (RUN-01)', async () => {
    const { user, trip, ridge, gorge } = fixture();
    const orm = await createTestOrm(db);
    await updateRows(
      orm,
      Tours,
      { place: ridge.id },
      { tourTypeRef: 'run', max_hiking_difficulty: null, run_profile: 'running', run_pace_seconds_per_km: 360 },
    );
    await orm.close();
    const { tours } = read(await mcp.listTours({ tripId: trip.id }, ctx(user.id)));
    const byId = new Map(tours.map((tour: { place_id: number }) => [tour.place_id, tour]));
    expect(byId.get(ridge.id)).toMatchObject({ tour_type: 'run', run_profile: 'running', run_pace_seconds_per_km: 360 });
    expect(byId.get(gorge.id)).toMatchObject({ run_profile: null, run_pace_seconds_per_km: null });
    const entry = getEntry(ToursMcp as unknown as ClassRef, 'listTours');
    const description = entry?.kind === 'tool' ? (entry.options.description ?? '') : '';
    expect(description).toMatch(/run_profile: running/);
    expect(description).toContain('no climb, descent or difficulty is in it');
    expect(description).toContain('never a recorded time');
  });

  it('TOURS-MCP-022: list_tours names a trail run as such, and its profile as a routing preference only (RUN-02)', async () => {
    const { user, trip, ridge } = fixture();
    const orm = await createTestOrm(db);
    await updateRows(
      orm,
      Tours,
      { place: ridge.id },
      { tourTypeRef: 'run', max_hiking_difficulty: null, run_profile: 'trail', run_pace_seconds_per_km: 450 },
    );
    await orm.close();
    const { tours } = read(await mcp.listTours({ tripId: trip.id }, ctx(user.id)));
    const listed = tours.find((tour: { place_id: number }) => tour.place_id === ridge.id);
    expect(listed).toMatchObject({ tour_type: 'run', run_profile: 'trail', run_pace_seconds_per_km: 450 });
    const entry = getEntry(ToursMcp as unknown as ClassRef, 'listTours');
    const description = entry?.kind === 'tool' ? (entry.options.description ?? '') : '';
    expect(description).toContain('trail for forest tracks and natural paths up to mountain paths (T2)');
    expect(description).toContain('never a statement that a way can be run');
  });

  it('TOURS-MCP-023: list_tours names a ski track with its discipline and technique, and says it is kept as recorded (SKI-02)', async () => {
    const { user, trip, ridge, gorge } = fixture();
    const orm = await createTestOrm(db);
    await updateRows(
      orm,
      Tours,
      { place: ridge.id },
      { tourTypeRef: 'ski', max_hiking_difficulty: null, ski_discipline: 'cross_country', ski_technique: 'skating' },
    );
    await orm.close();
    const { tours } = read(await mcp.listTours({ tripId: trip.id }, ctx(user.id)));
    const byId = new Map(tours.map((tour: { place_id: number }) => [tour.place_id, tour]));
    expect(byId.get(ridge.id)).toMatchObject({
      tour_type: 'ski',
      ski_discipline: 'cross_country',
      ski_technique: 'skating',
    });
    expect(byId.get(gorge.id)).toMatchObject({ ski_discipline: null, ski_technique: null });
    const entry = getEntry(ToursMcp as unknown as ClassRef, 'listTours');
    const description = entry?.kind === 'tool' ? (entry.options.description ?? '') : '';
    expect(description).toMatch(/ski_discipline: alpine, snowboard, cross_country or touring/);
    expect(description).toContain('never routed');
    expect(description).toContain('it has no ski time worked out');
    expect(description).toContain('nothing in it says anything about snow, avalanches');
  });
});
