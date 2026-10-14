import type { TourListItem } from '@trek/shared';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from '../../i18n';
import type { Category, Place } from '../../types';
import { formatTime } from '../../utils/formatters';
import { fs } from '../shared/DialogShell';
import TourDayRowFacts from '../Tours/TourDayRowFacts';
import { formatPlannedTourDuration, type TourPlannedTimes } from '../Tours/tourPresentation';
import { TimePill } from './planParts';

type DayRowTourTimes = TourPlannedTimes & { tour?: TourListItem };

interface DayPlanPlaceSublineProps {
  place: Place;
  cat: Category | undefined;
  tourTimes: DayRowTourTimes | undefined;
  isTourPlace: boolean;
  timeFormat: string;
}

function hasPlannedTimes(tourTimes: DayRowTourTimes | undefined): boolean {
  if (!tourTimes) return false;
  return tourTimes.walkingMinutes != null || tourTimes.breakMinutes != null || tourTimes.plannedTotalMinutes != null;
}

// Walking, break and planned-total pills of a tour stop that has no tour row of its own.
function PlannedTourPills({ tourTimes }: { tourTimes: DayRowTourTimes }) {
  const { t } = useTranslation();
  const manual = tourTimes.manuallyOverridden;
  return (
    <>
      {tourTimes.walkingMinutes != null && (
        <TimePill>
          <span
            data-testid="trip-plan-tour-walking-time"
            aria-label={`${t('tours.planner.inspector.duration')}: ${formatPlannedTourDuration(tourTimes.walkingMinutes)}`}
          >
            {t('tours.planner.walkingShort')}: {formatPlannedTourDuration(tourTimes.walkingMinutes)}
          </span>
        </TimePill>
      )}
      {tourTimes.breakMinutes != null && (
        <TimePill>
          <span
            data-testid="trip-plan-tour-breaks"
            aria-label={`${t('tours.planner.breaksAdditional')}: ${formatPlannedTourDuration(tourTimes.breakMinutes)}`}
          >
            {t('tours.planner.breaksShort')}: {formatPlannedTourDuration(tourTimes.breakMinutes)}
          </span>
        </TimePill>
      )}
      {tourTimes.plannedTotalMinutes != null && (
        <TimePill>
          <span
            data-testid="trip-plan-tour-planned-duration"
            aria-label={`${t('tours.planner.plannedTotalDuration')}: ${formatPlannedTourDuration(tourTimes.plannedTotalMinutes)}${manual ? `, ${t('tours.planner.plannedTotalManual')}` : ''}`}
          >
            {t('tours.planner.plannedShort')}: {formatPlannedTourDuration(tourTimes.plannedTotalMinutes)}
            {manual ? ` · ${t('tours.planner.plannedTotalManual')}` : ''}
          </span>
        </TimePill>
      )}
    </>
  );
}

// Description line; tour stops get two clamped lines instead of one.
function SublineDescription({ text, isTourPlace }: { text: string; isTourPlace: boolean }) {
  return (
    <div
      data-testid={isTourPlace ? 'trip-plan-tour-description' : undefined}
      className="collab-note-md min-w-0 flex-1 text-content-faint"
      style={{
        ...fs(10.5),
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: isTourPlace ? 'normal' : 'nowrap',
        lineHeight: 1.3,
        maxHeight: isTourPlace ? '2.6em' : '1.3em',
        ...(isTourPlace ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const } : {}),
      }}
    >
      <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
    </div>
  );
}

// Second line of a place row in the day plan: time, tour facts or planned
// tour durations, then the clamped description.
export function DayPlanPlaceSubline({ place, cat, tourTimes, isTourPlace, timeFormat }: DayPlanPlaceSublineProps) {
  const { locale } = useTranslation();
  const dayRowTour = tourTimes?.tour;
  const description = place.description || place.address || cat?.name;
  if (!(dayRowTour || place.place_time || hasPlannedTimes(tourTimes) || description)) return null;
  return (
    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
      {place.place_time && (
        <TimePill quiet>
          {formatTime(place.place_time, locale, timeFormat)}
          {place.end_time ? ` – ${formatTime(place.end_time, locale, timeFormat)}` : ''}
        </TimePill>
      )}
      {dayRowTour ? <TourDayRowFacts tour={dayRowTour} /> : tourTimes && <PlannedTourPills tourTimes={tourTimes} />}
      {description && <SublineDescription text={description} isTourPlace={isTourPlace} />}
    </div>
  );
}
