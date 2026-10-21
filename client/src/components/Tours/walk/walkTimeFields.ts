import { someStaysUnknown, walkTimesOf, type WalkTimes } from '../planner/stationModel';
import type { WalkFerryCrossing } from '../planner/tourRouting';
import type { TourMetricField } from '../tourParts';
import { formatPlannedTourDuration, plannedTotalText } from '../tourPresentation';
import { ferryMinutesOf } from './walkFerry';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** What a city walk's stays are known of: how many, how many have no stay entered, and the stays entered. */
type WalkStays = Pick<WalkTimes, 'stayMinutes' | 'unknownStays' | 'stations'>;

/**
 * A city walk's stays as said: their sum, and at least the sum while some
 * stay is not entered yet. Nothing while no stay is entered at all: the walk
 * is then planned as its walking time, and saying "unknown" at every turn
 * would only be noise. A stop passed through counts as the 0 entered for it,
 * so stays all entered as 0 read "0 min".
 */
export function walkStaysText(stays: WalkStays, t: Translate): string | null {
  if (stays.unknownStays >= stays.stations) return null;
  const time = formatPlannedTourDuration(stays.stayMinutes);
  return someStaysUnknown(stays) ? t('tours.walk.totalAtLeast', { time }) : time;
}

export interface WalkTimeFieldsInput {
  /** How the walking time is named: with its explanation in the planner, short in the tour detail. */
  walking: Omit<TourMetricField, 'value'>;
  walkingMinutes: number | null;
  stays: WalkStays;
  /** A total entered by hand, which stays apart from the one worked out; null when there is none. */
  manualMinutes: number | null;
  /** CW-12: the walk's crossings by boat, whose time is never walking time. */
  ferries?: readonly Pick<WalkFerryCrossing, 'seconds'>[];
  t: Translate;
}

/** CW-12: the time of a walk's crossings by boat, as a field of its own; none without a crossing. */
function ferryField(ferries: readonly Pick<WalkFerryCrossing, 'seconds'>[], t: Translate): TourMetricField[] {
  if (ferries.length === 0) return [];
  const minutes = ferries.map(ferryMinutesOf);
  const known = minutes.every((value) => value !== null);
  return [
    {
      label: t('tours.walk.ferry.field'),
      value: known
        ? formatPlannedTourDuration(minutes.reduce<number>((sum, value) => sum + (value ?? 0), 0))
        : t('tours.walk.ferry.timeUnknown'),
      info: { label: t('tours.walk.ferry.fieldInfoLabel'), description: t('tours.walk.ferry.fieldInfo') },
    },
  ];
}

/**
 * CW-02: a city walk's times as fields, in one wording for the planner and the
 * tour detail: the walking time, the stays, and the planned total of both. A
 * total entered by hand keeps its own label, and the total worked out shows
 * beside it as computed, so the two never read as one. 45 min of walking, a
 * museum of 90 min and a cafe of 30 min read 45 min, 2 h and 2 h 45 min.
 */
export function walkTimeFields({
  walking,
  walkingMinutes,
  stays,
  manualMinutes,
  ferries = [],
  t,
}: WalkTimeFieldsInput): TourMetricField[] {
  const notCalculated = t('tours.planner.walkingTimeUnknown');
  const { stayMinutes, unknownStays, stations } = stays;
  const times = walkTimesOf({ walkingMinutes, stayMinutes, unknownStays, stations });
  const computed =
    plannedTotalText({ plannedTotalMinutes: times.totalMinutes, atLeast: times.partial }, t) ?? notCalculated;
  const staysText = walkStaysText(stays, t);
  const parts: TourMetricField[] = [
    { ...walking, value: walkingMinutes == null ? notCalculated : formatPlannedTourDuration(walkingMinutes) },
    ...ferryField(ferries, t),
    ...(staysText ? [{ label: t('tours.walk.stays'), value: staysText }] : []),
  ];
  const planned = t('tours.planner.plannedShort');
  if (manualMinutes == null) return [...parts, { label: planned, value: computed }];
  return [
    ...parts,
    {
      label: `${planned} (${t('tours.planner.plannedTotalManual')})`,
      // A narrow column names it by what sets it apart from the computed total beside it.
      shortLabel: t('tours.planner.plannedTotalManual'),
      value: formatPlannedTourDuration(manualMinutes),
    },
    { label: t('tours.walk.totalComputed'), value: computed },
  ];
}
