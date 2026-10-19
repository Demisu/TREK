import { useTourRouteHighlightStore } from '../../../store/tourRouteHighlightStore';
import { useBikePaint } from './bikePaint';
import { withRouteHighlight } from './routeHighlight';

type Lines = Parameters<typeof withRouteHighlight>[1];
type Walking = Parameters<typeof withRouteHighlight>[2];
type Colors = Parameters<typeof withRouteHighlight>[3];

/**
 * BIK-01 to BIK-05: the planner map's route with the stretches a bike tour's
 * card points at laid over it, while `shown` (the route being edited is on
 * the map); otherwise the lines as they came.
 */
export function useHighlightedRoute(shown: boolean, route: Lines, walking: Walking, colors: Colors) {
  const highlight = useTourRouteHighlightStore((state) => state.highlight);
  const paint = useBikePaint();
  return withRouteHighlight(shown ? highlight : null, route, walking, colors, paint);
}
