import type { PaddleFeature, PaddleGeometry } from './paddle-obstacles.schema';

/**
 * PAD-05A/05B: how an obstacle stands to a paddle route. Only a line that
 * crosses it, or passes within ON_ROUTE_M, makes it an obstacle on the route.
 * Within NEAR_M it is near, and stays uncertain: a weir on the next arm of a
 * river is close without being in the way. Farther off it is not related.
 */

/** Closer than this, in metres, the route meets the object. */
export const ON_ROUTE_M = 25;
/** Closer than this the object is near the route, its relation to it uncertain. */
export const NEAR_M = 150;

export type PaddleRelation = 'on_route' | 'near';

export interface RelatedObstacle {
  feature: PaddleFeature;
  relation: PaddleRelation;
  /** The shortest distance between the route and the object, in metres. */
  distanceM: number;
  /** How far along the route the closest point lies, in metres from its start. */
  alongM: number;
}

type LatLng = readonly [number, number];

const METRES_PER_DEG = 111_195;

interface Local {
  x: number;
  y: number;
}

/** A flat view around a latitude, good to a few metres over the length of a day tour. */
function projector(lat0: number): (lat: number, lng: number) => Local {
  const cos = Math.cos((lat0 * Math.PI) / 180);
  return (lat, lng) => ({ x: lng * METRES_PER_DEG * cos, y: lat * METRES_PER_DEG });
}

function closestOnSegment(p: Local, a: Local, b: Local): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return { distance: Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy), t };
}

function crosses(a: Local, b: Local, c: Local, d: Local): number | null {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (denominator === 0) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** The object's outline as segments (a point is one segment of length zero). */
function segmentsOf(geometry: PaddleGeometry, project: (lat: number, lng: number) => Local): Array<[Local, Local]> {
  const line =
    geometry.type === 'Point'
      ? [geometry.coordinates, geometry.coordinates]
      : geometry.type === 'LineString'
        ? geometry.coordinates
        : (geometry.coordinates[0] ?? []);
  const points = line.map(([lng, lat]) => project(lat, lng));
  const segments: Array<[Local, Local]> = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) segments.push([a, b]);
  }
  return segments;
}

/**
 * The obstacles on or near a route, in the order the route reaches them. The
 * route is `[lat, lng]` pairs as the planner draws it; an empty or one-point
 * route relates nothing.
 */
export function relateObstaclesToRoute(
  route: readonly LatLng[],
  features: readonly PaddleFeature[],
): RelatedObstacle[] {
  if (route.length < 2) return [];
  const project = projector(route[0]?.[0] ?? 0);
  const path = route.map(([lat, lng]) => project(lat, lng));
  const along: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Local;
    const b = path[i] as Local;
    along.push((along[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const related: RelatedObstacle[] = [];
  for (const feature of features) {
    let best = { distance: Number.POSITIVE_INFINITY, alongM: 0 };
    const outline = segmentsOf(feature.geometry, project);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as Local;
      const b = path[i] as Local;
      const start = along[i - 1] ?? 0;
      const length = (along[i] ?? start) - start;
      for (const [c, d] of outline) {
        const hit = crosses(a, b, c, d);
        if (hit !== null) {
          if (best.distance > 0 || start + hit * length < best.alongM) best = { distance: 0, alongM: start + hit * length };
          continue;
        }
        for (const p of [c, d]) {
          const near = closestOnSegment(p, a, b);
          if (near.distance < best.distance) best = { distance: near.distance, alongM: start + near.t * length };
        }
      }
    }
    if (best.distance > NEAR_M) continue;
    related.push({
      feature,
      relation: best.distance <= ON_ROUTE_M ? 'on_route' : 'near',
      distanceM: Math.round(best.distance),
      alongM: Math.round(best.alongM),
    });
  }
  return related.sort((a, b) => a.alongM - b.alongM);
}
