import { stationKeySchema } from './tours.schema';

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
 */
export const WALK_IMPORT_URL_MAX = 2048;
export const walkImportPreviewRequestSchema = z
  .object({ url: z.string().trim().min(1).max(WALK_IMPORT_URL_MAX) })
  .strict();
export type WalkImportPreviewRequest = z.infer<typeof walkImportPreviewRequestSchema>;

/** A stop as the link names it; a stop without coordinates in the link is not guessed at. */
export const walkImportStationSchema = z.object({
  name: z.string().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});
export type WalkImportStation = z.infer<typeof walkImportStationSchema>;

export const walkImportPreviewResponseSchema = z.object({
  stations: z.array(walkImportStationSchema),
  /** The link as it was read, after its short form was followed. */
  resolved_url: z.string(),
});
export type WalkImportPreviewResponse = z.infer<typeof walkImportPreviewResponseSchema>;
