import { idSchema } from '../common/primitives.schema';
import { tourTypeKeySchema } from './tours.schema';

import { z } from 'zod';

/**
 * STA-02: the user's own tour activities, as the Atlas sums them. One entry is
 * one tour the user did on one day of a trip, read from what the trip holds:
 *
 * - The plan's values stand in for the tour while nothing was recorded
 *   (`basis: 'plan'`), and say so. A tour on several days still counts once
 *   (`day_count` says on how many), on the first of them.
 * - A recorded track linked to an execution of the tour (ACT-01) takes the
 *   plan's place (`basis: 'track'`), one entry per recording; the plan of that
 *   tour is then not counted besides it, and the recording is never counted as
 *   a tour of its own.
 * - An import some other tour of the trip was planned from (the whole route a
 *   multi-day tour's stages were cut from) is left out while one of those
 *   tours counts, so the route and its stages are never added up together.
 * - Only the user's own part counts: an execution names the user as one of its
 *   participants, or names none and the trip is the user's own. Being able to
 *   open someone else's trip makes none of its tours the user's.
 *
 * Whether an entry is done is the reader's question (`date` before today, in
 * the reader's own time zone): the server answers every entry it found, the
 * upcoming ones too, so the app can say how many are still ahead.
 */

/** Where an entry's values come from: the trip's planning, or a track recorded while doing it. */
export const TOUR_ACTIVITY_BASES = ['plan', 'track'] as const;
export const tourActivityBasisSchema = z.enum(TOUR_ACTIVITY_BASES);
export type TourActivityBasis = z.infer<typeof tourActivityBasisSchema>;

/** A calendar day, YYYY-MM-DD, as a trip's days carry it. */
export const tourActivityDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const tourActivityStatsEntrySchema = z.object({
  place_id: idSchema,
  name: z.string(),
  tour_type: tourTypeKeySchema,
  trip: z.object({ id: idSchema, title: z.string() }),
  /** The day it was done on: the recording's day, else the first of the user's dated days the tour is on. */
  date: tourActivityDateSchema,
  basis: tourActivityBasisSchema,
  /** The recording whose values these are; null for the plan. */
  track: z.object({ place_id: idSchema, name: z.string() }).nullable(),
  /** On how many of the user's dated days the tour is planned; it counts once however many. */
  day_count: z.number().int().positive(),
  /** Null where the source does not know the value; a paddle tour never has heights. */
  distance_km: z.number().nonnegative().nullable(),
  ascent_m: z.number().nonnegative().nullable(),
  descent_m: z.number().nonnegative().nullable(),
  /** Left out of the user's sums on purpose (a tour that fell through); the plan stays as it is. */
  excluded: z.boolean(),
});
export type TourActivityStatsEntry = z.infer<typeof tourActivityStatsEntrySchema>;

export const tourActivityStatsResponseSchema = z.object({
  /** The newest first. */
  entries: z.array(tourActivityStatsEntrySchema),
  /**
   * Tours of the user's own trips that cannot count as done: on no day at all,
   * or only on days without a date. Said, so a missing tour is not a mystery.
   */
  uncounted: z.object({
    unassigned: z.number().int().nonnegative(),
    undated: z.number().int().nonnegative(),
  }),
});
export type TourActivityStatsResponse = z.infer<typeof tourActivityStatsResponseSchema>;

/** Leaving a tour out of the user's own sums, or counting it again. Nothing of the tour changes. */
export const tourActivityExclusionRequestSchema = z
  .object({
    place_id: idSchema,
    excluded: z.boolean(),
  })
  .strict();
export type TourActivityExclusionRequest = z.infer<typeof tourActivityExclusionRequestSchema>;

/** What a reader narrows the sums by: a period (both days included) and one type. */
export const tourActivityStatsQuerySchema = z
  .object({
    from: tourActivityDateSchema.optional(),
    to: tourActivityDateSchema.optional(),
    type: tourTypeKeySchema.optional(),
  })
  .strict();
export type TourActivityStatsQuery = z.infer<typeof tourActivityStatsQuerySchema>;
