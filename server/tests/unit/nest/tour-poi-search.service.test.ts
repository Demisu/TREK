/**
 * TourPoiSearchService (PLN-02): places along a tour's line through the map
 * search. The map search is a stub here: these tests are about which
 * stretches are asked, what is kept and how the answer says what it missed.
 */
import { Places } from '../../../src/db/entities/Places.entity';
import type { McpContext } from '../../../src/nest-mcp';
import { MapsService } from '../../../src/nest/maps/maps.service';
import { TourPoiSearchService } from '../../../src/nest/tours/tour-poi-search.service';
import { ToursMcp } from '../../../src/nest/tours/tours.mcp';
import { ToursModule } from '../../../src/nest/tours/tours.module';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import { createPlace, createTrip, createUser } from '../../helpers/factories';
import { updateRows } from '../../helpers/factories/rows';
import { resetTestDb } from '../../helpers/test-db';
import { createTestModule, type TestModule } from '../../helpers/test-module';
import { createTestOrm } from '../../helpers/test-orm';
import { createTour } from '../../helpers/tours-repos';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = createSnapshotTestDb();
const pois = vi.fn();
let t: TestModule;
let service: TourPoiSearchService;

beforeAll(async () => {
  t = await createTestModule({ db, imports: [ToursModule], overrides: [{ provide: MapsService, useValue: { pois } }] });
  service = t.get(TourPoiSearchService);
});
beforeEach(() => {
  resetTestDb(db);
  pois.mockReset();
});
afterAll(async () => {
  await t.close();
  db.close();
});

// About 2.2 km due north, along one meridian.
const LINE: Array<[number, number]> = [
  [47.4, 11.1],
  [47.42, 11.1],
];

function poi(id: string, lat: number, lng: number, category = 'viewpoint', over: Record<string, unknown> = {}) {
  return {
    osm_id: id,
    name: id,
    lat,
    lng,
    category,
    poi_type: `tourism=${category}`,
    address: null,
    website: null,
    phone: null,
    opening_hours: 'Mo-Su 08:00-18:00',
    cuisine: null,
    brand: null,
    brand_wikidata: null,
    charging: null,
    source: 'openstreetmap',
    ...over,
  };
}

const answer = (list: unknown[], over: Record<string, unknown> = {}) => ({
  pois: list,
  source: 'openstreetmap',
  truncated: false,
  clamped: false,
  ...over,
});

