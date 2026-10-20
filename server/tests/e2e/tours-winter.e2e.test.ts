/**
 * Tours e2e for the winter label of a hike (HIK-01): saved, listed, kept by an
 * edit that leaves it out, taken off without touching the route or the days,
 * refused on any other type, copied and exported, through the real
 * JwtAuthGuard, AddonGuard and TripAccessGuard against a migrated and seeded
 * temp SQLite db. The permission check is a container spy and the broadcast
 * goes to a FakeRealtimeService, as in tours-bike.e2e.test.ts.
 *
 * Fixtures: user 1 owns trip 5, user 2 is a member of trip 5 whom the
 * permission spy denies 'place_edit'.
 */
import { DayAssignments } from '../../src/db/entities/DayAssignments.entity';
import { Days } from '../../src/db/entities/Days.entity';
import { Places } from '../../src/db/entities/Places.entity';
import { Tours } from '../../src/db/entities/Tours.entity';
import { Trips } from '../../src/db/entities/Trips.entity';
import { TrekExceptionFilter } from '../../src/nest/common/trek-exception.filter';
import { ZodValidationPipe } from '../../src/nest/common/zod-validation.pipe';
import { JourneyDomainService } from '../../src/nest/journey/journey-domain.service';
import { MapsService } from '../../src/nest/maps/maps.service';
import { OverpassElementsClient } from '../../src/nest/overpass/overpass-elements.service';
import { PermissionsService } from '../../src/nest/permissions/permissions.service';
import { RealtimeModule } from '../../src/nest/realtime/realtime.module';
import { RealtimeService } from '../../src/nest/realtime/realtime.service';
import { ToursModule } from '../../src/nest/tours/tours.module';
import { createSnapshotTestDb } from '../helpers/db-mock';
import { countRows, deleteRows, findRow, insertRows } from '../helpers/factories/rows';
import { setAddonEnabled } from '../helpers/factories/settings';
import { addTripMember } from '../helpers/factories/trips';
import { makeUser } from '../helpers/factories/users';
import { FakeRealtimeService } from '../helpers/fake-realtime';
import { createTestMikroOrmModule, createTestOrm, type TestOrm } from '../helpers/test-orm';
import { TestUnitOfWorkModule } from '../helpers/test-uow';
import { sessionCookie } from './harness';
import { Test } from '@nestjs/testing';

import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type MockInstance } from 'vitest';

