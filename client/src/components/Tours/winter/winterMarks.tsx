import type { WinterActivity } from '@trek/shared';
import { Footprints, Snowflake, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';

/** HIK-01: the icon each winter label goes by, a snowflake for winter hiking and footprints in the snow for snowshoes. */
export const WINTER_ACTIVITY_ICON: Record<WinterActivity, LucideIcon> = {
  winter_hike: Snowflake,
  snowshoe: Footprints,
};

/**
 * HIK-01: a hike's winter label on its round tile, a frosted snowflake badge
 * at the tile's top corner, the way the tile carries where a tour came from at
 * its foot. Its tooltip names the label; nothing is drawn for a hike without one.
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
  const label = t(`tours.winter.activity.${activity}`);
  return (
    <span className="absolute -end-1 -top-1 flex">
      <Tooltip label={label}>
        <span
          data-testid="tour-winter-mark"
          role="img"
          aria-label={label}
          className="grid place-items-center rounded-full bg-surface-card text-info shadow-sm ring-1 ring-inset ring-edge-faint"
          style={{ width: size, height: size }}
        >
          <Snowflake size={Math.round(size * 0.64)} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </Tooltip>
    </span>
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
