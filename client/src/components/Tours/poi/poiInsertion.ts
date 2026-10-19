import { nearnessToLine } from '@trek/shared';
import { isClosedLoop, withPointAppended, type RoutePoint } from '../planner/tourRouteActions';

type Point = RoutePoint & { role: string; shaping?: boolean };

/**
 * Why a place cannot go in after a point (PLN-03): the leg after it is a
 * fixed line (a via ferrata, a portage) or drawn by hand, which a new point in
 * between would cut or redraw without being asked; or there is no leg after it
 * to go into (the way back of a loop, a point that is gone).
 */
export type InsertionBlock = 'fixed' | 'free' | 'none';

/** What would stop a place going in after `afterId`, or null when it can. */
export function insertionBlock(points: readonly Point[], afterId: string): InsertionBlock | null {
  const index = points.findIndex((point) => point.id === afterId);
  if (index < 0) return 'none';
  const last = index === points.length - 1;
  // After the last point the tour goes on to the place; after the way back of a loop there is nothing.
  if (last) return isClosedLoop(points) ? 'none' : null;
  const leg = points[index]?.fixedLeg;
  if (leg?.kind === 'free') return 'free';
  if (leg) return 'fixed';
  return null;
}

/**
 * The points with a new stop right after `afterId`: in a leg the router plans,
 * between that point and the next, or as the new end after the last. Null
 * where {@link insertionBlock} says it cannot go; nothing else is changed.
 */
export function withPointAfter<T extends Point>(points: readonly T[], afterId: string, point: T): T[] | null {
  if (insertionBlock(points, afterId) !== null) return null;
  const index = points.findIndex((candidate) => candidate.id === afterId);
  if (index === points.length - 1) return withPointAppended(points, point);
  return [...points.slice(0, index + 1), { ...point, role: 'via' }, ...points.slice(index + 1)];
}

/**
 * The point a place found at `alongM` metres along the route most likely
 * follows: the last point before it along the line, where a stop can go in.
 * The first point that can take one when none lies before it.
 */
export function defaultAfterId(
  points: readonly Point[],
  route: Array<[number, number]> | null,
  alongM: number
): string | null {
  const open = points.filter((point) => insertionBlock(points, point.id) === null);
  if (!open.length) return null;
  const line = route && route.length > 1 ? route : points.map((point): [number, number] => [point.lat, point.lng]);
  let chosen = open[0]?.id ?? null;
  for (const point of open) {
    const along = nearnessToLine(point, line)?.alongM ?? 0;
    if (along <= alongM) chosen = point.id;
  }
  return chosen;
}
