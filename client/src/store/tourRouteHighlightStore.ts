import { create } from 'zustand';

/**
 * BIK-01 to BIK-05, RUN-02: the stretches of the planned route a card points
 * at (a surface, a kind of way, a trail or hiking grade), drawn over the route
 * on the planner map in the colour of what they are. `paint` names a token of
 * the bike paints, resolved where the map is drawn, so the theme decides the
 * colour.
 */
export interface RouteHighlight {
  /** What is pointed at, so its row can show it is on. */
  id: string;
  lines: [number, number][][];
  paint: string;
}

interface TourRouteHighlightState {
  highlight: RouteHighlight | null;
  show: (highlight: RouteHighlight | null) => void;
  clear: () => void;
}

export const useTourRouteHighlightStore = create<TourRouteHighlightState>((set) => ({
  highlight: null,
  show: (highlight) => set({ highlight }),
  clear: () => set({ highlight: null }),
}));
