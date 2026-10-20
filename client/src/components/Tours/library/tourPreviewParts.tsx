import type { TourLibraryItem } from '@trek/shared';
import { ArrowUp, Clock, Loader2, Ruler, Spline } from 'lucide-react';
import { useMemo } from 'react';
import { OFM_POSITRON } from '../../../constants/mapDefaults';
import { useTileUrl } from '../../../hooks/useTileUrl';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import { formatDistance, formatElevation } from '../../../utils/units';
import { MapViewAuto } from '../../Map/MapViewAuto';
import { fs } from '../../shared/DialogShell';
import { TourDayRowPill } from '../TourDayRowFacts';
import type { TourMetricField } from '../tourParts';
import { plannedTotalText, tourPlannedTimes } from '../tourPresentation';

type Translate = (key: string, params?: Record<string, unknown>) => string;
type Unit = Parameters<typeof formatDistance>[1];

/** What a tour picked from elsewhere (another trip, a collection) is measured by, as its list carries it. */
type MeasuredTour = Pick<
  TourLibraryItem,
  | 'tour_type'
  | 'distance'
  | 'elevation_gain'
  | 'elevation_loss'
  | 'duration'
  | 'planned_duration_minutes'
  | 'break_additional_minutes'
  | 'station_count'
  | 'station_stay_minutes'
  | 'station_stays_unknown'
>;

/** A tour's own measures as badges; one it does not have is left out, never shown as zero. */
function measureBadges(tour: MeasuredTour, unit: Unit, t: Translate) {
  const times = tourPlannedTimes(tour);
  const total = plannedTotalText(times, t);
  const badge = plannedTotalText(times, t, true);
  return [
    total != null &&
      badge != null && {
        key: 'time',
        icon: Clock,
        value: badge,
        label: `${t('tours.planner.plannedTotalDuration')}: ${total}`,
      },
    tour.distance != null && {
      key: 'distance',
      icon: Ruler,
      value: formatDistance(tour.distance, unit),
      label: `${t('tours.detail.distance')}: ${formatDistance(tour.distance, unit)}`,
    },
    tour.elevation_gain != null &&
      tour.tour_type !== 'kayak' && {
        key: 'ascent',
        icon: ArrowUp,
        value: formatElevation(tour.elevation_gain, unit),
        label: `${t('tours.detail.ascent')}: ${formatElevation(tour.elevation_gain, unit)}`,
      },
  ].filter((badge) => !!badge);
}

/** The measures of a listed tour as small white badges, each named in full by its tooltip. */
export function TourMeasurePills({ tour, testPrefix }: { tour: MeasuredTour; testPrefix: string }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  return (
    <>
      {measureBadges(tour, unit, t).map((badge) => (
        <TourDayRowPill
          key={badge.key}
          icon={badge.icon}
          value={badge.value}
          label={badge.label}
          testId={`${testPrefix}-${badge.key}`}
        />
      ))}
    </>
  );
}

/**
 * The facts of a chosen tour as its preview shows them, each only where the
 * tour has it: where it comes from first, then its type, distance, planned
 * time, heights and how many control points it brings.
 */
export function tourPreviewFacts(
  tour: MeasuredTour,
  waypoints: number,
  unit: Unit,
  t: Translate,
  from: TourMetricField
): TourMetricField[] {
  const total = plannedTotalText(tourPlannedTimes(tour), t);
  const fact = (show: boolean, label: string, value: () => string) => (show ? { label, value: value() } : null);
  return [
    from,
    fact(true, t('tours.filter.type'), () => t(`tourTypes.${tour.tour_type}`)),
    fact(tour.distance != null, t('tours.detail.distance'), () => formatDistance(tour.distance ?? 0, unit)),
    fact(total != null, t('tours.planner.plannedTotalDuration'), () => total ?? ''),
    fact(tour.elevation_gain != null && tour.tour_type !== 'kayak', t('tours.detail.ascent'), () =>
      formatElevation(tour.elevation_gain ?? 0, unit)
    ),
    fact(tour.elevation_loss != null && tour.tour_type !== 'kayak', t('tours.detail.descent'), () =>
      formatElevation(tour.elevation_loss ?? 0, unit)
    ),
    fact(waypoints > 0, t('tours.library.controlPoints'), () => String(waypoints)),
  ].filter((field): field is TourMetricField => field !== null);
}

/** Where a preview's answer is: on its way, there, or not to be had. */
type PreviewStatus = 'loading' | 'ready' | 'error' | 'offline' | null;

/**
 * A tour's line on a small map, the way a preview shows it before anything is
 * taken over: drawn once its points are in, a spinner while they load, a short
 * line of text when they cannot be read, and, where the caller names it, what
 * a tour without a line has instead, so an empty box never reads as a broken map.
 */
export function TourLinePreview({
  line,
  focusKey,
  status,
  failedText,
  emptyText,
}: {
  line: ReadonlyArray<readonly unknown[]> | undefined;
  focusKey: string;
  status: PreviewStatus;
  /** What a preview that could not be read says; offline says that it is offline. */
  failedText: string;
  /** What a tour read in full but without a line says in the box; without it the box stays empty. */
  emptyText?: string;
}) {
  const { t } = useTranslation();
  const tileUrl = useTileUrl(OFM_POSITRON);
  const route = useMemo(
    // The client reads the contract's tuples loosely; the points are spelled out as pairs here.
    () =>
      line && line.length > 1 ? [line.map((point): [number, number] => [Number(point[0]), Number(point[1])])] : [],
    [line]
  );
  return (
    <div className="relative h-[240px] flex-none overflow-hidden rounded-[14px] border border-edge-faint bg-surface-secondary">
      {route.length > 0 && (
        <MapViewAuto
          places={[]}
          route={route}
          tileUrl={tileUrl}
          focusPoints={route[0]}
          focusKey={focusKey}
          followSelection={false}
        />
      )}
      {status === 'loading' && (
        <span className="absolute inset-0 grid place-items-center text-content-faint">
          <Loader2 size={18} strokeWidth={2.2} className="animate-spin" />
        </span>
      )}
      {(status === 'error' || status === 'offline') && (
        <span
          className="absolute inset-0 grid place-items-center px-6 text-center text-content-muted"
          style={fs(12, 'body')}
        >
          {status === 'offline' ? t('tours.library.offline') : failedText}
        </span>
      )}
      {status === 'ready' && route.length === 0 && emptyText && (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-content-muted"
          style={fs(12, 'body')}
          data-testid="tour-preview-no-line"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-card text-content-faint shadow-sm ring-1 ring-edge-faint">
            <Spline size={16} strokeWidth={2} />
          </span>
          {emptyText}
        </span>
      )}
    </div>
  );
}
