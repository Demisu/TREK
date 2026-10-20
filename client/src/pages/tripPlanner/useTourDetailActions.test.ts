// P2D-XD-01: from a tour's packing link to the trip's Lists tab, the tour's detail closed on the way.
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTourDetailActions } from './useTourDetailActions';
import type { useTripPlanner } from './useTripPlanner';

describe('useTourDetailActions', () => {
  it('FE-TOUR-DETAIL-ACTIONS-001: opening the packing list closes the tour and switches to the Lists tab', () => {
    const planner = { setSelectedPlaceId: vi.fn(), handleTabChange: vi.fn() };
    const { result } = renderHook(() =>
      useTourDetailActions(planner as unknown as ReturnType<typeof useTripPlanner>)
    );
    result.current.onOpenPacking();
    expect(planner.setSelectedPlaceId).toHaveBeenCalledWith(null);
    expect(planner.handleTabChange).toHaveBeenCalledWith('listen');
  });
});
