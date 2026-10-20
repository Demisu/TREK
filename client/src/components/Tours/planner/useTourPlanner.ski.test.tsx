import { act, renderHook } from '@testing-library/react';
import { DEFAULT_SKI_ROUTE_OPTIONS } from '@trek/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routeWalkingTour, enrichTourElevations, createTour, detailTour, updateTour, planSki } = vi.hoisted(() => ({
  planSki: vi.fn(),
  routeWalkingTour: vi.fn(),
  enrichTourElevations: vi.fn(),
  createTour: vi.fn(),
  detailTour: vi.fn(),
  updateTour: vi.fn(),
}));

// The ski legs are laid by the planner; only the routers, the piste router and the heights are stood in for.
vi.mock('./tourRouting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tourRouting')>()),
  routeWalkingTour,
  enrichTourElevations,
}));
vi.mock('../../../repo/tourRepo', () => ({ tourRepo: { create: createTour, detail: detailTour, update: updateTour } }));
vi.mock('../../../repo/skiRouteRepo', () => ({ skiRouteRepo: { plan: planSki } }));
vi.mock('../useTourPermissions', () => ({ useTourPermissions: () => ({ canEdit: true, canAssign: true }) }));

import { useTourPlanner } from './useTourPlanner';

// FE-TOUR-SKI-PLAN-001 to FE-TOUR-SKI-PLAN-007

const savedSki = {
  place_id: 95,
  name: 'Over the col',
  tour_type: 'ski' as const,
  ski_discipline: 'cross_country' as const,
  ski_technique: 'skating' as const,
  distance: 1.9,
  elevation_gain: 0,
  elevation_loss: 80,
  duration: null,
  difficulty: null,
  wanderer_ref: null,
  match_confidence: 1,
  max_hiking_difficulty: null,
  planned: false,
  caution: false,
  revision: 2,
};
const savedPoints = [
  { lat: 47, lng: 11, role: 'start' as const, sequence: 0 },
  { lat: 47.01, lng: 11.02, role: 'end' as const, sequence: 1 },
];

/** The heights the elevation source answers: one for every point of the line, falling gently. */
async function heightsAlong(line: [number, number][]): Promise<[number, number, number][]> {
  return line.map(([lat, lng], index): [number, number, number] => [lat, lng, 1600 - index]);
}

type Point = { lat: number; lng: number };

/** The piste router's answer for every leg asked: a lift up and a run down, with the graph's heights. */
async function pisteLegs(_tripId: number, legs: Array<{ from: Point; to: Point }>) {
  return {
    legs: legs.map(({ from, to }) => ({
      status: 'ok' as const,
      geometry: [
        [from.lat, from.lng, 1500],
        [to.lat, to.lng, 1400],
      ],
      segments: [
        {
          kind: 'run' as const,
          from: 0,
          to: 1,
          name: 'Talabfahrt',
          ref: null,
          difficulty: 'easy' as const,
          lift_type: null,
          grooming: [],
          seconds: 600,
          wait_seconds: 0,
          length_m: 1900,
          flags: [],
          osm_way: null,
        },
      ],
      distance_m: 1900,
      climb_m: 0,
      descent_m: 100,
      seconds: { ski: 600, lift: 0, wait: 0, walk: 0 },
      snapped_m: { from: 0, to: 0 },
      area_ids: ['w:1'],
      why: [],
      alternatives: [],
    })),
    build: '2026-11-02',
    stale: false,
    areaNames: ['Gletscherwelt'],
    colourScheme: 'europe' as const,
  };
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450);
  });
}

async function plannedSki(tripId: number) {
  const hook = renderHook(() => useTourPlanner({ tripId }));
  act(() => {
    hook.result.current.setName('Over the col');
    hook.result.current.setTourType('ski');
    hook.result.current.addWaypoint(47, 11);
    hook.result.current.addWaypoint(47.01, 11.02);
  });
  await settle();
  return hook;
}

