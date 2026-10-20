import { walkStationsOf, type TourListItem, type TourVisitStatus } from '@trek/shared';
import { AlertTriangle, Check, CheckCheck, Clock, Redo2, SkipForward, Undo2 } from 'lucide-react';
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
import { CardAction, TourNotice } from '../tourParts';
import { useDayVisits, useWalkProgress } from './walkProgress';
import { clockOf, minutesOf, stationArrivals, stationFit, type StationFit } from './walkSchedule';

let nextId = 0;
const freshId = () => `station-${++nextId}`;

/**
 * CW-03: a synced walk's stations all carry a key. Points without any are the
 * route's ends, which this device reads in their place while it holds none of
 * the stations, so they are not listed as the walk's. A walk saved offline has
 * no keys before it synced, and its stations stay.
 */
function ownStations(points: TourPlannerWaypoint[], placeId: number): TourPlannerWaypoint[] {
  return placeId < 0 || points.some((point) => point.key) ? points : [];
}

/**
 * CW-03: a saved walk's stations in order, read once for the dialog; null while
 * they load, none where they could not be read.
 */
function useWalkStations(tripId: number | string, placeId: number): TourPlannerWaypoint[] | null {
  const [stations, setStations] = useState<{ placeId: number; points: TourPlannerWaypoint[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    tourRepo
      .detail(tripId, placeId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        const points = walkStationsOf(plannerWaypointsOf(detail.waypoints, freshId));
        setStations({ placeId, points: ownStations(points, placeId) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStations({ placeId, points: [] });
      });
    return () => controller.abort();
  }, [placeId, tripId]);
  return stations?.placeId === placeId ? stations.points : null;
}

/**
 * CW-03: a walk's progress on one of its days, as a pill of the day row:
 * how many of its stations were visited. Nothing is shown before any is.
 */
export function WalkProgressPill({ tour, assignmentId }: { tour: TourListItem; assignmentId: number | undefined }) {
  const { t } = useTranslation();
  const progress = useWalkProgress(tour, assignmentId);
  if (!progress) return null;
  return (
    <TourDayRowPill
      icon={CheckCheck}
      value={`${progress.visited}/${progress.total}`}
      label={t('tours.walk.progress', progress)}
      testId="plan-walk-progress"
    />
  );
}

/**
 * Whether the stations can be checked off from here: not without a day or the
 * right to plan it, and not yet on a day put on the plan offline, which the
 * server does not know until it synced.
 */
function markState(canMark: boolean, assignmentId: number | null): 'none' | 'ready' | 'notSynced' {
  if (!canMark || assignmentId === null) return 'none';
  return assignmentId < 0 ? 'notSynced' : 'ready';
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

/** CW-04: what the arrival at a station meets, said only where it can be known. */
function StationHours({ fit, arrival, atLeast }: { fit: StationFit; arrival: number; atLeast: boolean }) {
  const { t } = useTranslation();
  const time = clockOf(arrival);
  const conflict =
    fit.kind === 'closed'
      ? t('tours.walk.hours.closed', { arrival: time })
      : fit.kind === 'closes'
        ? t('tours.walk.hours.closes', { arrival: time, leave: clockOf(fit.leave), closes: clockOf(fit.closes) })
        : null;
  return (
    <span className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1 text-content-muted" style={fs(11, 'body')}>
        <Clock size={11} strokeWidth={2.2} aria-hidden="true" />
        {t(atLeast ? 'tours.walk.arrivalAtLeast' : 'tours.walk.arrival', { time })}
      </span>
      {conflict && (
        <span
          className="inline-flex items-start gap-1 text-warning"
          style={fs(11, 'body')}
          data-testid="walk-station-conflict"
        >
          <AlertTriangle size={11} strokeWidth={2.2} className="mt-0.5 flex-none" aria-hidden="true" />
          {conflict}
        </span>
      )}
      {fit.kind === 'unread' && (
        <span className="text-content-faint" style={fs(10.5, 'body')}>
          {t('tours.walk.hours.unread', { text: fit.hours })}
        </span>
      )}
    </span>
  );
}

/** One station of the list: its number or mark, name, stay and the day's arrival, and what can be marked. */
function StationRow({
  station,
  index,
  status,
  arrival,
  date,
  onMark,
}: {
  station: TourPlannerWaypoint;
  index: number;
  status: TourVisitStatus | undefined;
  arrival: { arrival: number; atLeast: boolean } | null;
  date: string | null;
  onMark: ((status: TourVisitStatus | 'planned') => void) | null;
}) {
  const { t } = useTranslation();
  return (
    <li
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
        {arrival && date && (
          <StationHours
            fit={stationFit(station.openingHours, date, arrival.arrival, station.stayMinutes ?? 0)}
            arrival={arrival.arrival}
            atLeast={arrival.atLeast}
          />
        )}
        {status && (
          <span className="text-content-faint" style={fs(11, 'body')}>
            {t(status === 'visited' ? 'tours.walk.visit.isVisited' : 'tours.walk.visit.isSkipped')}
          </span>
        )}
      </span>
      {onMark && <StatusActions status={status} onMark={onMark} />}
    </li>
  );
}

/**
 * The lines above the stations: loading, stations that could not be read, what
 * is missing for arrivals, where the hours come from, where to check off.
 */
function WalkStationsNotes({
  loading,
  unread,
  any,
  noStart,
  hoursShown,
  fromDay,
  notSynced,
}: {
  loading: boolean;
  unread: boolean;
  any: boolean;
  noStart: boolean;
  hoursShown: boolean;
  fromDay: boolean;
  notSynced: boolean;
}) {
  const { t } = useTranslation();
  const quiet = (text: string) => (
    <span className="text-content-faint" style={fs(11, 'body')}>
      {text}
    </span>
  );
  if (loading) return quiet(t('common.loading'));
  return (
    <>
      {unread && quiet(t('tours.walk.stationsUnread'))}
      {any && noStart && quiet(t('tours.walk.hours.noStart'))}
      {hoursShown && <TourNotice icon={<Clock size={13} strokeWidth={2} />}>{t('tours.walk.hours.source')}</TourNotice>}
      {any && fromDay && quiet(t('tours.walk.visit.fromDay'))}
      {any && notSynced && quiet(t('tours.walk.visit.notSynced'))}
    </>
  );
}

/** CW-04: what the stations are checked against: the day, its start and the route. */
export interface WalkDay {
  /** `YYYY-MM-DD`; null on a day without a date. */
  date: string | null;
  /** `HH:MM` the walk starts that day; null when none is set. */
  start: string | null;
  route: ReadonlyArray<readonly [number, number]>;
  walkingMinutes: number | null;
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
  day = null,
}: {
  tour: TourListItem;
  tripId: number | string;
  /** The day the dialog was opened from; without one there is nothing to check off. */
  assignmentId: number | null;
  canMark: boolean;
  /** CW-04: the day it was opened from, for arrivals and opening hours. */
  day?: WalkDay | null;
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
  const start = minutesOf(day?.start);
  const arrivals = stations && day?.date ? stationArrivals(stations, day.route, start, day.walkingMinutes) : null;
  const listed = stations ?? [];
  const anyHours = listed.some((station) => station.openingHours);
  const visited = listed.filter((station) => station.key && visits?.[station.key] === 'visited').length;
  const marking = markState(canMark, assignmentId);
  return (
    <DialogSection
      className="flex-none"
      label={t('tours.walk.stations')}
      action={
        // No count where the stations could not be read: it would contradict the day row's.
        assignmentId !== null && listed.length > 0 ? (
          <SoftPill>{t('tours.walk.progress', { visited, total: listed.length })}</SoftPill>
        ) : undefined
      }
    >
      <div data-testid="walk-stations" className="flex flex-col gap-2">
        <WalkStationsNotes
          loading={stations === null}
          unread={stations?.length === 0 && tour.station_count !== 0}
          any={listed.length > 0}
          noStart={!!day && start === null}
          hoursShown={!!arrivals && anyHours}
          fromDay={assignmentId === null}
          notSynced={marking === 'notSynced'}
        />
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {listed.map((station, index) => (
            <StationRow
              key={station.id}
              station={station}
              index={index}
              status={station.key ? visits?.[station.key] : undefined}
              arrival={arrivals?.[index] ?? null}
              date={day?.date ?? null}
              onMark={marking === 'ready' && station.key ? (next) => onMark(station.key ?? '', next) : null}
            />
          ))}
        </ol>
      </div>
    </DialogSection>
  );
}
