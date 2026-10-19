/**
 * ToursMcp (P2D-MCP-01): the saved tours of a trip, read only, over the same
 * services the REST list, detail and city walk visits (CW-09) use. The suite
 * takes its subject from the container over a snapshot test db; the addon gate
 * of the tools is the registry's and is covered with the other addon-gated tools.
 */
import { Places } from '../../../src/db/entities/Places.entity';
import { TourStationVisits } from '../../../src/db/entities/TourStationVisits.entity';
import { TourWaypoints } from '../../../src/db/entities/TourWaypoints.entity';
import type { McpContext } from '../../../src/nest-mcp';
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
import { countRows, insertRows, updateRows } from '../../helpers/factories/rows';
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
    const walk = createPlace(db, base.trip.id, { name: 'Old town' });
    const orm = await createTestOrm(db);
    await makeTour(orm, walk.id, { tourTypeRef: 'walk', duration: 80 });
    await addTourWaypoints(orm, walk.id, [
      { lat: 48.1, lng: 11.5, station_key: 'stop-cathedral', name: 'Cathedral', stay_minutes: 30 },
      { lat: 48.11, lng: 11.51, station_key: 'stop-market', stay_minutes: 20 },
      { lat: 48.12, lng: 11.52, station_key: 'stop-park', importance: 'must' },
    ]);
    const onDay1 = createDayAssignment(db, base.day1.id, walk.id);
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
    const cafe = createPlace(db, trip.id, { name: 'Plain' });
    createDayAssignment(db, day1.id, cafe.id);
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
});
