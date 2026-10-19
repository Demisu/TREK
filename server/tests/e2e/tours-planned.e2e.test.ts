/**
 * Tours e2e for the planner's second round: the GPX export of one tour
 * (PR1-06A), through the real JwtAuthGuard, AddonGuard and TripAccessGuard
 * against a migrated and seeded temp SQLite db. The permission check is a
 * container spy and the broadcast goes to a FakeRealtimeService, as in
 * tours.e2e.test.ts.
 *
 * Fixtures: user 1 owns trips 5 and 6, user 2 is a member of trip 5 whom the
 * permission spy denies 'place_edit', user 3 has no access to either trip.
 */
import { db } from '../../src/db/database';
import { DayAssignments } from '../../src/db/entities/DayAssignments.entity';
import { Places } from '../../src/db/entities/Places.entity';
import { Tours } from '../../src/db/entities/Tours.entity';
import { Trips } from '../../src/db/entities/Trips.entity';
import { TrekExceptionFilter } from '../../src/nest/common/trek-exception.filter';
import { ZodValidationPipe } from '../../src/nest/common/zod-validation.pipe';
import { JourneyDomainService } from '../../src/nest/journey/journey-domain.service';
import { PermissionsService } from '../../src/nest/permissions/permissions.service';
import { RealtimeModule } from '../../src/nest/realtime/realtime.module';
import { RealtimeService } from '../../src/nest/realtime/realtime.service';
import { ToursModule } from '../../src/nest/tours/tours.module';
import { makePlace } from '../helpers/factories/places';
import { deleteRows, findRow, insertRows } from '../helpers/factories/rows';
import { setAddonEnabled } from '../helpers/factories/settings';
import { makeTour } from '../helpers/factories/tours';
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

vi.mock('../../src/db/database', async () => {
  const { createSnapshotTestDb, buildDbMock } = await import('../helpers/db-mock');
  return buildDbMock(createSnapshotTestDb());
});
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

const realtime = new FakeRealtimeService();

let orm: TestOrm;
let checkPermission: MockInstance;

const OWNER = 1;
const VIEWER = 2;
const OUTSIDER = 3;

const GEOMETRY = [
  [47, 11, 600],
  [47.01, 11.01, 700],
  [47.02, 11.02, 650],
];
const tourBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Ridge walk',
  route_geometry: GEOMETRY,
  waypoints: [
    { lat: 47, lng: 11, role: 'start', sequence: 0 },
    { lat: 47.02, lng: 11.02, role: 'end', sequence: 1 },
  ],
  max_hiking_difficulty: 3,
  duration_seconds: 3600,
  ...overrides,
});

