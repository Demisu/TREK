/**
 * ToursService and city walks (CW-01 to CW-03): every point of a save keeps a
 * key, a walk lists how many stations it has, and the visits of its stations
 * follow the stations through an edit, never into a copy. The services come
 * out of ToursModule over a snapshot test db; rows are seeded and read
 * through the ORM factories.
 */
import { TourStationVisits } from '../../../src/db/entities/TourStationVisits.entity';
import { TourWaypoints } from '../../../src/db/entities/TourWaypoints.entity';
import { JourneyDomainService } from '../../../src/nest/journey/journey-domain.service';
import { TourVisitsService } from '../../../src/nest/tours/tour-visits.service';
import { ToursModule } from '../../../src/nest/tours/tours.module';
import { ToursService } from '../../../src/nest/tours/tours.service';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import { makeDayAssignment } from '../../helpers/factories/itinerary';
import { countRows, findRows } from '../../helpers/factories/rows';
import { markStationVisit } from '../../helpers/factories/tours';
import { makeDay, makeTrip } from '../../helpers/factories/trips';
import { makeUser } from '../../helpers/factories/users';
import { resetTestDb } from '../../helpers/test-db';
import { createTestModule, type TestModule } from '../../helpers/test-module';
import { MikroORM } from '@mikro-orm/core';
import { stationKeySchema, tourCreateRequestSchema, type TourCreateInput, type TourWaypoint } from '@trek/shared';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = createSnapshotTestDb();
let t: TestModule;
let tours: ToursService;
let visits: TourVisitsService;
const orm = () => t.get(MikroORM);

beforeAll(async () => {
  t = await createTestModule({
    db,
    imports: [ToursModule],
    overrides: [
      {
        provide: JourneyDomainService,
        useValue: { onPlaceCreated: vi.fn(async () => undefined), onPlaceUpdated: vi.fn(async () => undefined) },
      },
    ],
  });
  tours = t.get(ToursService);
  visits = t.get(TourVisitsService);
});
beforeEach(() => {
  resetTestDb(db);
  t.realtime.broadcastMock.mockReset();
});
afterAll(async () => {
  await t.close();
  db.close();
});

const GEOMETRY: Array<[number, number, number]> = [
  [48.1, 11.5, 520],
  [48.11, 11.51, 525],
  [48.12, 11.52, 530],
  [48.13, 11.53, 528],
];

/** Three stops and a shaping point: a cathedral with a key of its own, a market passed through and a park. */
const STATIONS: TourWaypoint[] = [
  {
    lat: 48.1,
    lng: 11.5,
    role: 'start',
    sequence: 0,
    key: 'stop-cathedral',
    name: 'Cathedral',
    stay_minutes: 30,
    importance: 'must',
    protected: true,
    opening_hours: 'Mo-Su 09:00-18:00',
  },
  { lat: 48.105, lng: 11.505, role: 'via', sequence: 1, shaping: true },
  { lat: 48.11, lng: 11.51, role: 'via', sequence: 2, name: 'Market', stay_minutes: 0 },
  { lat: 48.13, lng: 11.53, role: 'end', sequence: 3, name: 'Park', importance: 'optional' },
];

const walkBody = (overrides: Partial<TourCreateInput> = {}) =>
  tourCreateRequestSchema.parse({
    name: 'Old town',
    tour_type: 'walk',
    route_geometry: GEOMETRY,
    waypoints: STATIONS,
    duration_seconds: 3600,
    ...overrides,
  });

/** A trip with two days, as its owner sees it. */
async function tripWithDays() {
  const { user } = await makeUser(orm());
  const trip = await makeTrip(orm(), user.id);
  const day1 = await makeDay(orm(), trip.id, { day_number: 1 });
  const day2 = await makeDay(orm(), trip.id, { day_number: 2 });
  return { tripId: String(trip.id), day1, day2 };
}

/** The keys of a tour's points as stored, in route order. */
const storedKeys = async (placeId: number) =>
  (await findRows(orm(), TourWaypoints, { place: placeId }, { sequence: 'asc' })).map((point) => point.station_key);

