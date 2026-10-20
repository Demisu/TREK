import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routeWalkingTour, routeCityWalk, enrichTourElevations, createTour, detailTour, updateTour } = vi.hoisted(
  () => ({
    routeWalkingTour: vi.fn(),
    routeCityWalk: vi.fn(),
    enrichTourElevations: vi.fn(),
    createTour: vi.fn(),
    detailTour: vi.fn(),
    updateTour: vi.fn(),
  })
);

vi.mock('./tourRouting', () => ({ routeWalkingTour, routeCityWalk, enrichTourElevations }));
vi.mock('../../../repo/tourRepo', () => ({ tourRepo: { create: createTour, detail: detailTour, update: updateTour } }));
vi.mock('../useTourPermissions', () => ({ useTourPermissions: () => ({ canEdit: true, canAssign: true }) }));

import { useTourPlanner } from './useTourPlanner';

// FE-TOUR-WINTER-001 to FE-TOUR-WINTER-006

const routed = {
  coordinates: [
    [48, 11],
    [48.01, 11.02],
  ] as [number, number][],
  distanceMeters: 2200,
  durationSeconds: 1800,
};
const enriched = [
  [48, 11, 1200],
  [48.01, 11.02, 1350],
] as [number, number, number][];
const savedHike = {
  place_id: 88,
  name: 'Snowy ridge',
  tour_type: 'hike' as const,
  winter_activity: 'snowshoe' as const,
  distance: 2.2,
  elevation_gain: 150,
  elevation_loss: 0,
  duration: 60,
  difficulty: null,
  wanderer_ref: null,
  match_confidence: 1,
  max_hiking_difficulty: 2,
  planned: true,
  caution: false,
  revision: 5,
};
const savedPoints = [
  { lat: 48, lng: 11, role: 'start' as const, sequence: 0 },
  { lat: 48.01, lng: 11.02, role: 'end' as const, sequence: 1 },
];

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
}