describe('Tours planned e2e (real guards + temp SQLite)', () => {
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
      .compile();
    const nest = moduleRef.createNestApplication();
    nest.use(cookieParser());
    nest.useGlobalPipes(new ZodValidationPipe());
    nest.useGlobalFilters(new TrekExceptionFilter());
    await nest.init();
    return nest;
  }

  const createViaApi = async (tripId = 5, body: Record<string, unknown> = tourBody()) => {
    const res = await request(server).post(`/api/trips/${tripId}/tours`).set('Cookie', sessionCookie(OWNER)).send(body);
    expect(res.status).toBe(201);
    return res.body.tour.place_id as number;
  };

  beforeAll(async () => {
    orm = await createTestOrm(db);
    // Pinned ids: the session cookies sign for exactly these users.
    await makeUser(orm, { id: 1, username: 'owner', email: 'owner@example.test', role: 'user', password_version: 0 });
    await makeUser(orm, { id: 2, username: 'viewer', email: 'viewer@example.test', role: 'user', password_version: 0 });
    await makeUser(orm, {
      id: 3,
      username: 'outsider',
      email: 'outsider@example.test',
      role: 'user',
      password_version: 0,
    });
    await insertRows(orm, Trips, [
      { id: 5, user: 1, title: 'Alps' },
      { id: 6, user: 1, title: 'Other' },
    ]);
    await addTripMember(orm, 5, 2);
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

  describe('GET :placeId/export.gpx (PR1-06A)', () => {
    const exportGpx = (userId: number, placeId: number, tripId = 5) =>
      request(server)
        .get(`/api/trips/${tripId}/tours/${placeId}/export.gpx`)
        .set('Cookie', sessionCookie(userId))
        .buffer(true)
        .parse((res, done) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (text += chunk));
          res.on('end', () => done(null, text));
        });

    it('writes the whole saved line with its heights as one track, named after the tour', async () => {
      const placeId = await createViaApi(5, tourBody({ name: 'Grat über Ü', description: 'Früh los.' }));
      const res = await exportGpx(OWNER, placeId);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/gpx+xml; charset=utf-8');
      expect(res.headers['content-disposition']).toContain("filename*=UTF-8''Grat-%C3%BCber-%C3%9C.gpx");
      const gpx = res.body as string;
      expect(gpx).toContain('<name>Grat über Ü</name>');
      expect(gpx).toContain('<desc>Früh los.</desc>');
      expect(gpx).toContain('<type>hiking</type>');
      expect(gpx.match(/<trkpt /g)).toHaveLength(GEOMETRY.length);
      expect(gpx).toContain('<trkpt lat="47.01" lon="11.01">');
      expect(gpx).toContain('<ele>700</ele>');
    });

    it('writes no height a point lacks, and names a paddle tour by its boat', async () => {
      const place = await makePlace(orm, 5, {
        name: 'Canal',
        route_geometry: JSON.stringify([
          [48, 12],
          [48.01, 12.01, 300],
        ]),
      });
      await makeTour(orm, place.id, {
        tourTypeRef: 'kayak',
        boat_type: 'canoe',
        water_context: 'river',
        origin: 'gpx',
      });
      const res = await exportGpx(OWNER, place.id);
      expect(res.status).toBe(200);
      const gpx = res.body as string;
      expect(gpx).toContain('<type>canoeing</type>');
      expect(gpx.match(/<ele>/g)).toHaveLength(1);
    });

    it('a member who may only read can export; the export changes nothing', async () => {
      const placeId = await createViaApi();
      const before = await findRow(orm, Tours, { place: placeId });
      realtime.broadcastMock.mockClear();
      const res = await exportGpx(VIEWER, placeId);
      expect(res.status).toBe(200);
      expect(await findRow(orm, Tours, { place: placeId })).toEqual(before);
      expect(realtime.broadcastMock).not.toHaveBeenCalled();
    });

    it('422 for a tour without a line of two points, 404 for one of another trip or none', async () => {
      const lonely = await makePlace(orm, 5, { name: 'Dot', route_geometry: JSON.stringify([[47, 11, 1]]) });
      await makeTour(orm, lonely.id, { origin: 'gpx' });
      const refused = await request(server)
        .get(`/api/trips/5/tours/${lonely.id}/export.gpx`)
        .set('Cookie', sessionCookie(OWNER));
      expect(refused.status).toBe(422);
      expect(refused.body).toEqual({ error: 'This tour has no route to export' });

      const elsewhere = await createViaApi(6);
      const wrongTrip = await request(server)
        .get(`/api/trips/5/tours/${elsewhere}/export.gpx`)
        .set('Cookie', sessionCookie(OWNER));
      expect(wrongTrip.status).toBe(404);
      expect(wrongTrip.body).toEqual({ error: 'Tour not found' });
      const plain = await makePlace(orm, 5, { name: 'Cafe' });
      expect(
        (await request(server).get(`/api/trips/5/tours/${plain.id}/export.gpx`).set('Cookie', sessionCookie(OWNER)))
          .status,
      ).toBe(404);
    });

    it('404 Trip not found for an outsider, 404 while the addon is off, 401 without a cookie', async () => {
      const placeId = await createViaApi();
      const outsider = await request(server)
        .get(`/api/trips/5/tours/${placeId}/export.gpx`)
        .set('Cookie', sessionCookie(OUTSIDER));
      expect(outsider.status).toBe(404);
      expect(outsider.body).toEqual({ error: 'Trip not found' });
      expect((await request(server).get(`/api/trips/5/tours/${placeId}/export.gpx`)).status).toBe(401);
      await setAddonEnabled(orm, 'tours', false);
      const off = await request(server)
        .get(`/api/trips/5/tours/${placeId}/export.gpx`)
        .set('Cookie', sessionCookie(OWNER));
      expect(off.status).toBe(404);
      expect(off.body).toEqual({ error: 'Tours addon is not enabled' });
    });
  });
});
