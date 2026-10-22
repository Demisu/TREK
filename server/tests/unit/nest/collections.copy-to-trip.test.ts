/**
 * CollectionsService.copyToTrip, the trip side (G3): after the commit every copied
 * place goes out to the trip room as `place:created`, shaped as the place routes
 * send it, and runs the places domain's journey hook, so open planners show the
 * copies without a reload. A skipped duplicate and a refused copy send nothing.
 */
import { Places } from '../../../src/db/entities/Places.entity';
import { CollectionsModule } from '../../../src/nest/collections/collections.module';
import { CollectionsService } from '../../../src/nest/collections/collections.service';
import { PlacesService } from '../../../src/nest/places/places.service';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import { makeCategory, makePlace, makeTag } from '../../helpers/factories/places';
import { findRow } from '../../helpers/factories/rows';
import { makeTrip } from '../../helpers/factories/trips';
import { makeUser } from '../../helpers/factories/users';
import { resetTestDb } from '../../helpers/test-db';
import { createTestModule, type TestModule } from '../../helpers/test-module';
import { createTestOrm, type TestOrm } from '../../helpers/test-orm';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const db = createSnapshotTestDb();
let t: TestModule;
let orm: TestOrm;
let svc: CollectionsService;
let onCreated: MockInstance<PlacesService['onCreated']>;

beforeAll(async () => {
  t = await createTestModule({ db, imports: [CollectionsModule] });
  svc = t.get(CollectionsService);
  onCreated = vi.spyOn(t.get(PlacesService), 'onCreated');
  orm = await createTestOrm(db);
});
beforeEach(() => {
  resetTestDb(db);
  orm.clear();
  t.realtime.reset();
  onCreated.mockClear();
});
afterAll(async () => {
  onCreated.mockRestore();
  await orm.close();
  await t.close();
  db.close();
});

/** The place events of the trip room, as [room, payload, left-out socket]. */
const placeCreated = () =>
  t.realtime.broadcastMock.mock.calls
    .filter(([, event]) => event === 'place:created')
    .map(([room, , payload, sid]) => [room, payload, sid]);

describe('CollectionsService.copyToTrip: the trip hears its new places', () => {
  it('COLLECTIONS-SVC-215: each copied place goes out as place:created with its tags, then runs the journey hook; a skipped one sends nothing', async () => {
    const { user } = await makeUser(orm);
    await makeCategory(orm);
    const trip = await makeTrip(orm, user.id);
    const tag = await makeTag(orm, user.id, { name: 'rooftop' });
    const col = await svc.createCollection(user.id, { name: 'Evenings' });
    const bar = (await svc.savePlace(user.id, { collection_id: col.id, name: 'Sky Bar', tag_ids: [tag.id] })).place!;
    await makePlace(orm, trip.id, { name: 'Pantheon' });
    const dup = (await svc.savePlace(user.id, { collection_id: col.id, name: 'Pantheon' })).place!;
    t.realtime.broadcastMock.mockClear();

    const res = await svc.copyToTrip(
      user.id,
      { trip_id: trip.id, place_ids: [bar.id, dup.id] },
      svc.tripEvents(trip.id, 'sock-copy'),
    );

    expect(res).toEqual({ copied: 1, skipped: [{ id: dup.id, name: 'Pantheon' }] });
    const copy = (await findRow(orm, Places, { trip: trip.id, name: 'Sky Bar' }))!;
    const sent = placeCreated();
    expect(sent).toHaveLength(1);
    // The trip room, the REST socket left out, the place as the place routes send it.
    const [room, payload, sid] = sent[0];
    expect([room, sid]).toEqual([trip.id, 'sock-copy']);
    expect((payload as { place: { id: number; tags: { id: number }[] } }).place).toMatchObject({
      id: copy.id,
      tags: [expect.objectContaining({ id: tag.id })],
    });
    expect(onCreated.mock.calls).toEqual([[String(trip.id), copy.id]]);
  });

  it('COLLECTIONS-SVC-216: a refused copy sends nothing and runs no hook', async () => {
    const { user: owner } = await makeUser(orm);
    const { user: stranger } = await makeUser(orm);
    await makeCategory(orm);
    const col = await svc.createCollection(owner.id, { name: 'Mine' });
    const gem = (await svc.savePlace(owner.id, { collection_id: col.id, name: 'Hidden gem' })).place!;
    const theirs = await makeTrip(orm, stranger.id);
    t.realtime.broadcastMock.mockClear();

    await expect(
      svc.copyToTrip(owner.id, { trip_id: theirs.id, place_ids: [gem.id] }, svc.tripEvents(theirs.id, undefined)),
    ).rejects.toThrow();
    expect(placeCreated()).toEqual([]);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('COLLECTIONS-SVC-225: a plugin copy has no socket, so no tab of the trip is left out', async () => {
    const { user } = await makeUser(orm);
    await makeCategory(orm);
    const trip = await makeTrip(orm, user.id);
    const col = await svc.createCollection(user.id, { name: 'Plugin' });
    const spot = (await svc.savePlace(user.id, { collection_id: col.id, name: 'Viewpoint' })).place!;
    t.realtime.broadcastMock.mockClear();

    await svc.copyToTrip(user.id, { trip_id: trip.id, place_ids: [spot.id] }, svc.tripEvents(trip.id, undefined));

    expect(placeCreated().map(([room, , sid]) => [room, sid])).toEqual([[trip.id, undefined]]);
  });
});
