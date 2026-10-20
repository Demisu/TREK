// FE-TOUR-STAGE-RAIL-001 to FE-TOUR-STAGE-RAIL-005: unfolding a multi-day tour in the planner's list and
// opening one of its stages there (MDT-02).
import type { TourListItem } from '@trek/shared';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TourPlannerController } from '../planner/useTourPlanner';
import type { TourStage } from './tourStages';
import { useSavedTourStages } from './useSavedTourStages';
import { useTourStageRail } from './useTourStageRail';

const TOUR = { place_id: 81, name: 'Hut to hut', tour_type: 'hike', stage_count: 2 } as TourListItem;
const SECOND: TourStage = {
  number: 2,
  from: 1,
  to: 2,
  fromId: 'p2',
  toId: 'p3',
  distanceKm: 4,
  gain: 300,
  loss: 100,
  minutes: 120,
  fromM: 3000,
  toM: 7000,
  overDay: false,
};

type Mode = TourPlannerController['mode'];

function plannerOf(mode: Mode, opened = true) {
  return {
    mode,
    waypoints: opened
      ? [
          { id: 'p1', key: 'stop-start' },
          { id: 'p2', key: 'stop-hut', stageEnd: true },
          { id: 'p3', key: 'stop-end' },
        ]
      : [],
    stages: { stages: opened ? [{ ...SECOND, number: 1, from: 0, to: 1, fromId: 'p1', toId: 'p2' }, SECOND] : [] },
    routeAnalysis: null,
    setSelectedWaypointId: vi.fn(),
    setRouteProfileFocus: vi.fn(),
  } as unknown as TourPlannerController;
}

describe('useTourStageRail', () => {
  it('FE-TOUR-STAGE-RAIL-001: unfolds and folds a tour', () => {
    const { result } = renderHook(() => useTourStageRail(plannerOf({ type: 'new-draft' }), vi.fn()));
    expect(result.current.isUnfolded(81)).toBe(false);
    act(() => result.current.toggle(81));
    expect(result.current.isUnfolded(81)).toBe(true);
    act(() => result.current.toggle(81));
    expect(result.current.isUnfolded(81)).toBe(false);
  });

  it('FE-TOUR-STAGE-RAIL-002: opens the tour, then shows the stage once its points are in', () => {
    const openTour = vi.fn();
    let planner = plannerOf({ type: 'new-draft' });
    const { result, rerender } = renderHook(() => useTourStageRail(planner, openTour));
    act(() => result.current.openStage(TOUR, 'stop-hut'));
    expect(openTour).toHaveBeenCalledWith(TOUR);
    planner = plannerOf({ type: 'edit-saved', placeId: 81 });
    rerender();
    expect(planner.setSelectedWaypointId).toHaveBeenCalledWith('p3');
    expect(planner.setRouteProfileFocus).toHaveBeenCalledWith(null);
  });

  it('FE-TOUR-STAGE-RAIL-003: a stage of the tour already open shows at once, without opening it again', () => {
    const openTour = vi.fn();
    const planner = plannerOf({ type: 'edit-saved', placeId: 81 });
    const { result } = renderHook(() => useTourStageRail(planner, openTour));
    act(() => result.current.openStage(TOUR, 'stop-start'));
    expect(openTour).not.toHaveBeenCalled();
    expect(planner.setSelectedWaypointId).toHaveBeenCalledWith('p2');
  });

  it('FE-TOUR-STAGE-RAIL-004: waits while the open tour stays and lets the stage go once another opens', () => {
    let planner = plannerOf({ type: 'edit-saved', placeId: 5 }, false);
    const { result, rerender } = renderHook(() => useTourStageRail(planner, vi.fn()));
    act(() => result.current.openStage(TOUR, 'stop-hut'));
    rerender();
    planner = plannerOf({ type: 'edit-saved', placeId: 6 });
    rerender();
    planner = plannerOf({ type: 'edit-saved', placeId: 81 });
    rerender();
    expect(planner.setSelectedWaypointId).not.toHaveBeenCalled();
  });

  it('FE-TOUR-STAGE-RAIL-005: a folded row or a day tour reads no stages', () => {
    const folded = renderHook(() => useSavedTourStages(9, TOUR, false));
    expect(folded.result.current).toMatchObject({ status: 'idle', stages: [], totals: null });
    const dayTour = renderHook(() => useSavedTourStages(9, { ...TOUR, stage_count: null }, true));
    expect(dayTour.result.current.status).toBe('idle');
  });
});
