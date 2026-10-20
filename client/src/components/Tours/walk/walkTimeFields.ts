import { walkTimesOf, type WalkTimes } from '../planner/stationModel';
import type { TourMetricField } from '../tourParts';
import { formatPlannedTourDuration, plannedTotalText } from '../tourPresentation';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** What a city walk's stays are known of: how many, how many have no stay entered, and the stays entered. */
type WalkStays = Pick<WalkTimes, 'stayMinutes' | 'unknownStays' | 'stations'>;

/**
 * A city walk's stays as said: their sum, at least the sum while a stay is not
 * entered yet, and not known while none is. A stop passed through counts as
 * the 0 entered for it, so stays all entered as 0 read "0 min".
 */
export function walkStaysText(stays: WalkStays, t: Translate): string {
  if (stays.stations > 0 && stays.unknownStays === stays.stations) return t('tours.walk.station.stayUnknown');
  const time = formatPlannedTourDuration(stays.stayMinutes);
  return stays.unknownStays > 0 ? t('tours.walk.totalAtLeast', { time }) : time;
}

export interface WalkTimeFieldsInput {
  /** How the walking time is named: with its explanation in the planner, short in the tour detail. */
  walking: Omit<TourMetricField, 'value'>;
  walkingMinutes: number | null;
  stays: WalkStays;
  /** A total entered by hand, which stays apart from the one worked out; null when there is none. */
  manualMinutes: number | null;
  t: Translate;
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
  t,
}: WalkTimeFieldsInput): TourMetricField[] {
  const notCalculated = t('tours.planner.walkingTimeUnknown');
  const { stayMinutes, unknownStays, stations } = stays;
  const times = walkTimesOf({ walkingMinutes, stayMinutes, unknownStays, stations });
  const computed =
    plannedTotalText({ plannedTotalMinutes: times.totalMinutes, atLeast: times.partial }, t) ?? notCalculated;
  const parts: TourMetricField[] = [
    { ...walking, value: walkingMinutes == null ? notCalculated : formatPlannedTourDuration(walkingMinutes) },
    { label: t('tours.walk.stays'), value: walkStaysText(stays, t) },
  ];
  const planned = t('tours.planner.plannedShort');
  if (manualMinutes == null) return [...parts, { label: planned, value: computed }];
  return [
    ...parts,
    {
      label: `${planned} (${t('tours.planner.plannedTotalManual')})`,
      value: formatPlannedTourDuration(manualMinutes),
    },
    { label: t('tours.walk.totalComputed'), value: computed },
  ];
}