describe('useTourPlanner, a ski and winter tour (SKI-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    routeWalkingTour.mockReset();
    planSki.mockReset().mockImplementation(pisteLegs);
    enrichTourElevations.mockReset().mockImplementation(heightsAlong);
    createTour.mockReset();
    detailTour.mockReset();
    updateTour.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('FE-TOUR-SKI-PLAN-001: before a discipline every leg is drawn straight, nothing asked and no time', async () => {
    const { result } = await plannedSki(81);
    expect(result.current.isSki).toBe(true);
    expect(routeWalkingTour).not.toHaveBeenCalled();
    expect(planSki).not.toHaveBeenCalled();
    expect(enrichTourElevations).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
    expect(result.current.routeParts?.every((part) => part.free)).toBe(true);
    // Sampled along its length, so the heights follow the ground between the two points.
    expect(result.current.route?.length ?? 0).toBeGreaterThan(2);
    expect(result.current.routeAnalysis?.distanceKm ?? 0).toBeGreaterThan(1.5);
    expect(result.current.durationSeconds).toBeNull();
    expect(result.current.walkingDurationMinutes).toBeNull();
  });

  it('FE-TOUR-SKI-PLAN-002: nothing is chosen at first, and Save waits for a discipline and a cross-country technique', async () => {
    const { result } = await plannedSki(82);
    expect(result.current.ski.choice).toEqual({ discipline: null, technique: null });
    expect(result.current.skiMissing).toBe('discipline');
    expect(result.current.canSave).toBe(false);
    act(() => result.current.ski.change({ discipline: 'cross_country', technique: null }));
    expect(result.current.skiMissing).toBe('technique');
    expect(result.current.canSave).toBe(false);
    act(() => result.current.ski.change({ discipline: 'cross_country', technique: 'skating' }));
    expect(result.current.skiMissing).toBeNull();
    expect(result.current.canSave).toBe(true);
  });

  it('FE-TOUR-SKI-PLAN-003: a discipline asks the piste router, whose legs, heights and time the tour takes', async () => {
    const { result } = await plannedSki(83);
    act(() => result.current.ski.change({ discipline: 'alpine', technique: null }));
    await settle();
    expect(planSki).toHaveBeenCalledWith(
      83,
      [{ from: { lat: 47, lng: 11 }, to: { lat: 47.01, lng: 11.02 } }],
      { discipline: 'alpine', technique: null, options: {} },
      expect.anything()
    );
    // The piste data has a height for every point: none is read from the terrain again.
    expect(enrichTourElevations).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
    expect(result.current.durationSeconds).toBe(600);
    expect(result.current.walkingDurationMinutes).toBe(10);
    expect(result.current.skiRoute?.areaNames).toEqual(['Gletscherwelt']);
    expect(result.current.routeParts?.[0]?.ski).toEqual({ kind: 'run', difficulty: 'easy', scheme: 'europe' });

    act(() => result.current.ski.change({ discipline: 'snowshoe', technique: null }));
    await settle();
    expect(planSki).toHaveBeenCalledTimes(2);
    expect(result.current.routeCurrent).toBe(true);
  });

  it('FE-TOUR-SKI-PLAN-007: an option changed plans the legs again, and a switch to snowboard leaves out surface lifts', async () => {
    const { result } = await plannedSki(87);
    act(() => result.current.ski.change({ discipline: 'snowboard', technique: null }));
    await settle();
    expect(result.current.ski.choice.options).toEqual({ avoid_lifts: ['drag'] });
    act(() => result.current.ski.setOption({ pace: 'sporty' }));
    await settle();
    expect(planSki).toHaveBeenLastCalledWith(
      87,
      expect.anything(),
      { discipline: 'snowboard', technique: null, options: { avoid_lifts: ['drag'], pace: 'sporty' } },
      expect.anything()
    );
    expect(planSki).toHaveBeenCalledTimes(2);
  });

  it('FE-TOUR-SKI-PLAN-004: saves the type, the discipline, the router time, options and build, nothing of a hike', async () => {
    const saved = { ...savedSki, ski_discipline: 'winter_hike', ski_technique: null };
    createTour.mockResolvedValue({ tour: saved, waypoints: savedPoints });
    const { result } = await plannedSki(84);
    act(() => result.current.ski.change({ discipline: 'winter_hike', technique: 'classic' }));
    await act(async () => {
      await result.current.save();
    });
    expect(createTour).toHaveBeenCalledWith(
      84,
      expect.objectContaining({
        tour_type: 'ski',
        ski_discipline: 'winter_hike',
        ski_technique: null,
        max_hiking_difficulty: null,
        hiking_preferences: null,
        duration_seconds: 600,
        ski_options: DEFAULT_SKI_ROUTE_OPTIONS,
        ski_route_build: '2026-11-02',
      })
    );
    expect(result.current.status).toBe('saved');
  });

  it('FE-TOUR-SKI-PLAN-005: opens a saved ski tour with its discipline and technique, and a hike from it saves neither', async () => {
    detailTour.mockResolvedValue({ tour: savedSki, waypoints: savedPoints });
    updateTour.mockResolvedValue({ tour: { ...savedSki, tour_type: 'hike', revision: 3 }, waypoints: savedPoints });
    const { result } = renderHook(() => useTourPlanner({ tripId: 85 }));
    await act(async () => {
      await result.current.openTour({ place_id: 95 });
    });
    await settle();
    expect(result.current.tourType).toBe('ski');
    expect(result.current.ski.choice).toEqual({ discipline: 'cross_country', technique: 'skating' });
    expect(routeWalkingTour).not.toHaveBeenCalled();

    routeWalkingTour.mockResolvedValue({
      coordinates: [
        [47, 11],
        [47.01, 11.02],
      ],
      distanceMeters: 1900,
      durationSeconds: 1800,
    });
    act(() => result.current.setTourType('hike'));
    await settle();
    await act(async () => {
      await result.current.save();
    });
    expect(updateTour).toHaveBeenCalledWith(
      85,
      95,
      expect.objectContaining({ tour_type: 'hike', ski_discipline: null, ski_technique: null })
    );
  });

  it('FE-TOUR-SKI-PLAN-006: a draft keeps its ski choice across a reload, and a new tour starts with none', async () => {
    const first = await plannedSki(86);
    act(() => first.result.current.ski.change({ discipline: 'touring', technique: null }));
    first.unmount();

    const again = renderHook(() => useTourPlanner({ tripId: 86 }));
    expect(again.result.current.tourType).toBe('ski');
    expect(again.result.current.ski.choice).toEqual({ discipline: 'touring', technique: null });
    act(() => again.result.current.returnToNeutral());
    expect(again.result.current.ski.choice).toEqual({ discipline: null, technique: null });
  });
});
