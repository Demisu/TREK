import { skiDisciplineSchema, skiIssues, skiTechniqueSchema } from './ski.schema';
import {
  bikeProfileSchema,
  importableTourTypeSchema,
  paddleBoatTypeSchema,
  paddleWaterContextSchema,
  runProfileSchema,
} from './tours.schema';

import { z } from 'zod';

/**
 * PAD-02: a GPX file is read and shown before anything is stored. The preview
 * runs the file through the same parser the import uses and answers what it
 * found; nothing is written. The import that follows takes the type the user
 * chose for it.
 */

const previewPointSchema = z.union([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number(), z.number()])]);

export const tourGpxPreviewTrackSchema = z.object({
  name: z.string(),
  /** The whole line as the file holds it, every point, so the preview shows the full course. */
  geometry: z.array(previewPointSchema),
  point_count: z.number().int().nonnegative(),
  distance_km: z.number(),
  /** Null when the file carries no heights: unknown, never zero. */
  elevation_gain_m: z.number().nullable(),
  elevation_loss_m: z.number().nullable(),
  /** Already in the trip under the same name and start: the import skips it, as it always has. */
  duplicate: z.boolean(),
});
export type TourGpxPreviewTrack = z.infer<typeof tourGpxPreviewTrackSchema>;

export const tourGpxPreviewResponseSchema = z.object({
  tracks: z.array(tourGpxPreviewTrackSchema),
});
export type TourGpxPreviewResponse = z.infer<typeof tourGpxPreviewResponseSchema>;

/**
 * The fields of the multipart import beside the file, as strings the way a
 * form sends them. Left out, the import is a hike, as it always was; a paddle
 * import names its boat and water, and a bike import and a run import (RUN-01)
 * their profile, like a planned tour of that type does. A run import has no
 * pace: its time stays unknown until a run is planned from it. A ski import
 * (SKI-02) names its discipline, a cross-country one its technique too; the
 * track is kept as recorded, with no time worked out for it.
 */
export const tourGpxImportFieldsSchema = z
  .object({
    tour_type: importableTourTypeSchema.default('hike'),
    bike_profile: bikeProfileSchema.optional(),
    run_profile: runProfileSchema.optional(),
    boat_type: paddleBoatTypeSchema.optional(),
    water_context: paddleWaterContextSchema.optional(),
    ski_discipline: skiDisciplineSchema.optional(),
    ski_technique: skiTechniqueSchema.optional(),
  })
  .superRefine((value, ctx) => {
    skiIssues(value.tour_type === 'ski', value).forEach((issue) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, ...issue }),
    );
    const owners = { bike_profile: 'bike', run_profile: 'run', boat_type: 'kayak', water_context: 'kayak' } as const;
    const names = { bike: 'a bike import', run: 'a run import', kayak: 'a paddle import' } as const;
    for (const [field, owner] of Object.entries(owners) as Array<[keyof typeof owners, keyof typeof names]>) {
      const name = names[owner];
      if (value.tour_type === owner && value[field] === undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${name} needs ${field}` });
      if (value.tour_type !== owner && value[field] !== undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} belongs to ${name}` });
    }
  });
export type TourGpxImportFields = z.infer<typeof tourGpxImportFieldsSchema>;