describe('TourPoiSearchService', () => {
  it('TOUR-POI-001: keeps the places within the corridor, once each, nearest the start first, with where they lie', async () => {
    pois.mockResolvedValue(
      answer([
        poi('node:far', 47.41, 11.2),
        poi('node:late', 47.418, 11.1005),
        poi('node:early', 47.402, 11.1003),
        poi('node:early', 47.402, 11.1003),
      ]),
    );
    const result = await service.search({ tour_type: 'hike', categories: ['viewpoint'], corridor_m: 500, line: LINE });
    expect(result.pois.map((found) => found.id)).toEqual(['node:early', 'node:late']);
    expect(result.pois[0]).toMatchObject({
      category: 'viewpoint',
      kind: 'tourism=viewpoint',
      opening_hours: 'Mo-Su 08:00-18:00',
    });
    expect(result.pois[0]?.distance_m).toBeGreaterThan(10);
    expect(result.pois[0]?.distance_m).toBeLessThan(40);
    expect(result.pois[0]?.along_m).toBeLessThan(result.pois[1]?.along_m);
    expect(result).toMatchObject({ truncated: false, partial: false, capped: false });
  });

  it('TOUR-POI-006: one name in one spot is one place, mapped twice as a point and an outline', async () => {
    pois.mockResolvedValue(
      answer([
        poi('node:9', 47.41, 11.1003, 'viewpoint', { name: 'AlpspiX' }),
        poi('way:9', 47.4101, 11.1004, 'viewpoint', { name: 'AlpspiX' }),
        poi('node:10', 47.4102, 11.1003, 'viewpoint', { name: 'Other' }),
      ]),
    );
    const result = await service.search({ tour_type: 'hike', categories: ['viewpoint'], corridor_m: 500, line: LINE });
    expect(result.pois.map((found) => found.id)).toEqual(['node:9', 'node:10']);
  });

  it('TOUR-POI-002: asks the map search for what each category means, and names a hit by the category asked', async () => {
    pois.mockResolvedValue(answer([poi('node:cafe', 47.41, 11.1, 'cafe')]));
    const result = await service.search({
      tour_type: 'hike',
      categories: ['food', 'drinking_water'],
      corridor_m: 250,
      line: LINE,
      lang: 'de',
    });
    expect(pois).toHaveBeenCalledWith('restaurant,cafe,drinking_water', expect.any(Object), 'de', 60);
    expect(result.pois[0]?.category).toBe('food');
  });

  it('TOUR-POI-003: a stretch that fails leaves the others and marks the answer partial; a cut answer is truncated', async () => {
    // A line long enough to need several stretches.
    const long: Array<[number, number]> = [
      [47.0, 11.0],
      [48.6, 11.0],
    ];
    pois
      .mockRejectedValueOnce(new Error('overpass down'))
      .mockResolvedValue(answer([poi('node:a', 47.6, 11.0005)], { truncated: true }));
    const result = await service.search({ tour_type: 'hike', categories: ['viewpoint'], corridor_m: 500, line: long });
    expect(pois.mock.calls.length).toBeGreaterThan(1);
    expect(result.partial).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.pois.map((found) => found.id)).toEqual(['node:a']);
  });

  it('TOUR-POI-004: a line longer than one search covers is searched along its first stretches and says so', async () => {
    pois.mockResolvedValue(answer([]));
    const result = await service.search({
      tour_type: 'kayak',
      categories: ['slipway'],
      corridor_m: 2000,
      line: [
        [44.0, 8.0],
        [52.0, 14.0],
      ],
    });
    expect(pois).toHaveBeenCalledTimes(12);
    expect(result.capped).toBe(true);
  });

  it('TOUR-POI-005: searches along a saved tour for MCP, and a tour without a line is not found', async () => {
    const { user } = createUser(db);
    const trip = createTrip(db, user.id);
    const ridge = createPlace(db, trip.id, { name: 'Ridge' });
    createTour(db, ridge.id);
    pois.mockResolvedValue(answer([poi('node:x', 47.41, 11.1)]));
    await expect(
      service.searchSavedTour(trip.id, ridge.id, { categories: ['viewpoint'], corridor_m: 500 }),
    ).rejects.toThrow('Tour not found');
    const orm = await createTestOrm(db);
    await updateRows(
      orm,
      Places,
      { id: ridge.id },
      { route_geometry: JSON.stringify(LINE.map(([lat, lng]) => [lat, lng, 600])) },
    );
    await orm.close();
    const result = await service.searchSavedTour(trip.id, ridge.id, { categories: ['viewpoint'], corridor_m: 500 });
    expect(result.pois.map((found) => found.id)).toEqual(['node:x']);

    // The MCP tool reads the same, and only for someone who sees the trip.
    const mcp = t.get(ToursMcp);
    const ctx = (userId: number) => ({ userId }) as McpContext;
    const read = (r: { content: Array<{ text: string }>; isError?: boolean }) =>
      r.isError ? { error: r.content[0]?.text } : JSON.parse(r.content[0]?.text ?? '{}');
    expect(
      read(
        await mcp.searchTourPois(
          { tripId: trip.id, placeId: ridge.id, categories: ['viewpoint'], corridor_m: 500 },
          ctx(user.id),
        ),
      ).pois,
    ).toHaveLength(1);
    const { user: outsider } = createUser(db);
    expect(
      read(
        await mcp.searchTourPois(
          { tripId: trip.id, placeId: ridge.id, categories: ['viewpoint'], corridor_m: 500 },
          ctx(outsider.id),
        ),
      ),
    ).toEqual({ error: 'Trip not found or access denied.' });
    expect(
      read(
        await mcp.searchTourPois(
          { tripId: trip.id, placeId: 999999, categories: ['viewpoint'], corridor_m: 500 },
          ctx(user.id),
        ),
      ),
    ).toEqual({ error: 'Tour not found.' });
  });
});
