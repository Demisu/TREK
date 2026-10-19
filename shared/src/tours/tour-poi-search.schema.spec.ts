import {
  TOUR_POI_CATEGORIES,
  TOUR_POI_CATEGORIES_BY_TYPE,
  tourPoiSearchRequestSchema,
  tourPoiSearchResponseSchema,
} from './tour-poi-search.schema';

import { describe, expect, it } from 'vitest';

const line = [
  [47.4, 11.1],
  [47.41, 11.12],
];

describe('tour POI search contracts (PLN-02)', () => {
  it('offers each tour type categories of its own, every one a known category', () => {
    expect(TOUR_POI_CATEGORIES_BY_TYPE.hike).toContain('viewpoint');
    expect(TOUR_POI_CATEGORIES_BY_TYPE.kayak).toContain('slipway');
    expect(TOUR_POI_CATEGORIES_BY_TYPE.hike).not.toContain('slipway');
    for (const type of Object.values(TOUR_POI_CATEGORIES_BY_TYPE))
      for (const category of type) expect(TOUR_POI_CATEGORIES).toContain(category);
  });

  it('takes a line, a corridor and up to six categories, and nothing else', () => {
    const ok = { tour_type: 'hike', categories: ['viewpoint', 'food'], corridor_m: 500, line };
    expect(tourPoiSearchRequestSchema.safeParse(ok).success).toBe(true);
    expect(tourPoiSearchRequestSchema.safeParse({ ...ok, categories: [] }).success).toBe(false);
    expect(tourPoiSearchRequestSchema.safeParse({ ...ok, categories: ['fuel'] }).success).toBe(false);
    expect(tourPoiSearchRequestSchema.safeParse({ ...ok, corridor_m: 5000 }).success).toBe(false);
    expect(tourPoiSearchRequestSchema.safeParse({ ...ok, line: [[47, 11]] }).success).toBe(false);
    expect(
      tourPoiSearchRequestSchema.safeParse({
        ...ok,
        line: [
          [91, 11],
          [47, 11],
        ],
      }).success,
    ).toBe(false);
    expect(tourPoiSearchRequestSchema.safeParse({ ...ok, tour_type: 'bike' }).success).toBe(false);
    expect(tourPoiSearchRequestSchema.safeParse({ ...ok, add: true }).success).toBe(false);
  });

  it('answers places with where they lie against the line, opening hours nullable', () => {
    const answer = tourPoiSearchResponseSchema.parse({
      pois: [
        {
          id: 'node:1',
          name: 'Spring',
          lat: 47.4,
          lng: 11.1,
          category: 'drinking_water',
          kind: 'amenity=drinking_water',
          source: 'openstreetmap',
          address: null,
          website: null,
          phone: null,
          opening_hours: null,
          distance_m: 40,
          along_m: 1200,
        },
      ],
      truncated: false,
      partial: true,
      capped: false,
    });
    expect(answer.partial).toBe(true);
    expect(answer.pois[0]?.distance_m).toBe(40);
  });
});
