import { z } from 'zod';

/**
 * SKI-02: a ski and winter tour, planned in the planner or imported from a
 * GPX file. A planned one has every leg drawn between its points (the piste
 * router comes later), an imported one is kept as it was recorded. TREK works
 * out no ski time, and nothing is said about snow, avalanches or whether a
 * run or a trail is open. What the traveller names on purpose is the
 * discipline: alpine, snowboard, cross-country, ski touring, snowshoeing or
 * winter hiking (both of which live here and not on a hike), and for
 * cross-country the technique.
 */
export const SKI_DISCIPLINES = ['alpine', 'snowboard', 'cross_country', 'touring', 'snowshoe', 'winter_hike'] as const;
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
 * What a ski tour names, and what nothing else may: a ski tour its
 * discipline, a cross-country tour its technique as well; a technique on any
 * other discipline, and either field on another type, is refused. Planned and
 * imported ski tours are held to the same rule.
 */
export function skiIssues(
  isSki: boolean,
  value: { ski_discipline?: SkiDiscipline | null; ski_technique?: SkiTechnique | null },
): SkiIssue[] {
  if (!isSki) {
    return (['ski_discipline', 'ski_technique'] as const)
      .filter((field) => value[field] != null)
      .map((field) => ({ path: [field], message: `${field} belongs to a ski tour` }));
  }
  if (value.ski_discipline == null) return [{ path: ['ski_discipline'], message: 'a ski tour needs a discipline' }];
  const crossCountry = value.ski_discipline === 'cross_country';
  if (crossCountry && value.ski_technique == null)
    return [{ path: ['ski_technique'], message: 'a cross-country tour needs a technique' }];
  if (!crossCountry && value.ski_technique != null)
    return [{ path: ['ski_technique'], message: 'only a cross-country tour has a technique' }];
  return [];
}

/**
 * A ski tour classified again after its import: the discipline and the
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
