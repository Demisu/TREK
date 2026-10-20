import { z } from 'zod';

/**
 * SKI-02: a ski track comes in as a GPX file and is kept as it was recorded.
 * TREK routes no ski track and works out no ski time: its distance and heights
 * are the file's, and nothing is said about snow, avalanches or whether a run
 * or a trail is open. What the skier names on purpose is the discipline, and
 * for cross-country the technique.
 */
export const SKI_DISCIPLINES = ['alpine', 'snowboard', 'cross_country', 'touring'] as const;
export const skiDisciplineSchema = z.enum(SKI_DISCIPLINES);
export type SkiDiscipline = z.infer<typeof skiDisciplineSchema>;

/**
 * How a cross-country track is skied. `unknown` is an answer the skier gives
 * on purpose (a borrowed track, a mixed day), not a gap TREK fills in; every
 * other discipline has no technique at all.
 */
export const SKI_TECHNIQUES = ['classic', 'skating', 'unknown'] as const;
export const skiTechniqueSchema = z.enum(SKI_TECHNIQUES);
export type SkiTechnique = z.infer<typeof skiTechniqueSchema>;

type SkiIssue = { path: string[]; message: string };

/**
 * What a ski track names, and what nothing else may: a ski track its
 * discipline, a cross-country track its technique as well; a technique on any
 * other discipline, and either field on another type, is refused.
 */
export function skiIssues(
  isSki: boolean,
  value: { ski_discipline?: SkiDiscipline | null; ski_technique?: SkiTechnique | null },
): SkiIssue[] {
  if (!isSki) {
    return (['ski_discipline', 'ski_technique'] as const)
      .filter((field) => value[field] != null)
      .map((field) => ({ path: [field], message: `${field} belongs to a ski track` }));
  }
  if (value.ski_discipline == null) return [{ path: ['ski_discipline'], message: 'a ski track needs a discipline' }];
  const crossCountry = value.ski_discipline === 'cross_country';
  if (crossCountry && value.ski_technique == null)
    return [{ path: ['ski_technique'], message: 'a cross-country track needs a technique' }];
  if (!crossCountry && value.ski_technique != null)
    return [{ path: ['ski_technique'], message: 'only a cross-country track has a technique' }];
  return [];
}

/**
 * A ski track classified again after its import: the discipline and the
 * technique, nothing of the track. Refused with a 409 once the tour moved on
 * past the revision the choice was made at.
 */
export const tourSkiClassificationRequestSchema = z
  .object({
    ski_discipline: skiDisciplineSchema,
    ski_technique: skiTechniqueSchema.nullable().optional(),
    /** P2C-03: the revision the classification was made at. */
    expected_revision: z.number().int().min(1).nullable().optional(),
  })
  .superRefine((value, ctx) =>
    skiIssues(true, value).forEach((issue) => ctx.addIssue({ code: z.ZodIssueCode.custom, ...issue })),
  );
export type TourSkiClassificationRequest = z.infer<typeof tourSkiClassificationRequestSchema>;
