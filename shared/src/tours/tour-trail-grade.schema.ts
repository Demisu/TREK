import { z } from 'zod';

/**
 * BIK-05: the trail grades OpenStreetMap carries for the ways a mountain bike
 * tour runs on, asked for by the ways' ids. A read: nothing about the tour
 * changes. A way without a grade is unknown, never easy; a way that could not
 * be asked about is named, so the planner can say so.
 */

/** The most ways one question names; a longer tour asks for its first ones. */
export const TOUR_TRAIL_GRADE_MAX_WAYS = 2000;

export const tourTrailGradeRequestSchema = z
  .object({
    way_ids: z.array(z.number().int().positive()).min(1).max(TOUR_TRAIL_GRADE_MAX_WAYS),
  })
  .strict();
export type TourTrailGradeRequest = z.infer<typeof tourTrailGradeRequestSchema>;

/**
 * One way's grades as OpenStreetMap tags them, read to the scale's own steps:
 * `mtb:scale` 0 to 6 (a + or - kept), `mtb:scale:uphill` 0 to 5,
 * `mtb:scale:imba` 0 to 4. Null where the way has no such tag or one that is
 * no step of the scale.
 */
export const tourTrailGradeSchema = z.object({
  id: z.number().int().positive(),
  mtb_scale: z
    .string()
    .regex(/^[0-6][+-]?$/)
    .nullable(),
  mtb_scale_uphill: z
    .string()
    .regex(/^[0-5][+-]?$/)
    .nullable(),
  mtb_scale_imba: z
    .string()
    .regex(/^[0-4]$/)
    .nullable(),
});
export type TourTrailGrade = z.infer<typeof tourTrailGradeSchema>;

export const tourTrailGradeResponseSchema = z.object({
  /** The ways asked about that carry at least one grade. */
  ways: z.array(tourTrailGradeSchema),
  /** The ways the data could not be asked about this time: their grade is unknown, not absent. */
  unanswered: z.array(z.number().int().positive()),
});
export type TourTrailGradeResponse = z.infer<typeof tourTrailGradeResponseSchema>;
