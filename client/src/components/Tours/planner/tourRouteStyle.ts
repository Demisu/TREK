import type { TourRoutePart } from './tourRouting';

/**
 * PAD-03: a portage on the map, in an earth brown over a white rim, dotted the
 * way the map draws a walk: the boat is carried there, not paddled. Map
 * colours are literals by design.
 */
export const PORTAGE_LINE_COLOR = '#9a6233'; // theme-lint-disable map colour of a carried stretch
const PORTAGE_CASING_COLOR = '#ffffff'; // theme-lint-disable rim under the carried stretch

export interface TourRouteStyle {
  /** Per line: dotted (a hand-drawn stretch of a hike, a portage) or solid. */
  walking: boolean[] | null;
  /** Per line: the portage brown, or the route's own colour where undefined. */
  colors: ({ line: string; casing: string } | undefined)[] | null;
}

/**
 * How the planner map draws the parts of a tour being edited. A hike draws
 * what no router planned dotted, so a routed path and a hand-drawn one never
 * look alike. A paddle tour is drawn by hand throughout, so its water is the
 * plain line and only its portages stand out, dotted and brown.
 */
export function tourRouteStyle(parts: readonly TourRoutePart[] | null, isPaddle: boolean): TourRouteStyle {
  if (!parts?.length) return { walking: null, colors: null };
  const walking = parts.map((part) => (isPaddle ? !!part.land : part.free));
  const colors = parts.map((part) => (part.land ? { line: PORTAGE_LINE_COLOR, casing: PORTAGE_CASING_COLOR } : undefined));
  return {
    walking: walking.some(Boolean) ? walking : null,
    colors: colors.some(Boolean) ? colors : null,
  };
}
