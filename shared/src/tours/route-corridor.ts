/**
 * Where a point lies against a route: how far it is from the line and how far
 * along the line its nearest spot is, both in metres. A tour spans a few tens
 * of kilometres at most, so the line is laid flat around its own latitude,
 * which is exact to well under a metre at that span.
 *
 * Shared by the planner's place picker (PR1-10) and the search for places
 * along a route (PR1-11A), so both measure the corridor the same way.
 */

const EARTH_M = 6_371_000;
const RAD = Math.PI / 180;

type Coordinate = readonly [number, number, ...number[]] | readonly number[];

export interface RouteNearness {
  /** Metres from the point to the nearest spot of the line. */
  distanceM: number;
  /** Metres along the line to that spot. */
  alongM: number;
}

function flatten(line: readonly Coordinate[]) {
  const meanLat = line.reduce((sum, p) => sum + Number(p[0]), 0) / Math.max(line.length, 1);
  const kx = Math.cos(meanLat * RAD) * EARTH_M * RAD;
  const ky = EARTH_M * RAD;
  return (lat: number, lng: number): [number, number] => [lng * kx, lat * ky];
}

/** How near the point is to a line of `[lat, lng]` points; null for a line of fewer than two. */
export function nearnessToLine(point: { lat: number; lng: number }, line: readonly Coordinate[]): RouteNearness | null {
  if (line.length < 2) return null;
  const flat = flatten(line);
  const [px, py] = flat(point.lat, point.lng);
  let best: RouteNearness | null = null;
  let walked = 0;
  const points = line.map((p) => flat(Number(p[0]), Number(p[1])));
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1] as [number, number];
    const [bx, by] = points[i] as [number, number];
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
    const distanceM = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (!best || distanceM < best.distanceM) best = { distanceM, alongM: walked + t * Math.sqrt(length2) };
    walked += Math.sqrt(length2);
  }
  return best;
}
