import type { RouteHighlight } from '../../../store/tourRouteHighlightStore';
import type { BikePaintKey } from './bikePaint';

type Line = [number, number][];
type LineColor = { line: string; casing: string } | undefined;

/**
 * The planner map's lines with a highlight laid over them: the route's own
 * lines first as they were, the highlighted stretches after, solid, in their
 * colour over a rim of the map's own white, so they read over the route.
 * Without a highlight the lines stay exactly as they came.
 */
export function withRouteHighlight(
  highlight: RouteHighlight | null,
  route: Line[] | null,
  walking: boolean[] | null,
  colors: LineColor[] | null,
  paint: Record<BikePaintKey, string>
): { route: Line[] | null; walking: boolean[] | null; colors: LineColor[] | null } {
  if (!highlight?.lines.length || !route?.length) return { route, walking, colors };
  const color = { line: paint[highlight.paint as BikePaintKey] ?? paint.way, casing: paint.casing };
  return {
    route: [...route, ...highlight.lines],
    walking: walking ? [...walking, ...highlight.lines.map(() => false)] : null,
    colors: [...(colors ?? route.map(() => undefined)), ...highlight.lines.map(() => color)],
  };
}