describe('useTourPlanner, the winter label of a hike (HIK-01)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    routeWalkingTour.mockReset().mockResolvedValue(routed);
    routeCityWalk.mockReset().mockResolvedValue(routed);
    enrichTourElevations.mockReset().mockResolvedValue(enriched);
    createTour.mockReset();
    detailTour.mockReset();
    updateTour.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('FE-TOUR-WINTER-001: a hike starts without one, and saves without one as before', async () => {
    createTour.mockResolvedValue({ tour: { ...savedHike, winter_activity: null }, waypoints: [] });
    const { result } = renderHook(() => useTourPlanner({ tripId: 61 }));
    expect(result.current.winterActivity).toBeNull();
    act(() => {
      result.current.setName('Ridge');
      result.current.addWaypoint(48, 11);
      result.current.addWaypoint(48.01, 11.02);
    });
    await settle();
    await act(async () => {
      await result.current.save();
    });
    expect(createTour).toHaveBeenCalledWith(
      61,
      expect.objectContaining({ tour_type: 'hike', winter_activity: null })
    );
  });

  it('FE-TOUR-WINTER-002: the label plans nothing again, is no step of the history and is kept in the draft', async () => {
    const { result } = renderHook(() => useTourPlanner({ tripId: 62 }));
    act(() => {
      result.current.setName('Ridge');
      result.current.addWaypoint(48, 11);
      result.current.addWaypoint(48.01, 11.02);
    });
    await settle();
    const { route, walkingDurationMinutes } = result.current;
    routeWalkingTour.mockClear();
    act(() => result.current.setWinterActivity('winter_hike'));
    await settle();
    expect(result.current.winterActivity).toBe('winter_hike');
    expect(routeWalkingTour).not.toHaveBeenCalled();
    expect(result.current.route).toEqual(route);
    expect(result.current.walkingDurationMinutes).toBe(walkingDurationMinutes);
    expect(result.current.status).toBe('ready');
    expect(result.current.canSave).toBe(true);
    expect(JSON.parse(localStorage.getItem('tour-draft-62') || 'null')).toMatchObject({
      winterActivity: 'winter_hike',
    });
    // An undo takes back the last point, not the label.
    act(() => result.current.undo());
    expect(result.current.winterActivity).toBe('winter_hike');
  });

  it('FE-TOUR-WINTER-003: a draft comes back with its label, and a new tour starts without one', () => {
    const first = renderHook(() => useTourPlanner({ tripId: 63 }));
    act(() => first.result.current.setWinterActivity('snowshoe'));
    first.unmount();
    const again = renderHook(() => useTourPlanner({ tripId: 63 }));
    expect(again.result.current.winterActivity).toBe('snowshoe');
    act(() => again.result.current.startNewTour(true));
    expect(again.result.current.winterActivity).toBeNull();
  });

  it('FE-TOUR-WINTER-004: opens a saved hike with its label, and taking it off saves the same route', async () => {
    detailTour.mockResolvedValue({ tour: savedHike, waypoints: savedPoints });
    updateTour.mockResolvedValue({
      tour: { ...savedHike, winter_activity: null, revision: 6 },
      waypoints: savedPoints,
    });
    const { result } = renderHook(() => useTourPlanner({ tripId: 64 }));
    await act(async () => {
      await result.current.openTour({ place_id: 88 });
    });
    expect(result.current.winterActivity).toBe('snowshoe');
    expect(result.current.hasUnsavedChanges).toBe(false);
    act(() => result.current.setWinterActivity(null));
    expect(result.current.hasUnsavedChanges).toBe(true);
    await settle();
    await act(async () => {
      await result.current.save();
    });
    expect(updateTour).toHaveBeenCalledWith(
      64,
      88,
      expect.objectContaining({
        tour_type: 'hike',
        winter_activity: null,
        max_hiking_difficulty: 2,
        waypoints: [
          expect.objectContaining({ lat: 48, lng: 11, role: 'start' }),
          expect.objectContaining({ lat: 48.01, lng: 11.02, role: 'end' }),
        ],
        expected_revision: 5,
      })
    );
  });

  it('FE-TOUR-WINTER-005: the same label again is no edit, and another type saves none', async () => {
    createTour.mockResolvedValue({ tour: { ...savedHike, tour_type: 'walk', winter_activity: null }, waypoints: [] });
    const { result } = renderHook(() => useTourPlanner({ tripId: 65 }));
    act(() => result.current.setWinterActivity(null));
    expect(result.current.hasUnsavedChanges).toBe(false);
    act(() => {
      result.current.setName('Old town');
      result.current.setWinterActivity('snowshoe');
      result.current.addWaypoint(48, 11);
      result.current.addWaypoint(48.01, 11.02);
      result.current.setTourType('walk');
    });
    await settle();
    await act(async () => {
      await result.current.save();
    });
    expect(createTour).toHaveBeenCalledWith(
      65,
      expect.objectContaining({ tour_type: 'walk', winter_activity: null })
    );
  });

  it('FE-TOUR-WINTER-006: keeps the label the switch brings back with the tour, winter hiking for the next one', async () => {
    detailTour.mockResolvedValue({ tour: savedHike, waypoints: savedPoints });
    const { result } = renderHook(() => useTourPlanner({ tripId: 66 }));
    expect(result.current.winterActivityChoice).toBe('winter_hike');
    act(() => result.current.setWinterActivity('snowshoe'));
    act(() => result.current.setWinterActivity(null));
    expect(result.current.winterActivityChoice).toBe('snowshoe');
    act(() => result.current.startNewTour(true));
    expect(result.current.winterActivity).toBeNull();
    expect(result.current.winterActivityChoice).toBe('winter_hike');
    await act(async () => {
      await result.current.openTour({ place_id: 88 });
    });
    expect(result.current.winterActivityChoice).toBe('snowshoe');
    act(() => result.current.discard());
    expect(result.current.winterActivityChoice).toBe('winter_hike');
  });
});
