import type { PaddleCoverageRegion, PaddleCoverageState, PaddleFeature, RelatedObstacle } from '@trek/shared';
import { create } from 'zustand';

/** Whether the obstacles around the open paddle tour are there to show, and if not, why. */
export type PaddleObstacleStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'error';

interface PaddleObstacleState {
  status: PaddleObstacleStatus;
  /** Every object read around the route. */
  features: PaddleFeature[];
  /** The ones on or near the route, in the order the route reaches them. */
  related: RelatedObstacle[];
  coverage: PaddleCoverageState;
  regions: PaddleCoverageRegion[];
  truncated: boolean;
  /** The object whose card is open, by OSM reference; the map and the checklist show the same one. */
  selectedRef: string | null;
}

const EMPTY: PaddleObstacleState = {
  status: 'idle',
  features: [],
  related: [],
  coverage: 'none',
  regions: [],
  truncated: false,
  selectedRef: null,
};

/**
 * PAD-05B: the paddle obstacles of the tour open in the planner, shared by
 * the map that draws them and the rails that list them. One sync hook writes
 * it; everything else reads.
 */
export const usePaddleObstacleStore = create<PaddleObstacleState>(() => EMPTY);

export function publishPaddleObstacles(next: Omit<PaddleObstacleState, 'selectedRef'>): void {
  usePaddleObstacleStore.setState((state) => ({
    ...next,
    // A selection that is no longer among the objects is dropped with them.
    selectedRef: next.features.some((feature) => feature.ref === state.selectedRef) ? state.selectedRef : null,
  }));
}

export function selectPaddleObstacle(ref: string | null): void {
  usePaddleObstacleStore.setState({ selectedRef: ref });
}

export function clearPaddleObstacles(): void {
  usePaddleObstacleStore.setState(EMPTY);
}
