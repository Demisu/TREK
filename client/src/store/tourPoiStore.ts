import type { TourPoi } from '@trek/shared';
import { create } from 'zustand';

/**
 * PLN-02: the places found along the tour in the planner, and the one chosen.
 * The card searches and lists them; the map stage draws them and picks one
 * on a click. Nothing here is kept beyond the view.
 */
export const useTourPoiStore = create<{
  pois: readonly TourPoi[];
  selectedId: string | null;
  publish: (pois: readonly TourPoi[]) => void;
  select: (id: string | null) => void;
  clear: () => void;
}>((set) => ({
  pois: [],
  selectedId: null,
  publish: (pois) => set({ pois, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  clear: () => set({ pois: [], selectedId: null }),
}));
