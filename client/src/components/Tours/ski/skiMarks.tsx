import type { SkiDiscipline, SkiTechnique, TourListItem } from '@trek/shared';
import { CableCar, createLucideIcon, Spline, TrendingUp, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { TourCornerMark } from '../TourCornerMark';

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

type SkiTour = Partial<Pick<TourListItem, 'tour_type' | 'ski_discipline' | 'ski_technique'>>;

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

/**
 * SKI-02: a ski track's discipline on the corner of its round tile, a frosted
 * badge carrying the discipline's icon, the way a hike carries its winter
 * label there. Its tooltip names the discipline and a cross-country technique.
 */
export function SkiCornerMark({ tour, size = 15 }: { tour: SkiTour; size?: number }) {
  const { t } = useTranslation();
  const discipline = skiDisciplineOf(tour);
  const label = skiClassificationText(tour, t);
  if (!discipline || !label) return null;
  return <TourCornerMark icon={SKI_DISCIPLINE_ICON[discipline]} label={label} size={size} testId="tour-ski-mark" />;
}

/**
 * SKI-02: a ski track's discipline as a pill of a tour's head, beside its
 * type, a cross-country technique as a badge inside it. The tooltip says what
 * TREK does with the track and what it does not say.
 */
export function SkiHeadPill({ tour, className }: { tour: SkiTour; className: string }) {
  const { t } = useTranslation();
  const discipline = skiDisciplineOf(tour);
  if (!discipline) return null;
  const technique = skiTechniqueOf(tour);
  const Icon = SKI_DISCIPLINE_ICON[discipline];
  return (
    <Tooltip label={t('tours.ski.info')}>
      <span data-testid="tour-detail-ski" className={className} style={fs(10.5)}>
        <Icon size={11} strokeWidth={2} className="flex-none text-info" aria-hidden="true" />
        {t(`tours.ski.discipline.${discipline}`)}
        {technique && (
          <span
            data-testid="tour-detail-ski-technique"
            className="ms-0.5 inline-flex h-[16px] items-center rounded-full bg-surface-secondary px-1.5 text-content"
          >
            <span className="sr-only">{t('tours.ski.technique')}:</span>
            {t(`tours.ski.technique.${technique}`)}
          </span>
        )}
      </span>
    </Tooltip>
  );
}
