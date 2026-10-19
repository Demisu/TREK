import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tourPlannerFacts, type TourPlannerFactsInput } from './tourPlannerFacts';
import { usePlannerHistory } from './usePlannerHistory';
import { useTourDraftStorage } from './useTourDraftStorage';

const hike = (overrides: Partial<TourPlannerFactsInput> = {}): TourPlannerFactsInput => ({
  tourType: 'hike',
  maxHikingDifficulty: 3,
  hikingPreferences: null,
  website: '',
  plannedDurationMinutes: null,
  breakAdditionalMinutes: null,
  paddle: { boatType: null, waterContext: null, speedKmh: null, portageSpeedKmh: null, lakeStyle: null },
  paddleSpeedInvalid: false,
  paddleEstimate: null,
  routeAnalysis: null,
  durationSeconds: null,
  ...overrides,
});

describe('tourPlannerFacts', () => {
  it('times a hike by the router until its heights are in, then by the signposts, breaks on top', () => {
    expect(tourPlannerFacts(hike({ durationSeconds: 3_570 })).walkingDurationMinutes).toBe(60);
    const analysis = { distanceKm: 8, gain: 600, loss: 600 } as TourPlannerFactsInput['routeAnalysis'];
    const facts = tourPlannerFacts(
      hike({ routeAnalysis: analysis, durationSeconds: 3_600, breakAdditionalMinutes: 30 })
    );
    expect(facts.walkingDurationMinutes).toBeGreaterThan(60);
    expect(facts.plannedTotalMinutes).toBe(facts.walkingDurationMinutes! + 30);
    expect(facts.savedDurationSeconds).toBe(facts.walkingDurationMinutes! * 60);
    expect(facts.typeFields).toMatchObject({ tour_type: 'hike', max_hiking_difficulty: 3, boat_type: null });
  });

  it('holds the fields to their bounds, and a total that runs past a day without an override', () => {
    const facts = tourPlannerFacts(
      hike({ website: 'http://plain.example', plannedDurationMinutes: 1.5, breakAdditionalMinutes: -1 })
    );
    expect(facts).toMatchObject({ websiteInvalid: true, plannedDurationInvalid: true, breakAdditionalInvalid: true });
    expect(tourPlannerFacts(hike({ durationSeconds: 1_500 * 60 })).plannedTotalInvalid).toBe(true);
    expect(
      tourPlannerFacts(hike({ durationSeconds: 1_500 * 60, plannedDurationMinutes: 600 })).plannedTotalInvalid
    ).toBe(false);
    expect(tourPlannerFacts(hike({ website: 'https://ok.example' })).websiteInvalid).toBe(false);
  });

  it('times a paddle tour on the water and asks for its boat and water', () => {
    const paddle = hike({
      tourType: 'kayak',
      paddle: { boatType: 'canoe', waterContext: null, speedKmh: 5, portageSpeedKmh: 3, lakeStyle: 'shore' },
      paddleEstimate: { waterMinutes: 80, estimateMinutes: 95 },
      durationSeconds: 999,
    });
    const facts = tourPlannerFacts(paddle);
    expect(facts.walkingDurationMinutes).toBe(95);
    expect(facts.paddleIncomplete).toBe(true);
    expect(facts.typeFields).toMatchObject({
      tour_type: 'kayak',
      max_hiking_difficulty: null,
      boat_type: 'canoe',
      paddle_lake_style: 'shore',
    });
    const unknown = tourPlannerFacts({ ...paddle, paddleEstimate: { waterMinutes: null, estimateMinutes: null } });
    expect(unknown.walkingDurationMinutes).toBeNull();
    expect(unknown.savedDurationSeconds).toBeNull();
  });
});

describe('usePlannerHistory', () => {
  it('goes back and forth, forgets the undone on a new step, and keeps at most thirty', () => {
    const { result } = renderHook(() => usePlannerHistory<number>());
    act(() => result.current.record(1));
    act(() => result.current.record(2));
    let step: number | null = null;
    act(() => {
      step = result.current.undo(3);
    });
    expect(step).toBe(2);
    expect(result.current.canRedo).toBe(true);
    act(() => {
      step = result.current.redo(2);
    });
    expect(step).toBe(3);
    act(() => {
      result.current.undo(3);
    });
    act(() => result.current.record(9));
    expect(result.current.canRedo).toBe(false);
    act(() => {
      step = result.current.redo(9);
    });
    expect(step).toBeNull();
    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    act(() => {
      step = result.current.undo(0);
    });
    expect(step).toBeNull();
    for (let i = 0; i < 40; i++) act(() => result.current.record(i));
    let undone = 0;
    for (let i = 0; i < 40; i++)
      act(() => {
        if (result.current.undo(-1) !== null) undone++;
      });
    expect(undone).toBe(30);
  });
});

describe('useTourDraftStorage', () => {
  it('keeps a draft per trip, gives back only one that passes the check, and forgets it', () => {
    localStorage.clear();
    const draft = {
      version: 9 as const,
      name: 'Ridge',
      waypoints: [{ id: 'a', lat: 47, lng: 11, role: 'start' as const }],
      baseRevision: 4,
    };
    const first = renderHook(() => useTourDraftStorage(1));
    act(() => first.result.current.keep(draft));
    expect(renderHook(() => useTourDraftStorage(1)).result.current.restored).toMatchObject({
      name: 'Ridge',
      baseRevision: 4,
    });
    expect(renderHook(() => useTourDraftStorage(2)).result.current.restored).toBeNull();
    localStorage.setItem('tour-draft-3', JSON.stringify({ ...draft, baseRevision: 0 }));
    expect(renderHook(() => useTourDraftStorage(3)).result.current.restored).toBeNull();
    localStorage.setItem('tour-draft-4', '{not json');
    expect(renderHook(() => useTourDraftStorage(4)).result.current.restored).toBeNull();
    act(() => first.result.current.forget());
    expect(localStorage.getItem('tour-draft-1')).toBeNull();
  });
});
