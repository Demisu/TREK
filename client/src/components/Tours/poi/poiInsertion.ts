import { haversineMetres, isClosedLoop, nearnessToLine } from '@trek/shared';
import { withPointAppended, type RoutePoint } from '../planner/tourRouteActions';

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

/**
 * The point a place goes in after: the one picked for it while that point is
 * still there (not undone, not removed), else the suggestion.
 */
export function chosenAfterId(
  points: readonly Point[],
  route: Array<[number, number]> | null,
  place: { id: string; along_m: number },
  picked: { poiId: string; afterId: string } | null
): string | null {
  if (picked?.poiId === place.id && points.some((point) => point.id === picked.afterId)) return picked.afterId;
  return defaultAfterId(points, route, place.along_m);
}

/**
 * PLN-04: where a place can go, one slot per point: between it and the next
 * point, or after the last as the new end, which makes the tour longer. A
 * slot that cannot take it says why, so the list can show it dimmed.
 */
export interface InsertionSlot {
  afterId: string;
  /** The point it would go in before; null where it would become the new end. */
  beforeId: string | null;
  block: InsertionBlock | null;
}

export function insertionSlots(points: readonly Point[]): InsertionSlot[] {
  return points.map((point, index) => ({
    afterId: point.id,
    beforeId: points[index + 1]?.id ?? null,
    block: insertionBlock(points, point.id),
  }));
}

/**
 * The straight lines a place would add in the slot after `afterId`: from that
 * point to the place and on to the next, or only to the place as the new
 * end. Null where it cannot go there.
 */
export function insertionPreview(
  points: readonly Point[],
  afterId: string,
  place: { lat: number; lng: number }
): Array<[number, number]> | null {
  if (insertionBlock(points, afterId) !== null) return null;
  const index = points.findIndex((point) => point.id === afterId);
  const from = points[index];
  if (!from) return null;
  const to = points[index + 1];
  const line: Array<[number, number]> = [
    [from.lat, from.lng],
    [place.lat, place.lng],
  ];
  return to ? [...line, [to.lat, to.lng]] : line;
}

/** How much longer the preview's lines make the tour, as the crow flies; the route planned after says it exactly. */
export function straightDetourM(line: ReadonlyArray<[number, number]>): number {
  const legs = (path: ReadonlyArray<[number, number]>) =>
    path.slice(1).reduce((sum, [lat, lng], index) => {
      const [fromLat, fromLng] = path[index] ?? [lat, lng];
      return sum + haversineMetres(fromLat, fromLng, lat, lng);
    }, 0);
  const first = line[0];
  const last = line[line.length - 1];
  const replaced = line.length > 2 && first && last ? legs([first, last]) : 0;
  return Math.max(0, legs(line) - replaced);
}
