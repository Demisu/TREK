import { Clock, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { SoftPill } from '../../Planner/planParts';
import { Tooltip } from '../../shared/Tooltip';
import { formatPlannedTourDuration } from '../tourPresentation';
import type { TourPlannerWaypoint } from './tourPlannerWaypoints';

/**
 * CW-02, CW-03, CW-10: what a city walk's station row says besides its name:
 * the stay (or that it is not known), an importance other than normal, and a
 * protection, each a quiet pill.
 */
export function StationPills({ point }: { point: TourPlannerWaypoint }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-1" data-testid="station-pills">
      <SoftPill icon={<Clock size={10} strokeWidth={2.2} aria-hidden="true" />}>
        {point.stayMinutes == null
          ? t('tours.walk.station.stayUnknownShort')
          : point.stayMinutes === 0
            ? t('tours.walk.station.passThrough')
            : formatPlannedTourDuration(point.stayMinutes)}
      </SoftPill>
      {point.importance && (
        <SoftPill tone={point.importance === 'must' ? 'warning' : undefined}>
          {t(`tours.walk.importance.${point.importance}`)}
        </SoftPill>
      )}
      {point.protected && (
        <Tooltip label={t('tours.walk.station.protectedHint')}>
          <span className="inline-flex" aria-label={t('tours.walk.station.protected')}>
            <SoftPill icon={<ShieldCheck size={10} strokeWidth={2.2} aria-hidden="true" />} />
          </span>
        </Tooltip>
      )}
    </span>
  );
}