describe('ToursService and city walks', () => {
  it('TOURS-WALK-001: a walk keeps a key it was sent, gives the other points one, and counts its stations', async () => {
    const { tripId } = await tripWithDays();
    const created = await tours.createTour(tripId, walkBody());
    const placeId = created.tour.place_id;

    const keys = created.waypoints.map((point) => point.key);
    expect(keys[0]).toBe('stop-cathedral');
    for (const key of keys) expect(stationKeySchema.safeParse(key).success).toBe(true);
    expect(new Set(keys).size).toBe(4);
    expect(await storedKeys(placeId)).toEqual(keys);
    expect(created.waypoints[0]).toEqual({ ...STATIONS[0] });
    expect(created.waypoints[2]).toMatchObject({ name: 'Market', stay_minutes: 0 });
    expect(created.tour).toMatchObject({ tour_type: 'walk', station_count: 3, max_hiking_difficulty: null });

    const hike = await tours.createTour(
      tripId,
      walkBody({ name: 'Ridge', tour_type: 'hike', waypoints: inOrder([STATIONS[2], STATIONS[3]].map(plainPoint)) }),
    );
    const listed = new Map((await tours.listTours(tripId)).map((item) => [item.place_id, item.station_count]));
    expect(listed).toEqual(
      new Map([
        [placeId, 3],
        [hike.tour.place_id, null],
      ]),
    );
  });

  it('TOURS-WALK-002: a station taken out of a walk takes its visits on every day; a walk made a hike keeps none', async () => {
    const { tripId, day1, day2 } = await tripWithDays();
    const created = await tours.createTour(tripId, walkBody());
    const placeId = created.tour.place_id;
    const [cathedral, , market, park] = created.waypoints;
    const onDay1 = await makeDayAssignment(orm(), day1.id, placeId);
    const onDay2 = await makeDayAssignment(orm(), day2.id, placeId);
    await markStationVisit(orm(), onDay1.id, cathedral.key, 'visited');
    await markStationVisit(orm(), onDay1.id, market.key, 'skipped');
    await markStationVisit(orm(), onDay2.id, market.key, 'visited');
    await markStationVisit(orm(), onDay2.id, park.key, 'visited');

    // The market is left out; the others come back with their keys, in another order.
    const kept = inOrder([park, cathedral]);
    await tours.updateTour(tripId, String(placeId), walkBody({ waypoints: kept, expected_revision: 1 }), 'sock-1');
    const statusOf = async (assignmentId: number) =>
      (await visits.walkOnDay(tripId, assignmentId)).visits.map((visit) => [visit.station_key, visit.status]);
    expect(await statusOf(onDay1.id)).toEqual([[cathedral.key, 'visited']]);
    expect(await statusOf(onDay2.id)).toEqual([[park.key, 'visited']]);
    expect(await storedKeys(placeId)).toEqual([park.key, cathedral.key]);
    // Every client of the trip hears of both days, the one that saved too.
    const visitsOf = (assignmentId: number, key: string | undefined) => ({
      assignmentId,
      visits: [{ assignment_id: assignmentId, station_key: key, status: 'visited' }],
    });
    expect(t.realtime.broadcastMock).toHaveBeenCalledWith(
      tripId,
      'tours:visits',
      visitsOf(onDay1.id, cathedral.key),
      undefined,
    );
    expect(t.realtime.broadcastMock).toHaveBeenCalledWith(
      tripId,
      'tours:visits',
      visitsOf(onDay2.id, park.key),
      undefined,
    );

    // A save that takes no station away has no visits to tell of.
    t.realtime.broadcastMock.mockClear();
    await tours.updateTour(tripId, String(placeId), walkBody({ waypoints: kept, expected_revision: 2 }));
    expect(t.realtime.broadcastMock.mock.calls.map(([, event]) => event)).not.toContain('tours:visits');

    await tours.updateTour(
      tripId,
      String(placeId),
      walkBody({ tour_type: 'hike', waypoints: kept.map(plainPoint), expected_revision: 3 }),
    );
    expect(await countRows(orm(), TourStationVisits, {})).toBe(0);
    expect(await storedKeys(placeId)).toEqual([park.key, cathedral.key]);
  });

  it('TOURS-WALK-003: a copy keeps the keys of its stations but none of the visits', async () => {
    const { tripId, day1 } = await tripWithDays();
    const created = await tours.createTour(tripId, walkBody());
    const onDay1 = await makeDayAssignment(orm(), day1.id, created.tour.place_id);
    await markStationVisit(orm(), onDay1.id, 'stop-cathedral', 'visited');

    const copy = await tours.copyTour(tripId, String(created.tour.place_id), 'Old town again');
    expect(copy.waypoints.map((point) => point.key)).toEqual(created.waypoints.map((point) => point.key));
    expect(copy.tour).toMatchObject({ tour_type: 'walk', station_count: 3 });
    const copyOnDay1 = await makeDayAssignment(orm(), day1.id, copy.tour.place_id);
    expect((await visits.walkOnDay(tripId, copyOnDay1.id)).visits).toEqual([]);
    expect((await visits.walkOnDay(tripId, onDay1.id)).visits).toHaveLength(1);
  });

  it('TOURS-WALK-004: two points sent with one key are kept apart, the first keeping it', async () => {
    const { tripId } = await tripWithDays();
    // A loop back to the start sends the start's key on its end point too.
    const created = await tours.createTour(
      tripId,
      walkBody({ waypoints: inOrder([STATIONS[0], STATIONS[2], STATIONS[0]]) }),
    );
    const keys = created.waypoints.map((point) => point.key);
    expect(keys[0]).toBe('stop-cathedral');
    expect(keys[2]).not.toBe('stop-cathedral');
    expect(stationKeySchema.safeParse(keys[2]).success).toBe(true);
    expect(new Set(keys).size).toBe(3);
  });

  it('TOURS-WALK-006: the way back of a loop is no station: counted once, and its visits go with the next save', async () => {
    const { tripId, day1 } = await tripWithDays();
    // A loop saved before the way back stopped copying the start: its own key, the start's name, stay and protection.
    const back = { ...STATIONS[0], key: 'stop-back' };
    const created = await tours.createTour(tripId, walkBody({ waypoints: inOrder([...STATIONS, back]) }));
    const placeId = created.tour.place_id;
    expect(created.tour.station_count).toBe(3);
    expect((await tours.listTours(tripId)).map((item) => item.station_count)).toEqual([3]);
    expect((await tours.getTour(tripId, String(placeId))).tour.station_count).toBe(3);

    const onDay1 = await makeDayAssignment(orm(), day1.id, placeId);
    const walk = await visits.walkOnDay(tripId, onDay1.id);
    expect(walk.stations.map((station) => station.key)).toEqual([
      'stop-cathedral',
      created.waypoints[2].key,
      created.waypoints[3].key,
    ]);
    await markStationVisit(orm(), onDay1.id, 'stop-cathedral', 'visited');
    await markStationVisit(orm(), onDay1.id, 'stop-back', 'visited');

    // A telling that fails leaves the committed save as it is.
    t.realtime.broadcastMock.mockImplementation((_trip: string, event: string) => {
      if (event === 'tours:visits') throw new Error('socket gone');
    });
    const saved = await tours.updateTour(
      tripId,
      String(placeId),
      walkBody({ waypoints: created.waypoints, expected_revision: 1 }),
    );
    expect(saved.tour).toMatchObject({ station_count: 3, revision: 2 });
    expect((await visits.walkOnDay(tripId, onDay1.id)).visits).toEqual([
      { assignment_id: onDay1.id, station_key: 'stop-cathedral', status: 'visited' },
    ]);
    expect(t.realtime.broadcastMock).toHaveBeenCalledWith(
      tripId,
      'tours:visits',
      {
        assignmentId: onDay1.id,
        visits: [{ assignment_id: onDay1.id, station_key: 'stop-cathedral', status: 'visited' }],
      },
      undefined,
    );
  });

  it('TOURS-WALK-005: a GPX file taken in as a city walk has no stations yet', async () => {
    const { tripId } = await tripWithDays();
    const gpx = `<?xml version="1.0"?>
<gpx version="1.1" creator="test"><trk><name>Harbour round</name><trkseg>
<trkpt lat="53.54" lon="9.98"><ele>5</ele></trkpt>
<trkpt lat="53.545" lon="9.99"><ele>7</ele></trkpt>
</trkseg></trk></gpx>`;
    const imported = await tours.importGpxAsTour(tripId, Buffer.from(gpx), 'harbour.gpx', undefined, {
      tour_type: 'walk',
    });
    expect(imported?.tours).toEqual([expect.objectContaining({ tour_type: 'walk', station_count: 0 })]);
    expect((await tours.listTours(tripId))[0]).toMatchObject({ tour_type: 'walk', station_count: 0 });
  });
});

/** A point without a station's stay, importance or protection, as a hike takes it. */
function plainPoint(point: TourWaypoint): TourWaypoint {
  const { stay_minutes: _stay, importance: _importance, protected: _protected, ...plain } = point;
  return plain;
}

/** The points as a route in this order: numbered from 0, the first the start and the last the end. */
function inOrder(points: TourWaypoint[]): TourWaypoint[] {
  return points.map((point, sequence) => ({
    ...point,
    sequence,
    role: sequence === 0 ? 'start' : sequence === points.length - 1 ? 'end' : 'via',
  }));
}
