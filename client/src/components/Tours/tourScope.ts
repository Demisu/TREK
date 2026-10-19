import type { TourListItem, TourTypeKey } from '@trek/shared';
import { heightsUnknown } from './tourFacts';
import { tourPlannedTimes, tourSource } from './tourPresentation';

/**
 * A sum over the tours that have the value, with how many have it of how many
 * could: `value` is null when none has it, never a zero standing in for
 * "unknown", and `known < of` says the sum is short of the whole.
 */
export interface ScopeSum {
  value: number | null;
  known: number;
  of: number;
}

/** One tour type's share of the trip: how many tours, how many on a day, and their measures. */
export interface TourTypeScope {
  type: TourTypeKey;
  count: number;
  onDays: number;
  distanceKm: ScopeSum;
  ascentM: ScopeSum;
  descentM: ScopeSum;
  /** The time the router worked out, for the tours planned in TREK. */
  routedMinutes: ScopeSum;
  /** The time an import brought with it (a GPX file, a wanderer trail). */
  importedMinutes: ScopeSum;
  /** The time planned for the day, breaks or the planner's own figure included. */
  plannedMinutes: ScopeSum;
}

export interface TourScope {
  count: number;
  onDays: number;
  /** By type, the most tours first; the time kinds are never added up across types. */
  types: TourTypeScope[];
}

/** A measure a type has no use for: no value, and nothing it is short of. */
const NO_SUM: ScopeSum = { value: null, known: 0, of: 0 };

function sumOf(values: Array<number | null | undefined>): ScopeSum {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value));
  return {
    value: known.length ? known.reduce((total, value) => total + value, 0) : null,
    known: known.length,
    of: values.length,
  };
}

function scopeOfType(type: TourTypeKey, tours: readonly TourListItem[]): TourTypeScope {
  const planned = tours.filter((tour) => tourSource(tour) === 'trek');
  const imported = tours.filter((tour) => tourSource(tour) !== 'trek');
  // A paddle tour drawn in TREK has no true heights (they would be the banks'), so it does not count as having them.
  const withHeights = tours.map((tour) => (heightsUnknown(tour) ? null : tour));
  // On the water a climb says nothing: paddling sums no heights, whatever a recorded track brought.
  const heights = type !== 'kayak';
  return {
    type,
    count: tours.length,
    onDays: tours.filter((tour) => tour.planned).length,
    distanceKm: sumOf(tours.map((tour) => tour.distance)),
    ascentM: heights ? sumOf(withHeights.map((tour) => tour?.elevation_gain)) : NO_SUM,
    descentM: heights ? sumOf(withHeights.map((tour) => tour?.elevation_loss)) : NO_SUM,
    routedMinutes: sumOf(planned.map((tour) => tour.duration)),
    importedMinutes: sumOf(imported.map((tour) => tour.duration)),
    plannedMinutes: sumOf(tours.map((tour) => tourPlannedTimes(tour).plannedTotalMinutes)),
  };
}

/**
 * STA-01: what the tours of a trip add up to, by type. Each tour counts once,
 * however many days it is on; the list is the trip's tours, one row each, so
 * a tour on three days is still one tour and one distance.
 */
export function tourScopeSummary(tours: readonly TourListItem[]): TourScope {
  const byType = new Map<TourTypeKey, TourListItem[]>();
  for (const tour of new Map(tours.map((tour) => [tour.place_id, tour])).values()) {
    byType.set(tour.tour_type, [...(byType.get(tour.tour_type) ?? []), tour]);
  }
  const types = [...byType.entries()]
    .map(([type, ofType]) => scopeOfType(type, ofType))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  return {
    count: types.reduce((total, scope) => total + scope.count, 0),
    onDays: types.reduce((total, scope) => total + scope.onDays, 0),
    types,
  };
}
