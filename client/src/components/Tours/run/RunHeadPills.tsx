import type { TourListItem } from '@trek/shared';
import { Activity, Gauge } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { runPaceText } from './runPaceText';

/**
 * RUN-01: a run's profile and planned pace as pills of a tour's head, beside
 * its type. The pace's tooltip says the running time is that pace over the
 * distance and nothing more; a run without a pace shows no pace pill.
 */
export function RunHeadPills({
  tour,
  className,
}: {
  tour: Pick<TourListItem, 'tour_type' | 'run_profile' | 'run_pace_seconds_per_km'>;
  className: string;
}) {
  const { t } = useTranslation();
  if (tour.tour_type !== 'run') return null;
  const pace = runPaceText(tour);
  return (
    <>
      {tour.run_profile && (
        <span data-testid="tour-detail-run-profile" className={className} style={fs(10.5)}>
          <Activity size={11} strokeWidth={2} className="flex-none text-content-faint" aria-hidden="true" />
          {t(`tours.run.profile.${tour.run_profile}`)}
        </span>
      )}
      {pace && (
        <Tooltip label={t('tours.run.paceInfo')}>
          <span data-testid="tour-detail-run-pace" className={className} style={fs(10.5)}>
            <Gauge size={11} strokeWidth={2} className="flex-none text-content-faint" aria-hidden="true" />
            <span className="sr-only">{t('tours.run.pace')}:</span>
            {pace}
          </span>
        </Tooltip>
      )}
    </>
  );
}
