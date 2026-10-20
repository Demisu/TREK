import type { TourPoi, WalkTheme } from '@trek/shared';
import { create } from 'zustand';

/** A place taken in as a stop: which point it became, and the route's measures just before. */
export interface InsertedTourPoi {
  pointId: string;
  name: string;
  before: { distanceM: number; minutes: number | null } | null;
  /** How many points the tour had once the place was in; another edit after it ends the comparison. */
  pointCount: number;
}

/**
 * PLN-02: the places found along the tour in the planner, and the one chosen.
 * The card searches and lists them; the map stage draws them and opens the
 * chosen one's card over the map, where it is taken in as a stop. What the
 * last one taken in did is kept here, so the list says it once that card has
 * closed. Nothing here is kept beyond the view.
 */
export const useTourPoiStore = create<{
  pois: readonly TourPoi[];
  /** CW-05: the city walk theme the places were searched for, said as each one's reason. */
  theme: WalkTheme | null;
  selectedId: string | null;
  inserted: InsertedTourPoi | null;
  publish: (pois: readonly TourPoi[], theme?: WalkTheme | null) => void;
  select: (id: string | null) => void;
  setInserted: (inserted: InsertedTourPoi | null) => void;
  clear: () => void;
}>((set) => ({
  pois: [],
  theme: null,
  selectedId: null,
  inserted: null,
  publish: (pois, theme = null) => set({ pois, theme, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  setInserted: (inserted) => set({ inserted }),
  clear: () => set({ pois: [], theme: null, selectedId: null, inserted: null }),
}));
