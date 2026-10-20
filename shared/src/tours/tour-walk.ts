/** Closer than this, in degrees, two points of a tour stand on the same spot (about a centimetre). */
const SAME_SPOT_DEG = 1e-7;

interface Spot {
  lat: number;
  lng: number;
}

function sameSpot(a: Spot, b: Spot): boolean {
  return Math.abs(a.lat - b.lat) < SAME_SPOT_DEG && Math.abs(a.lng - b.lng) < SAME_SPOT_DEG;
}

/**
 * PR1-01: whether a tour ends where it starts. Read from the points
 * themselves, so a saved loop opens as a loop again without a flag of its
 * own; a tour of two points on one spot is no loop, there is nothing to
 * return from.
 */
export function isClosedLoop(points: readonly Spot[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  return points.length >= 3 && !!first && !!last && sameSpot(first, last);
}

/**
 * CW-02, CW-03: the stations of a city walk in their order. A shaping point
 * only steers the route, and the way back of a loop is its start again, so
 * neither is a station: nothing to stay at, check off or count twice.
 */
export function walkStationsOf<T extends Spot & { shaping?: boolean | null }>(points: readonly T[]): T[] {
  const route = isClosedLoop(points) ? points.slice(0, -1) : points;
  return route.filter((point) => !point.shaping);
}
