import type { WinterActivity } from '@trek/shared';
import { Footprints, Snowflake, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { TourCornerMark } from '../TourCornerMark';

/** HIK-01: the icon each winter label goes by, a snowflake for winter hiking and footprints in the snow for snowshoes. */
export const WINTER_ACTIVITY_ICON: Record<WinterActivity, LucideIcon> = {
  winter_hike: Snowflake,
  snowshoe: Footprints,
};

/**
 * HIK-01: a hike's winter label on its round tile, a frosted badge at the
 * tile's top corner with the label's own icon, the one its head pill shows,
 * the way the tile carries where a tour came from at its foot. Its tooltip
 * names the label; nothing is drawn for a hike without one.
 */
export function WinterCornerMark({
  activity,
  size = 15,
}: {
  activity: WinterActivity | null | undefined;
  /** The badge's diameter in pixels, about half the tile's. */
  size?: number;
}) {
  const { t } = useTranslation();
  if (!activity) return null;
  return (
    <TourCornerMark
      icon={WINTER_ACTIVITY_ICON[activity]}
      label={t(`tours.winter.activity.${activity}`)}
      size={size}
      testId="tour-winter-mark"
    />
  );
}

/**
 * HIK-01: the winter label as a pill of a tour's head, its icon in the info
 * tone. The tooltip says it is the travellers' label only, never a check of
 * the way in winter.
 */
export function WinterActivityPill({ activity, className }: { activity: WinterActivity; className: string }) {
  const { t } = useTranslation();
  const Icon = WINTER_ACTIVITY_ICON[activity];
  return (
    <Tooltip label={t('tours.winter.labelOnly')}>
      <span data-testid="tour-detail-winter" className={className} style={fs(10.5)}>
        <Icon size={11} strokeWidth={2} className="flex-none text-info" aria-hidden="true" />
        {t(`tours.winter.activity.${activity}`)}
      </span>
    </Tooltip>
  );
}
