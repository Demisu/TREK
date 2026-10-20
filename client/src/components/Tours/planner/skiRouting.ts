import type { TourFixedLeg } from '@trek/shared';
import type { SkiChoice } from '../ski/skiChoice';
import { freeLegBetween } from './tourRouteActions';
import { drawnTour, type TourRouteResult } from './tourRouting';

/**
 * SKI-02: how the legs of a planned ski tour are laid. There is no piste
 * router yet, so every leg is drawn straight between its two points, as a leg
 * drawn by hand is, and its heights are read off the ground like any free
 * leg's. No ski time is worked out from it.
 *
 * This file is the one place the piste router plugs in: `skiLegs` will ask it
 * for the legs between the fixed ones and keep a straight leg wherever it
 * finds none, and `skiRouteKey` will name what of the discipline, technique
 * and options the legs were planned for, so a change of them plans the tour
 * again. Nothing else of the planner has to change for it.
 */

interface SkiLegPoint {
  lat: number;
  lng: number;
  fixedLeg?: TourFixedLeg | null;
}

/**
 * What of the ski choice the legs are laid for. A straight leg depends on its
 * two points only, so nothing of the choice yet: a discipline changed plans
 * nothing again.
 */
export function skiRouteKey(_choice: SkiChoice): string {
  return '';
}

/**
 * One leg for each point but the last: the line the point carries (a leg the
 * traveller drew), else a straight line to the next point.
 */
export async function skiLegs(
  points: readonly SkiLegPoint[],
  _choice: SkiChoice,
  _signal?: AbortSignal
): Promise<TourFixedLeg[]> {
  return points.slice(0, -1).map((point, index) => point.fixedLeg ?? freeLegBetween(point, points[index + 1]));
}

/**
 * A ski tour's line from its legs, drawn and never routed: each leg is sampled
 * along its length so the heights read for it follow the ground. Null for
 * fewer than two points or a request called off.
 */
export async function routeSkiTour(
  points: readonly SkiLegPoint[],
  choice: SkiChoice,
  signal?: AbortSignal
): Promise<TourRouteResult | null> {
  if (points.length < 2) return null;
  const legs = await skiLegs(points, choice, signal);
  if (signal?.aborted) return null;
  return drawnTour(points.map((point, index) => ({ ...point, fixedLeg: legs[index] ?? null })));
}
