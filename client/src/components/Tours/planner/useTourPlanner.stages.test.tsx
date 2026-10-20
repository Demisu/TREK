import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routeWalkingTour, enrichTourElevations, createTour, detailTour, updateTour } = vi.hoisted(() => ({
  routeWalkingTour: vi.fn(),
  enrichTourElevations: vi.fn(),
  createTour: vi.fn(),
  detailTour: vi.fn(),
  updateTour: vi.fn(),
}));

vi.mock('./tourRouting', () => ({ routeWalkingTour, enrichTourElevations }));
vi.mock('../../../repo/tourRepo', () => ({ tourRepo: { create: createTour, detail: detailTour, update: updateTour } }));
vi.mock('../useTourPermissions', () => ({
  useTourPermissions: ({ canEdit = true, canAssign = true }: { canEdit?: boolean; canAssign?: boolean }) => ({
    canEdit,
    canAssign,
  }),
}));

import { validDraft } from './tourPlannerDraft';
import { useTourPlanner } from './useTourPlanner';

// FE-TOUR-STAGES-001 to FE-TOUR-STAGES-008 (MDT-01)

const POINTS: Array<[number, number]> = [
  [48, 11],
  [48.01, 11.02],
  [48.02, 11.04],
  [48.03, 11.06],
];
const routed = {
  coordinates: POINTS,
  parts: [{ coordinates: POINTS, free: false }],
  distanceMeters: 6000,
  durationSeconds: 5400,
};
const enriched = POINTS.map(([lat, lng], index): [number, number, number] => [lat, lng, [500, 560, 520, 600][index]]);
const savedHike = {
  place_id: 81,
  name: 'Hut to hut',
  tour_type: 'hike' as const,
  distance: 6,
  elevation_gain: 140,
  elevation_loss: 40,
  duration: 90,
  difficulty: null,
  wanderer_ref: null,
  match_confidence: 1,
  max_hiking_difficulty: 2,
  planned: false,
  caution: false,
  revision: 2,
  stage_count: 2,
};

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
}

/** A planner with the four points set and their route planned. */
async function plannedHike(tripId: number) {
  const hook = renderHook(() => useTourPlanner({ tripId }));
  act(() => {
    for (const [lat, lng] of POINTS) hook.result.current.addWaypoint(lat, lng);
  });
  await settle();
  return hook;
}

