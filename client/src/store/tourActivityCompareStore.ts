import { create } from 'zustand';

/**
 * ACT-02: the actual track one tour is compared with on the plan map. Only
 * ids: the planned line and the recorded one are both places of the trip, so
 * the map reads them where they are kept and a changed recording or plan
 * shows changed. Comparing is looking; it writes nothing.
 */
interface ActivityComparison {
  /** The planned tour, whose detail is open. */
  tourPlaceId: number;
  /** The recording linked to it as its actual track. */
  trackPlaceId: number;
}

interface TourActivityCompareState {
  comparison: ActivityComparison | null;
  show: (comparison: ActivityComparison | null) => void;
  clear: () => void;
}

export const useTourActivityCompareStore = create<TourActivityCompareState>((set) => ({
  comparison: null,
  show: (comparison) => set({ comparison }),
  clear: () => set({ comparison: null }),
}));
