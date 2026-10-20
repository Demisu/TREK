import type { SkiDiscipline, SkiTechnique, TourListItem } from '@trek/shared';
import { CableCar, createLucideIcon, Spline, TrendingUp, type LucideIcon } from 'lucide-react';

/**
 * SKI-02: a snowboard seen from above, laid across the square with its two
 * bindings. Lucide has no board, and the snowflake is the winter hike's mark
 * (HIK-01): both sit in the same corner badge, so the board needs a glyph of
 * its own to be told apart there.
 */
const BOARD = 'rotate(-45 12 12)';
const Snowboard = createLucideIcon('snowboard', [
  ['rect', { x: '1.5', y: '8.5', width: '21', height: '7', rx: '3.5', transform: BOARD, key: 'board' }],
  ['path', { d: 'M8.5 10v4', transform: BOARD, key: 'binding-front' }],
  ['path', { d: 'M15.5 10v4', transform: BOARD, key: 'binding-back' }],
]);

/**
 * SKI-02: the icon each discipline goes by: a lift for alpine skiing, a board
 * for snowboarding, a winding trail for cross-country and the climb on skins
 * for ski touring. None of them is the winter hike's snowflake, which takes
 * the same corner of a tile.
 */
export const SKI_DISCIPLINE_ICON: Record<SkiDiscipline, LucideIcon> = {
  alpine: CableCar,
  snowboard: Snowboard,
  cross_country: Spline,
  touring: TrendingUp,
};

export type SkiTour = Partial<Pick<TourListItem, 'tour_type' | 'ski_discipline' | 'ski_technique'>>;

/** The discipline of a ski track, or null for any other tour and a ski track listed before it had one. */
export function skiDisciplineOf(tour: SkiTour): SkiDiscipline | null {
  return tour.tour_type === 'ski' ? (tour.ski_discipline ?? null) : null;
}

/** A cross-country track's technique; null for every other discipline and type. */
export function skiTechniqueOf(tour: SkiTour): SkiTechnique | null {
  return skiDisciplineOf(tour) === 'cross_country' ? (tour.ski_technique ?? null) : null;
}

/** The classification in words, the discipline and a cross-country technique, as one tooltip reads it. */
export function skiClassificationText(tour: SkiTour, t: (key: string) => string): string | null {
  const discipline = skiDisciplineOf(tour);
  if (!discipline) return null;
  const technique = skiTechniqueOf(tour);
  const name = t(`tours.ski.discipline.${discipline}`);
  return technique ? `${name}, ${t('tours.ski.technique')}: ${t(`tours.ski.technique.${technique}`)}` : name;
}
