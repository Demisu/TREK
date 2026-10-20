// P2D-XD-01: from a tour's packing link to the trip's Lists tab, the tour's detail closed on the way.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListsSubTab } from '../../hooks/useListsSubTab';
import { useTourDetailActions } from './useTourDetailActions';
import type { useTripPlanner } from './useTripPlanner';

describe('useTourDetailActions', () => {
  const planner = () => ({ tripId: 5, setSelectedPlaceId: vi.fn(), handleTabChange: vi.fn() });
  const actions = (p: ReturnType<typeof planner>) =>
    renderHook(() => useTourDetailActions(p as unknown as ReturnType<typeof useTripPlanner>)).result.current;

  it('FE-TOUR-DETAIL-ACTIONS-001: opening the packing list closes the tour and switches to the Lists tab', () => {
    const p = planner();
    actions(p).onOpenPacking();
    expect(p.setSelectedPlaceId).toHaveBeenCalledWith(null);
    expect(p.handleTabChange).toHaveBeenCalledWith('listen');
  });

  it('FE-TOUR-DETAIL-ACTIONS-002: the Lists tab opens on packing even when the to-dos were last open', () => {
    sessionStorage.setItem('trip-lists-subtab-5', 'todo');
    actions(planner()).onOpenPacking();
    expect(renderHook(() => useListsSubTab(5)).result.current[0]).toBe('packing');
  });

  it('FE-TOUR-DETAIL-ACTIONS-003: a Lists tab already on screen on the to-dos switches to packing', () => {
    sessionStorage.setItem('trip-lists-subtab-5', 'todo');
    const lists = renderHook(() => useListsSubTab(5));
    expect(lists.result.current[0]).toBe('todo');
    const a = actions(planner());
    act(() => a.onOpenPacking());
    expect(lists.result.current[0]).toBe('packing');
  });
});