describe('useTourPlanner, multi-day tours (MDT-01)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    routeWalkingTour.mockReset().mockResolvedValue(routed);
    enrichTourElevations.mockReset().mockResolvedValue(enriched);
    createTour.mockReset();
    detailTour.mockReset();
    updateTour.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('FE-TOUR-STAGES-001: a stage end splits the one route into stages, measured from its line, without planning it again', async () => {
    const { result } = await plannedHike(61);
    expect(result.current.stages.multiDay).toBe(false);
    expect(result.current.stages.stages).toEqual([]);
    const stop = result.current.waypoints[1].id;
    routeWalkingTour.mockClear();

    act(() => result.current.stages.toggleStageEnd(stop));
    await settle();
    expect(routeWalkingTour).not.toHaveBeenCalled();
    expect(result.current.waypoints[1].stageEnd).toBe(true);
    expect(result.current.stages.multiDay).toBe(true);
    expect(result.current.stages.stages.map((stage) => [stage.number, stage.gain, stage.loss])).toEqual([
      [1, 60, 0],
      [2, 80, 40],
    ]);
    expect(result.current.stages.stages[0].toId).toBe(stop);
    expect(result.current.stages.stages[1].fromId).toBe(stop);
    expect(result.current.hasUnsavedChanges).toBe(true);
    // One step of the history: undo takes the stage end back.
    act(() => result.current.undo());
    expect(result.current.waypoints[1].stageEnd).toBeUndefined();
    expect(result.current.stages.multiDay).toBe(false);
  });

  it('FE-TOUR-STAGES-002: a stage end whose stop is removed is said to be lost, and undo brings it back', async () => {
    const { result } = await plannedHike(62);
    const stop = result.current.waypoints[2].id;
    act(() => result.current.stages.toggleStageEnd(stop));
    act(() => result.current.removeWaypoint(stop));
    expect(result.current.stages.lost).toBe(1);
    expect(result.current.stages.endCount).toBe(0);
    act(() => result.current.undo());
    expect(result.current.stages.lost).toBe(0);
    expect(result.current.waypoints[2].stageEnd).toBe(true);
  });

  it('FE-TOUR-STAGES-003: a stop made a shaping point or moved to the end cannot end a stage, and says so', async () => {
    const { result } = await plannedHike(63);
    const stop = result.current.waypoints[1].id;
    act(() => result.current.stages.toggleStageEnd(stop));
    act(() => result.current.setWaypointShaping(stop, true));
    expect(result.current.waypoints[1].stageEnd).toBeUndefined();
    expect(result.current.stages.lost).toBe(1);
    act(() => result.current.undo());
    act(() => result.current.reorderWaypoint(stop, result.current.waypoints[3].id, 'after'));
    expect(result.current.waypoints[3].id).toBe(stop);
    expect(result.current.waypoints[3].stageEnd).toBeUndefined();
    expect(result.current.stages.lost).toBe(1);
    // A later change that loses nothing clears the notice.
    act(() => result.current.setWaypointPosition(result.current.waypoints[1].id, 48.011, 11.021));
    expect(result.current.stages.lost).toBe(0);
  });

  it('FE-TOUR-STAGES-004: a stage end taken away on purpose is no loss, and the order of the stages follows the route', async () => {
    const { result } = await plannedHike(64);
    const [, first, second] = result.current.waypoints.map((point) => point.id);
    act(() => result.current.stages.toggleStageEnd(second));
    act(() => result.current.stages.toggleStageEnd(first));
    expect(result.current.stages.stages.map((stage) => stage.toId)).toEqual([
      first,
      second,
      result.current.waypoints[3].id,
    ]);
    act(() => result.current.stages.toggleStageEnd(first));
    expect(result.current.stages.lost).toBe(0);
    expect(result.current.stages.endCount).toBe(1);
    // Reversed, the stages run the other way and keep their stops.
    act(() => result.current.reverse());
    expect(result.current.waypoints[1].id).toBe(second);
    expect(result.current.waypoints[1].stageEnd).toBe(true);
    // The tour keeps its one type for all its stages; another type keeps the stages.
    act(() => result.current.setTourType('kayak'));
    expect(result.current.tourType).toBe('kayak');
    expect(result.current.stages.endCount).toBe(1);
  });

  it('FE-TOUR-STAGES-005: choosing a multi-day tour changes nothing yet; back to a day tour removes every stage end as one step', async () => {
    const { result } = await plannedHike(65);
    act(() => result.current.stages.setMultiDay(true));
    expect(result.current.stages.multiDay).toBe(true);
    expect(result.current.stages.stages).toHaveLength(1);
    expect(result.current.waypoints.some((point) => point.stageEnd)).toBe(false);
    act(() => {
      result.current.stages.toggleStageEnd(result.current.waypoints[1].id);
      result.current.stages.toggleStageEnd(result.current.waypoints[2].id);
    });
    expect(result.current.stages.stages).toHaveLength(3);
    act(() => result.current.stages.setMultiDay(false));
    expect(result.current.stages.multiDay).toBe(false);
    expect(result.current.waypoints.some((point) => point.stageEnd)).toBe(false);
    expect(result.current.stages.lost).toBe(0);
    act(() => result.current.undo());
    expect(result.current.stages.endCount).toBe(2);
    // A fresh draft forgets the choice of a multi-day tour.
    act(() => result.current.startNewTour(true));
    act(() => result.current.stages.setMultiDay(true));
    expect(result.current.stages.multiDay).toBe(true);
    act(() => result.current.startNewTour(true));
    expect(result.current.stages.multiDay).toBe(false);
  });

  it('FE-TOUR-STAGES-006: saves the stage ends with their stops and opens a saved tour with its stages', async () => {
    detailTour.mockResolvedValue({
      tour: savedHike,
      waypoints: [
        { lat: 48, lng: 11, role: 'start', sequence: 0 },
        { lat: 48.01, lng: 11.02, role: 'via', sequence: 1, stage_end: true },
        { lat: 48.02, lng: 11.04, role: 'via', sequence: 2 },
        { lat: 48.03, lng: 11.06, role: 'end', sequence: 3 },
      ],
    });
    updateTour.mockResolvedValue({ tour: { ...savedHike, revision: 3 }, waypoints: [] });
    const { result } = renderHook(() => useTourPlanner({ tripId: 66 }));
    await act(async () => {
      await result.current.openTour({ place_id: 81 });
    });
    expect(result.current.stages.multiDay).toBe(true);
    expect(result.current.waypoints[1].stageEnd).toBe(true);
    act(() => result.current.setName('Hut to hut, three days'));
    act(() => result.current.stages.toggleStageEnd(result.current.waypoints[2].id));
    await settle();
    await act(async () => {
      await result.current.save();
    });
    const payload = updateTour.mock.calls[0]?.[2] as { waypoints: Array<{ stage_end?: boolean }> };
    expect(payload.waypoints.map((point) => point.stage_end ?? false)).toEqual([false, true, true, false]);
  });

  it('FE-TOUR-STAGES-007: a viewer who may not edit sets no stage end', () => {
    const { result } = renderHook(() => useTourPlanner({ tripId: 68, canEdit: false, canAssign: false }));
    act(() => result.current.stages.setMultiDay(true));
    expect(result.current.stages.multiDay).toBe(false);
    act(() => result.current.stages.toggleStageEnd('anything'));
    expect(result.current.stages.endCount).toBe(0);
  });

  it('FE-TOUR-STAGES-008: the draft kept between visits holds the stage ends, and one with a broken mark is dropped', async () => {
    const { result } = await plannedHike(69);
    act(() => result.current.stages.toggleStageEnd(result.current.waypoints[1].id));
    const draft = JSON.parse(localStorage.getItem('tour-draft-69') || 'null');
    expect(draft.waypoints[1].stageEnd).toBe(true);
    expect(validDraft(draft)).toBe(true);
    draft.waypoints[1].stageEnd = 'yes';
    expect(validDraft(draft)).toBe(false);
  });
});
