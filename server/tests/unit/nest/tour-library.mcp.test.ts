/**
 * TourLibraryMcp (LIB-02): the tours of the user's other trips and taking one
 * over, over the same service as REST. The suite takes its subject from the
 * container over a snapshot test db; the addon gate is the registry's.
 */
import { Places } from '../../../src/db/entities/Places.entity';
import type { McpContext } from '../../../src/nest-mcp';
import { McpToolGuardsService } from '../../../src/nest/mcp-shared/mcp-tool-guards.service';
import { TourLibraryMcp } from '../../../src/nest/tours/tour-library.mcp';
import { ToursModule } from '../../../src/nest/tours/tours.module';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import { createPlace, createTrip, createUser } from '../../helpers/factories';
import { findRow, updateRows } from '../../helpers/factories/rows';
import { resetTestDb } from '../../helpers/test-db';
import { createTestModule, type TestModule } from '../../helpers/test-module';
import { createTestOrm } from '../../helpers/test-orm';
import { createTour } from '../../helpers/tours-repos';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = createSnapshotTestDb();
let t: TestModule;
let mcp: TourLibraryMcp;

beforeAll(async () => {
  t = await createTestModule({ db, imports: [ToursModule] });
  mcp = t.get(TourLibraryMcp);
});
beforeEach(() => resetTestDb(db));
afterAll(async () => {
  await t.close();
  db.close();
});

const ctx = (userId: number) => ({ userId }) as McpContext;

function read(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  const text = result.content[0]?.text ?? '';
  return result.isError ? { error: text } : JSON.parse(text);
}

async function fixture() {
  const { user } = createUser(db);
  const { user: outsider } = createUser(db);
  const alps = createTrip(db, user.id, { title: 'Alps' });
  const next = createTrip(db, user.id, { title: 'Next' });
  const elsewhere = createTrip(db, outsider.id, { title: 'Elsewhere' });
  const ridge = createPlace(db, alps.id, { name: 'Ridge' });
  createTour(db, ridge.id, { distance: 8.2, max_hiking_difficulty: 3 });
  const gorge = createPlace(db, alps.id, { name: 'Gorge' });
  createTour(db, gorge.id);
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
  return { user, outsider, alps, next, elsewhere, ridge, gorge };
}

describe('TourLibraryMcp', () => {
  it('TOUR-LIB-MCP-001: list_tour_library lists the tours of the user’s trips with their trip, nothing of others', async () => {
    const { user, outsider, alps, next, ridge } = await fixture();
    const own = read(await mcp.listTourLibrary({ exclude_trip_id: next.id }, ctx(user.id)));
    expect(own.tours.map((tour: { name: string }) => tour.name).sort()).toEqual(['Gorge', 'Ridge']);
    expect(own.tours.find((tour: { place_id: number }) => tour.place_id === ridge.id)).toMatchObject({
      distance: 8.2,
      trip: { id: alps.id, title: 'Alps' },
    });
    expect(read(await mcp.listTourLibrary({ q: 'gor' }, ctx(user.id))).tours).toHaveLength(1);
    expect(read(await mcp.listTourLibrary({}, ctx(outsider.id))).tours).toEqual([]);
  });

  it('TOUR-LIB-MCP-002: take_over_tour copies a tour into a trip, remembering where it came from', async () => {
    const { user, alps, next, ridge } = await fixture();
    const result = read(
      await mcp.takeOverTour({ tripId: next.id, source_trip_id: alps.id, source_place_id: ridge.id }, ctx(user.id)),
    );
    expect(result.tour).toMatchObject({ name: 'Ridge', revision: 1 });
    expect(result.provenance.takenOverFrom).toEqual({ tripTitle: 'Alps', tourName: 'Ridge' });
    const orm = await createTestOrm(db);
    expect(await findRow(orm, Places, { id: result.tour.place_id })).toMatchObject({ trip_id: next.id });
    await orm.close();
  });

  it('TOUR-LIB-MCP-003: refuses a trip the user cannot open, and a source out of reach or without a line', async () => {
    const { user, outsider, alps, next, elsewhere, ridge, gorge } = await fixture();
    expect(
      read(
        await mcp.takeOverTour(
          { tripId: alps.id, source_trip_id: alps.id, source_place_id: ridge.id },
          ctx(outsider.id),
        ),
      ),
    ).toEqual({ error: 'Trip not found or access denied.' });
    expect(
      read(
        await mcp.takeOverTour(
          { tripId: elsewhere.id, source_trip_id: alps.id, source_place_id: ridge.id },
          ctx(outsider.id),
        ),
      ),
    ).toEqual({ error: 'Tour not found.' });
    expect(
      read(
        await mcp.takeOverTour({ tripId: next.id, source_trip_id: alps.id, source_place_id: gorge.id }, ctx(user.id)),
      ),
    ).toEqual({ error: 'Tour not found.' });
  });

  it('TOUR-LIB-MCP-004: without place_edit on the trip it writes into, nothing is copied', async () => {
    const { user, alps, next, ridge } = await fixture();
    const denied = vi.spyOn(t.get(McpToolGuardsService), 'hasTripPermission').mockResolvedValue(false);
    const result = await mcp.takeOverTour(
      { tripId: next.id, source_trip_id: alps.id, source_place_id: ridge.id },
      ctx(user.id),
    );
    expect(result.isError).toBe(true);
    expect(denied).toHaveBeenCalledWith('place_edit', next.id, user.id);
    expect(read(await mcp.listTourLibrary({ trip_id: next.id }, ctx(user.id))).tours).toEqual([]);
    denied.mockRestore();
  });
});
