import { stationKeySchema, TOUR_STATION_NAME_MAX } from './tours.schema';

import { z } from 'zod';

/**
 * CW-03: how far a city walk got on one of its days. A visit belongs to the
 * walk's place on that day (its day assignment), never to the walk itself, so
 * the same walk on another day, or a copy, starts with nothing visited. A
 * station without a row is still planned.
 */
export const TOUR_VISIT_STATUSES = ['visited', 'skipped'] as const;
export const tourVisitStatusSchema = z.enum(TOUR_VISIT_STATUSES);
export type TourVisitStatus = z.infer<typeof tourVisitStatusSchema>;

export const tourVisitSchema = z.object({
  assignment_id: z.number().int().positive(),
  station_key: stationKeySchema,
  status: tourVisitStatusSchema,
});
export type TourVisit = z.infer<typeof tourVisitSchema>;

export const tourVisitListResponseSchema = z.object({ visits: z.array(tourVisitSchema) });
export type TourVisitListResponse = z.infer<typeof tourVisitListResponseSchema>;

/** Planned takes a station back to where it started: nothing visited, nothing skipped. */
export const tourVisitUpdateRequestSchema = z.object({ status: z.enum(['planned', ...TOUR_VISIT_STATUSES]) }).strict();
export type TourVisitUpdateRequest = z.infer<typeof tourVisitUpdateRequestSchema>;

/**
 * CW-06, CW-07: a Google Maps walking route shared as a link, read into the
 * stations of a city walk. Only links Google marks as on foot are taken; the
 * way between the stations is TREK's own, planned afresh.
 *
 * The link is long on purpose: a route of ten stops with their names and the
 * data Google adds runs past two thousand characters.
 */
export const WALK_IMPORT_URL_MAX = 8192;
/** The most stops one link may bring; Google Maps itself takes ten. */
export const WALK_IMPORT_STATIONS_MAX = 30;
export const walkImportPreviewRequestSchema = z
  .object({ url: z.string().trim().min(1).max(WALK_IMPORT_URL_MAX) })
  .strict();
export type WalkImportPreviewRequest = z.infer<typeof walkImportPreviewRequestSchema>;

/** A stop as the link names it; a stop without coordinates in the link is not guessed at. */
export const walkImportStationSchema = z.object({
  name: z.string().max(TOUR_STATION_NAME_MAX).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});
export type WalkImportStation = z.infer<typeof walkImportStationSchema>;

export const walkImportPreviewResponseSchema = z.object({
  stations: z.array(walkImportStationSchema).min(2).max(WALK_IMPORT_STATIONS_MAX),
  /** The link as it was read, after its short form was followed. */
  resolved_url: z.string().url(),
});
export type WalkImportPreviewResponse = z.infer<typeof walkImportPreviewResponseSchema>;

/** Why a link was not read, for the dialog to say in the reader's language. */
export const WALK_IMPORT_REFUSALS = [
  'not_google_maps',
  'not_a_route',
  'not_walking',
  'mode_unknown',
  'short_link_refused',
  'short_link_failed',
  'too_few_stops',
  'too_many_stops',
] as const;
export const walkImportRefusalSchema = z.enum(WALK_IMPORT_REFUSALS);
export type WalkImportRefusal = z.infer<typeof walkImportRefusalSchema>;

/** The body of a refusal: the English text for API and MCP clients, and its reason. */
export const walkImportRefusalResponseSchema = z.object({ error: z.string(), reason: walkImportRefusalSchema });
