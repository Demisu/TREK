import { useEffect, useState } from 'react';
import type { TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';
import { readWalkStations } from './walkStationsRead';

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
    readWalkStations(tripId, placeId, controller.signal)
      .then((points) => {
        if (!controller.signal.aborted) setStations({ placeId, points });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStations({ placeId, points: [] });
      });
    return () => controller.abort();
  }, [enabled, placeId, revision, tripId]);
  return enabled && stations?.placeId === placeId ? stations.points : null;
}
