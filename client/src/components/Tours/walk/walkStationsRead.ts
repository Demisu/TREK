import { walkStationsOf } from '@trek/shared';
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
 * CW-03, CW-08: a saved walk's stations in order, as this device can read
 * them: from the server, else from its offline copy. Rejects where neither
 * has the walk.
 */
export async function readWalkStations(
  tripId: number | string,
  placeId: number,
  signal?: AbortSignal
): Promise<TourPlannerWaypoint[]> {
  const detail = await tourRepo.detail(tripId, placeId, signal);
  return ownStations(walkStationsOf(plannerWaypointsOf(detail.waypoints, randomId)), placeId);
}
