import { TOUR_FIXED_LEG_MAX_POINTS, type PlannableTourType, type TourFixedLeg } from '@trek/shared';
import { haversineKm } from '../../../utils/geo';
import type { WalkFerryCrossing } from '../planner/tourRouting';

interface LegPoint {
  lat: number;
  lng: number;
  fixedLeg?: TourFixedLeg | null;
}

/** CW-12: only a city walk takes a crossing by boat; any other type gives the leg back to its router. */
export function walkOnly<T extends LegPoint>(points: readonly T[], tourType: PlannableTourType): T[] {
  if (tourType === 'walk') return [...points];
  return points.map((point) => {
    if (point.fixedLeg?.kind !== 'ferry') return point;
    const { fixedLeg: _crossing, ...routed } = point;
    return routed as T;
  });
}

/** Closer than this, in metres, a leg's end already is its point. */
const SAME_END_M = 1;

function off(point: LegPoint, end: readonly [number, number] | undefined): boolean {
  return !end || haversineKm(point, { lat: end[0], lng: end[1] }) * 1000 > SAME_END_M;
}

/**
 * CW-12: a crossing taken on purpose, as the ferry leg the walk keeps. The
 * router's line starts and ends where it bound the points, which may lie
 * further off than a fixed leg may; the points themselves are put at its ends,
 * so the leg always joins them. Null for a line longer than a leg may be.
 */
export function ferryLegOf(crossing: WalkFerryCrossing, from: LegPoint, to: LegPoint): TourFixedLeg | null {
  const head = off(from, crossing.geometry[0]);
  const tail = off(to, crossing.geometry[crossing.geometry.length - 1]);
  const geometry: [number, number][] = [
    ...(head ? [[from.lat, from.lng] as [number, number]] : []),
    ...crossing.geometry,
    ...(tail ? [[to.lat, to.lng] as [number, number]] : []),
  ];
  if (geometry.length > TOUR_FIXED_LEG_MAX_POINTS) return null;
  const shift = head ? 1 : 0;
  return {
    kind: 'ferry',
    geometry,
    crossing: [crossing.crossing[0] + shift, crossing.crossing[1] + shift],
    minutes: crossing.seconds === null ? null : Math.round(crossing.seconds / 60),
    walk_minutes: Math.round(crossing.walkSeconds / 60),
  };
}

/** The crossing as a line of its own, for the map to show it. */
export function crossingLine(crossing: WalkFerryCrossing): [number, number][] {
  return crossing.geometry.slice(crossing.crossing[0], crossing.crossing[1] + 1);
}

/** The minutes a crossing takes by boat, null where the router gave none. */
export function ferryMinutesOf(crossing: Pick<WalkFerryCrossing, 'seconds'>): number | null {
  return crossing.seconds === null ? null : Math.max(1, Math.round(crossing.seconds / 60));
}
