import { TOUR_MAX_SNAP_M } from '@trek/shared';
import type { TourRouteResult } from './tourRouting';

/**
 * A point the router found no way for at all: it bound the point to a way
 * this far off (or put the whole run on one spot), which would draw a route
 * that is not where the tour was planned. `unreachable` is the point's place
 * along the tour, counted from 0.
 */
export interface TourRouteUnreachable {
  unreachable: number;
  snappedMeters: number;
}

/** Whether the router's answer is a route, rather than nothing or a point it could not reach. */
export function isTourRoute(value: TourRouteResult | TourRouteUnreachable | null): value is TourRouteResult {
  return !!value && !('unreachable' in value);
}

/** How far the router may move a point onto its way before the point counts as unreachable for the tour's type. */
export const MAX_TOUR_SNAP_M = TOUR_MAX_SNAP_M;