vi.mock('../../src/nest/audit/audit-log.logger', () => ({
  LOG_LEVEL: 'error',
  logInfo: vi.fn(),
  logDebug: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

const { journeyHooks } = vi.hoisted(() => ({
  journeyHooks: {
    reconcileTripSkeletons: vi.fn().mockResolvedValue(undefined),
    onPlaceCreated: vi.fn().mockResolvedValue(undefined),
    onPlaceUpdated: vi.fn().mockResolvedValue(undefined),
    onPlaceDeleted: vi.fn().mockResolvedValue(undefined),
  },
}));

const db = createSnapshotTestDb();
const realtime = new FakeRealtimeService();

let orm: TestOrm;
let checkPermission: MockInstance;

const OWNER = 1;
const VIEWER = 2;

const GEOMETRY = [
  [47, 11, 1200],
  [47.01, 11.01, 1350],
  [47.02, 11.02, 1300],
];
const hikeBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Snowy ridge',
  tour_type: 'hike',
  max_hiking_difficulty: 2,
  winter_activity: 'snowshoe',
  route_geometry: GEOMETRY,
  waypoints: [
    { lat: 47, lng: 11, role: 'start', sequence: 0 },
    { lat: 47.02, lng: 11.02, role: 'end', sequence: 1 },
  ],
  duration_seconds: 5400,
  ...overrides,
});

describe('Winter hikes e2e (real guards + temp SQLite)', () => {
  let server: Server;
  let app: Awaited<ReturnType<typeof build>>;

  async function build() {
    const moduleRef = await Test.createTestingModule({
      imports: [
        await TestUnitOfWorkModule.forRoot(db),
        await createTestMikroOrmModule(db),
        RealtimeModule,
        ToursModule,
      ],
    })
      .overrideProvider(RealtimeService)
      .useValue(realtime)
      .overrideProvider(JourneyDomainService)
      .useValue(journeyHooks)
      .overrideProvider(MapsService)
      .useValue({ pois: vi.fn() })
      // No network in a test: the trail grades read OpenStreetMap through Overpass.
      .overrideProvider(OverpassElementsClient)
      .useValue({ query: vi.fn() })
      .compile();
    const nest = moduleRef.createNestApplication();
    nest.use(cookieParser());
    nest.useGlobalPipes(new ZodValidationPipe());
    nest.useGlobalFilters(new TrekExceptionFilter());
    await nest.init();
    return nest;
  }

  const send = (method: 'post' | 'put', path: string, body: Record<string, unknown>, userId = OWNER) =>
    request(server)[method](`/api/trips/5/tours${path}`).set('Cookie', sessionCookie(userId)).send(body);

  const createViaApi = async (body: Record<string, unknown> = hikeBody()) => {
    const res = await send('post', '', body);
    expect(res.status).toBe(201);
    return res.body.tour.place_id as number;
  };

  const gpxTypeOf = async (placeId: number) => {
    const res = await request(server)
      .get(`/api/trips/5/tours/${placeId}/export.gpx`)
      .set('Cookie', sessionCookie(OWNER))
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => done(null, text));
      });
    return /<type>([^<]+)<\/type>/.exec(String(res.body))?.[1] ?? '';
  };

  beforeAll(async () => {
    orm = await createTestOrm(db);
    // Pinned ids: the session cookies sign for exactly these users.
    await makeUser(orm, { id: 1, username: 'owner', email: 'owner@example.test', role: 'user', password_version: 0 });
    await makeUser(orm, { id: 2, username: 'viewer', email: 'viewer@example.test', role: 'user', password_version: 0 });
    await insertRows(orm, Trips, [{ id: 5, user: 1, title: 'Winter week' }]);
    await addTripMember(orm, 5, 2);
    await insertRows(orm, Days, [{ id: 3, trip: 5, day_number: 1, date: '2027-01-10' }]);
    app = await build();
    checkPermission = vi.spyOn(app.get(PermissionsService), 'checkPermission');
    server = app.getHttpServer();
  });

  beforeEach(async () => {
    checkPermission.mockImplementation(
      (action: string, _role: string, _owner: number, userId: number) =>
        !(action === 'place_edit' && userId === VIEWER),
    );
    await setAddonEnabled(orm, 'tours', true);
    realtime.broadcastMock.mockClear();
    await deleteRows(orm, DayAssignments);
    await deleteRows(orm, Places);
  });

  afterAll(async () => {
    await app.close();
    await orm.close();
  });

  it('TOURS-WINTER-E2E-001: saves a hike with its winter label, and lists and opens it so', async () => {
    const placeId = await createViaApi();
    expect(await findRow(orm, Tours, { place: placeId })).toMatchObject({
      tour_type: 'hike',
      winter_activity: 'snowshoe',
      max_hiking_difficulty: 2,
    });
    const list = await request(server).get('/api/trips/5/tours').set('Cookie', sessionCookie(VIEWER));
    expect(list.status).toBe(200);
    expect(list.body.tours[0]).toMatchObject({ place_id: placeId, winter_activity: 'snowshoe' });
    const detail = await request(server).get(`/api/trips/5/tours/${placeId}`).set('Cookie', sessionCookie(OWNER));
    expect(detail.body.tour).toMatchObject({ tour_type: 'hike', winter_activity: 'snowshoe' });
  });

  it('TOURS-WINTER-E2E-002: a hike saved without one carries none, as every hike did before', async () => {
    const placeId = await createViaApi(hikeBody({ winter_activity: undefined }));
    expect((await findRow(orm, Tours, { place: placeId }))?.winter_activity).toBeNull();
  });

  it('TOURS-WINTER-E2E-003: an edit leaving it out keeps it; taking it off keeps the route and the days', async () => {
    const placeId = await createViaApi();
    await insertRows(orm, DayAssignments, [{ day: 3, place: placeId, order_index: 0 }]);

    const kept = await send('put', `/${placeId}`, hikeBody({ winter_activity: undefined, expected_revision: 1 }));
    expect(kept.status).toBe(200);
    expect(kept.body.tour).toMatchObject({ winter_activity: 'snowshoe', revision: 2 });

    const off = await send('put', `/${placeId}`, hikeBody({ winter_activity: null, expected_revision: 2 }));
    expect(off.status).toBe(200);
    expect(off.body.tour).toMatchObject({ winter_activity: null, tour_type: 'hike', planned: true });
    expect(off.body.waypoints).toHaveLength(2);
    expect(await countRows(orm, DayAssignments, { place: placeId })).toBe(1);
    expect((await findRow(orm, Places, { id: placeId }))?.route_geometry).toBe(JSON.stringify(GEOMETRY));
  });

  it('TOURS-WINTER-E2E-004: refuses a label it does not know, and one on another type', async () => {
    const refused = await Promise.all(
      [
        hikeBody({ winter_activity: 'ski_tour' }),
        hikeBody({ tour_type: 'bike', bike_profile: 'mtb', max_hiking_difficulty: undefined }),
        hikeBody({ tour_type: 'walk', max_hiking_difficulty: undefined, winter_activity: 'winter_hike' }),
      ].map((body) => send('post', '', body)),
    );
    expect(refused.map((res) => res.status)).toEqual([400, 400, 400]);
    expect(await countRows(orm, Tours)).toBe(0);
  });

  it('TOURS-WINTER-E2E-005: a hike made into a bike tour loses its label', async () => {
    const placeId = await createViaApi();
    const bike = await send(
      'put',
      `/${placeId}`,
      hikeBody({
        tour_type: 'bike',
        bike_profile: 'touring',
        max_hiking_difficulty: undefined,
        winter_activity: undefined,
      }),
    );
    expect(bike.status).toBe(200);
    expect(bike.body.tour).toMatchObject({ tour_type: 'bike', winter_activity: null });
  });

  it('TOURS-WINTER-E2E-006: a member who may only read cannot save one', async () => {
    expect((await send('post', '', hikeBody(), VIEWER)).status).toBe(403);
  });

  it('TOURS-WINTER-E2E-007: a copy keeps the label', async () => {
    const placeId = await createViaApi(hikeBody({ winter_activity: 'winter_hike' }));
    const copy = await send('post', `/${placeId}/copy`, { name: 'Again' });
    expect(copy.status).toBe(201);
    expect(copy.body.tour).toMatchObject({ tour_type: 'hike', winter_activity: 'winter_hike' });
  });

  it('TOURS-WINTER-E2E-008: exports a snowshoe hike as snowshoeing, a winter hike as hiking', async () => {
    expect(await gpxTypeOf(await createViaApi())).toBe('snowshoeing');
    expect(await gpxTypeOf(await createViaApi(hikeBody({ winter_activity: 'winter_hike' })))).toBe('hiking');
  });
});
