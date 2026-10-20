import { minutesOf, stationArrivals, stationFit, stationHoursOn, type StationFit } from '@trek/shared';
import type { Day, Place } from '../../../types';
import type { TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';

/**
 * CW-02, CW-04: a city walk's stations on the day it is looked at: the arrival
 * at each, the end of its stay and what its opening hours say, worked out by
 * the rules in `@trek/shared` (`walk-hours.ts`). Nothing is said without a
 * day, a date, a start time and a route with its walking time, so no estimate
 * looks more exact than what it is made of.
 */

/** What a schedule still misses, or `ready`. */
export type WalkScheduleState = 'noDay' | 'noDate' | 'noStart' | 'noRoute' | 'ready';

/** One station on that day: arrival and end of stay in minutes after midnight, and what its hours say. */
export interface StationSchedule {
  arrival: number;
  /** A stay before it is not known, so the arrival may come later. */
  atLeast: boolean;
  /** The end of the stay; null while the stay is not known. */
  leave: number | null;
  fit: StationFit;
}

export interface WalkSchedule {
  state: WalkScheduleState;
  /** Keyed by the waypoint's id; empty unless `ready`. */
  byStation: ReadonlyMap<string, StationSchedule>;
  /** Some station has opening hours to go by. */
  anyHours: boolean;
}

/** The trip place a waypoint stands for, as far as the hours and the name need it. */
export type LinkedPlaceOf = (
  point: Pick<TourPlannerWaypoint, 'linkedPlaceId'>
) => Pick<Place, 'name' | 'opening_hours'> | null;

export interface WalkScheduleInput {
  /** The walk's stations in order: no shaping point, no way back of a loop. Null while they load. */
  stations: readonly TourPlannerWaypoint[] | null;
  route: ReadonlyArray<readonly [number, number]> | null;
  walkingMinutes: number | null;
  /** The day it is looked at, with the walk's start that day; null when it is on none. */
  day: { day: Pick<Day, 'date'>; start: string | null } | null;
  placeOf: LinkedPlaceOf;
}

function emptySchedule(state: WalkScheduleState): WalkSchedule {
  return { state, byStation: new Map(), anyHours: false };
}

/** The date and the start in minutes the arrivals count from, or what is missing for them. */
function startOf(day: WalkScheduleInput['day']): { date: string; start: number } | WalkScheduleState {
  if (!day) return 'noDay';
  if (!day.day.date) return 'noDate';
  const start = minutesOf(day.start);
  return start === null ? 'noStart' : { date: day.day.date, start };
}

export function walkScheduleOf({ stations, route, walkingMinutes, day, placeOf }: WalkScheduleInput): WalkSchedule {
  const from = startOf(day);
  if (typeof from === 'string') return emptySchedule(from);
  if (!stations || !route) return emptySchedule('noRoute');
  const arrivals = stationArrivals(stations, route, from.start, walkingMinutes);
  if (!arrivals) return emptySchedule('noRoute');
  const byStation = new Map<string, StationSchedule>();
  let anyHours = false;
  stations.forEach((station, index) => {
    const at = arrivals[index];
    const hours = stationHoursOn({ place: placeOf(station)?.opening_hours, osm: station.openingHours }, from.date);
    if (hours) anyHours = true;
    const stay = station.stayMinutes ?? null;
    byStation.set(station.id, {
      ...at,
      leave: stay === null ? null : at.arrival + stay,
      fit: stationFit(hours, at, stay),
    });
  });
  return { state: 'ready', byStation, anyHours };
}
