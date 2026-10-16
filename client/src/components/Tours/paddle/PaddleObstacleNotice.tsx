import { AlertTriangle, Info, Loader2, WifiOff } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '../../../i18n';
import { usePaddleObstacleStore } from '../../../store/paddleObstacleStore';
import { TourNotice } from '../tourParts';

/** The oldest data date among the regions, as a short local date; the route is only as current as its oldest part. */
function dataDate(regions: readonly { source_timestamp?: string | null }[], language: string): string {
  const times = regions.map((region) => region.source_timestamp).filter((time): time is string => !!time).sort();
  return times[0] ? new Date(times[0]).toLocaleDateString(language, { dateStyle: 'medium' }) : '';
}

/**
 * PAD-05B: what TREK knows about the water along the route, in one line under
 * the boat fields. It never reads as an all-clear: covered or not, the
 * paddler checks the water, and where nothing is known it says so instead of
 * leaving an empty map to be read as open water.
 */
export function PaddleObstacleNotice() {
  const { t, language } = useTranslation();
  const { status, coverage, related, regions } = usePaddleObstacleStore(
    useShallow((state) => ({ status: state.status, coverage: state.coverage, related: state.related, regions: state.regions }))
  );
  const warn = <AlertTriangle size={13} strokeWidth={2} />;
  if (status === 'idle' || status === 'loading') {
    return (
      <TourNotice role="status" icon={<Loader2 size={13} strokeWidth={2} className="animate-spin" />}>
        {t('tours.paddle.obstacles.loading')}
      </TourNotice>
    );
  }
  if (status === 'offline') return <TourNotice icon={<WifiOff size={13} strokeWidth={2} />}>{t('tours.paddle.obstacles.offline')}</TourNotice>;
  if (status === 'error') return <TourNotice icon={warn}>{t('tours.paddle.obstacles.error')}</TourNotice>;
  const date = dataDate(regions, language);
  if (coverage === 'none') return <TourNotice icon={warn}>{t('tours.paddle.obstacles.none')}</TourNotice>;
  if (coverage === 'partial') return <TourNotice icon={warn}>{t('tours.paddle.obstacles.partial', { date })}</TourNotice>;
  return (
    <TourNotice role="status" icon={<Info size={13} strokeWidth={2} />}>
      {related.length
        ? t('tours.paddle.obstacles.covered', { count: related.length, date })
        : t('tours.paddle.obstacles.coveredEmpty', { date })}
    </TourNotice>
  );
}
