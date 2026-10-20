import { walkStationsOf } from '@trek/shared';
import { useEffect, useState } from 'react';
import { tourRepo } from '../../../repo/tourRepo';
import { randomId } from '../../../utils/randomId';
import { plannerWaypointsOf, type TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';

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
 * CW-03: a saved walk's stations in order: null while they load, none where
 * they could not be read. Read again when the walk is saved (its revision
 * moves on), here or by someone else, so the detail never shows the stations
 * of before; the ones shown stay until the new ones are in.
 */
export function useWalkStations(
  tripId: number | string,
  placeId: number,
  enabled: boolean,
  revision?: number
): TourPlannerWaypoint[] | null {
  const [stations, setStations] = useState<{ placeId: number; points: TourPlannerWaypoint[] } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    tourRepo
      .detail(tripId, placeId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        const points = walkStationsOf(plannerWaypointsOf(detail.waypoints, randomId));
        setStations({ placeId, points: ownStations(points, placeId) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStations({ placeId, points: [] });
      });
    return () => controller.abort();
  }, [enabled, placeId, revision, tripId]);
  return enabled && stations?.placeId === placeId ? stations.points : null;
}
