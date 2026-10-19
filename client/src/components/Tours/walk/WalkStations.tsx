import type { TourListItem, TourVisitStatus } from '@trek/shared';
import { Check, CheckCheck, Redo2, SkipForward, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { tourRepo } from '../../../repo/tourRepo';
import { useTourVisitStore } from '../../../store/tourVisitStore';
import { SoftPill } from '../../Planner/planParts';
import { DialogSection, fs } from '../../shared/DialogShell';
import { useToast } from '../../shared/Toast';
import { StationPills } from '../planner/stationParts';
import { plannerWaypointsOf, type TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';
import { TourDayRowPill } from '../TourDayRowFacts';
import { CardAction } from '../tourParts';

let nextId = 0;
const freshId = () => `station-${++nextId}`;

/** CW-03: a saved walk's stations in order, read once for the dialog; null while they load or could not be read. */
function useWalkStations(tripId: number | string, placeId: number): TourPlannerWaypoint[] | null {
  const [stations, setStations] = useState<{ placeId: number; points: TourPlannerWaypoint[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    tourRepo
      .detail(tripId, placeId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        const points = plannerWaypointsOf(detail.waypoints, freshId).filter((point) => !point.shaping);
        setStations({ placeId, points });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStations({ placeId, points: [] });
      });
    return () => controller.abort();
  }, [placeId, tripId]);
  return stations?.placeId === placeId ? stations.points : null;
}

/** The day's status of each station, by its key. */
function useDayVisits(assignmentId: number | null) {
  return useTourVisitStore((state) => (assignmentId === null ? undefined : state.byAssignment[assignmentId]));
}

/**
 * CW-03: a walk's progress on one of its days, as a pill of the day row:
 * how many of its stations were visited. Nothing is shown before any is.
 */
export function WalkProgressPill({ tour, assignmentId }: { tour: TourListItem; assignmentId: number | undefined }) {
  const { t } = useTranslation();
  const visits = useDayVisits(assignmentId ?? null);
  const total = tour.station_count ?? 0;
  if (tour.tour_type !== 'walk' || total === 0 || !visits) return null;
  const visited = Object.values(visits).filter((status) => status === 'visited').length;
  if (visited === 0 && Object.keys(visits).length === 0) return null;
  const label = t('tours.walk.progress', { visited, total });
  return <TourDayRowPill icon={CheckCheck} value={`${visited}/${total}`} label={label} testId="plan-walk-progress" />;
}

function StatusActions({
  status,
  onMark,
}: {
  status: TourVisitStatus | undefined;
  onMark: (status: TourVisitStatus | 'planned') => void;
}) {
  const { t } = useTranslation();
  if (status)
    return (
      <CardAction icon={<Undo2 size={12} strokeWidth={2} />} onClick={() => onMark('planned')}>
        {t('tours.walk.visit.undo')}
      </CardAction>
    );
  return (
    <span className="flex flex-wrap gap-1.5">
      <CardAction icon={<Check size={12} strokeWidth={2.2} />} onClick={() => onMark('visited')}>
        {t('tours.walk.visit.visited')}
      </CardAction>
      <CardAction icon={<SkipForward size={12} strokeWidth={2} />} onClick={() => onMark('skipped')}>
        {t('tours.walk.visit.skip')}
      </CardAction>
    </span>
  );
}

/**
 * CW-03: a city walk's stations in its detail, in order, each with its stay,
 * importance and protection; opened from a day, each can be marked visited or
 * skipped for that day and taken back. Marking changes no route, place or order.
 */
export function WalkStationsCard({
  tour,
  tripId,
  assignmentId,
  canMark,
}: {
  tour: TourListItem;
  tripId: number | string;
  /** The day the dialog was opened from; without one there is nothing to check off. */
  assignmentId: number | null;
  canMark: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const stations = useWalkStations(tripId, tour.place_id);
  const visits = useDayVisits(assignmentId);
  const mark = useTourVisitStore((state) => state.mark);
  if (tour.tour_type !== 'walk') return null;
  const onMark = (key: string, status: TourVisitStatus | 'planned') => {
    if (assignmentId === null) return;
    mark(tripId, assignmentId, key, status).catch(() => toast.error(t('tours.walk.visit.failed')));
  };
  const visited = stations
    ? stations.filter((station) => station.key && visits?.[station.key] === 'visited').length
    : 0;
  return (
    <DialogSection
      className="flex-none"
      label={t('tours.walk.stations')}
      action={
        stations && assignmentId !== null ? (
          <SoftPill>{t('tours.walk.progress', { visited, total: stations.length })}</SoftPill>
        ) : undefined
      }
    >
      <div data-testid="walk-stations" className="flex flex-col gap-2">
        {stations === null && (
          <span className="text-content-muted" style={fs(11.5, 'body')}>
            {t('common.loading')}
          </span>
        )}
        {assignmentId === null && stations && stations.length > 0 && (
          <span className="text-content-faint" style={fs(11, 'body')}>
            {t('tours.walk.visit.fromDay')}
          </span>
        )}
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {(stations ?? []).map((station, index) => {
            const status = station.key ? visits?.[station.key] : undefined;
            return (
              <li
                key={station.id}
                data-testid="walk-station"
                className={`flex items-start gap-2.5 rounded-[10px] px-1.5 py-1.5 ${status ? 'opacity-70' : ''}`}
              >
                <span
                  className="grid h-6 w-6 flex-none place-items-center rounded-full bg-surface-tertiary font-geist tabular-nums text-content-secondary"
                  style={fs(11)}
                >
                  {status === 'visited' ? (
                    <Check size={12} strokeWidth={2.4} />
                  ) : status === 'skipped' ? (
                    <Redo2 size={12} strokeWidth={2} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span
                    className={`truncate font-semibold text-content ${status === 'skipped' ? 'line-through' : ''}`}
                    style={fs(12.5, 'body')}
                  >
                    {station.name ?? t('tours.walk.stationNumbered', { number: index + 1 })}
                  </span>
                  <StationPills point={station} />
                  {status && (
                    <span className="text-content-faint" style={fs(11, 'body')}>
                      {t(status === 'visited' ? 'tours.walk.visit.isVisited' : 'tours.walk.visit.isSkipped')}
                    </span>
                  )}
                </span>
                {canMark && assignmentId !== null && station.key && (
                  <StatusActions status={status} onMark={(next) => onMark(station.key ?? '', next)} />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </DialogSection>
  );
}
