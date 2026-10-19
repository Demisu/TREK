import { plannableTourTypeSchema, type PlannableTourType } from './tours.schema';

import { z } from 'zod';

/**
 * PLN-02: places along a tour, searched on purpose. The search reads only:
 * it changes no tour, place or day. Distances are how far a place lies from
 * the line as drawn, never a detour someone walked or paddled.
 */

/** What can be looked for along a tour on foot or on the water. */
export const TOUR_POI_CATEGORIES = [
  'viewpoint',
  'peak',
  'shelter',
  'drinking_water',
  'food',
  'toilets',
  'picnic',
  'campsite',
  'sights',
  'slipway',
  'boat_rental',
] as const;
export const tourPoiCategorySchema = z.enum(TOUR_POI_CATEGORIES);
export type TourPoiCategory = z.infer<typeof tourPoiCategorySchema>;

/** The categories each planned tour type offers, the most asked first. */
export const TOUR_POI_CATEGORIES_BY_TYPE: Record<PlannableTourType, readonly TourPoiCategory[]> = {
  hike: ['viewpoint', 'shelter', 'drinking_water', 'food', 'peak', 'toilets', 'picnic', 'campsite', 'sights'],
  kayak: ['slipway', 'boat_rental', 'drinking_water', 'food', 'toilets', 'picnic', 'campsite', 'shelter'],
};

/** How far from the line a place may lie, the choices offered, in metres. */
export const TOUR_POI_CORRIDORS_M = [250, 500, 1000, 2000] as const;
/** The most places one answer carries, nearest the start first. */
export const TOUR_POI_LIMIT = 60;
/** The most points the line sent may have; a longer line is thinned first. */
export const TOUR_POI_MAX_LINE_POINTS = 1000;
/** The most categories one search asks for. */
export const TOUR_POI_MAX_CATEGORIES = 6;

export const tourPoiSearchRequestSchema = z
  .object({
    tour_type: plannableTourTypeSchema,
    categories: z.array(tourPoiCategorySchema).min(1).max(TOUR_POI_MAX_CATEGORIES),
    corridor_m: z.number().int().min(50).max(2000),
    line: z
      .array(z.tuple([z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180)]))
      .min(2)
      .max(TOUR_POI_MAX_LINE_POINTS),
    lang: z.string().trim().min(2).max(10).optional(),
  })
  .strict();
export type TourPoiSearchRequest = z.infer<typeof tourPoiSearchRequestSchema>;

/** One place found: what the source says about it, and where it lies against the line. */
export const tourPoiSchema = z.object({
  /** The source's own id, `node:123` style for OpenStreetMap. */
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  category: tourPoiCategorySchema,
  /** The source's own kind for it, `amenity=drinking_water` style. */
  kind: z.string(),
  /** Which index answered: OpenStreetMap, or TREK's own places index. */
  source: z.string(),
  address: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  /** As the source has them; a hint to check, never a promise. */
  opening_hours: z.string().nullable(),
  /** Metres from the line, straight across. */
  distance_m: z.number().nonnegative(),
  /** Metres along the line from its start to the point nearest the place. */
  along_m: z.number().nonnegative(),
});
export type TourPoi = z.infer<typeof tourPoiSchema>;

export const tourPoiSearchResponseSchema = z.object({
  pois: z.array(tourPoiSchema),
  /** More places matched than the answer carries. */
  truncated: z.boolean(),
  /** Some stretches of the line could not be searched; the places of the others are there. */
  partial: z.boolean(),
  /** The line was longer than one search covers; only its first part was searched. */
  capped: z.boolean(),
});
export type TourPoiSearchResponse = z.infer<typeof tourPoiSearchResponseSchema>;
