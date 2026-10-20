import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openedTourFields, tourPlannerFacts, type TourPlannerFactsInput } from './tourPlannerFacts';
import { usePlannerHistory } from './usePlannerHistory';
import { useTourDraftStorage } from './useTourDraftStorage';

const hike = (overrides: Partial<TourPlannerFactsInput> = {}): TourPlannerFactsInput => ({
  tourType: 'hike',
  maxHikingDifficulty: 3,
  hikingPreferences: null,
  bikeProfile: 'touring',
  winterActivity: null,
  runProfile: 'running',
  runPaceSecondsPerKm: null,
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
  it('times a bike tour by the router even with its heights in, and saves its profile and nothing of a hike', () => {
    const analysis = { distanceKm: 30, gain: 400, loss: 400 } as TourPlannerFactsInput['routeAnalysis'];
    const facts = tourPlannerFacts(
      hike({
        tourType: 'bike',
        bikeProfile: 'gravel',
        routeAnalysis: analysis,
        durationSeconds: 5_400,
        hikingPreferences: { avoid_steps: true },
      })
    );
    expect(facts.walkingDurationMinutes).toBe(90);
    expect(facts.typeFields).toMatchObject({
      tour_type: 'bike',
      bike_profile: 'gravel',
      max_hiking_difficulty: null,
      hiking_preferences: null,
      boat_type: null,
    });
    expect(tourPlannerFacts(hike()).typeFields).toMatchObject({ bike_profile: null, max_hiking_difficulty: 3 });
  });

  it('times a hike by the router until its heights are in, then by the signposts, breaks on top', () => {
    expect(tourPlannerFacts(hike({ durationSeconds: 3_570 })).walkingDurationMinutes).toBe(60);
    const analysis = { distanceKm: 8, gain: 600, loss: 600 } as TourPlannerFactsInput['routeAnalysis'];
    const facts = tourPlannerFacts(
      hike({ routeAnalysis: analysis, durationSeconds: 3_600, breakAdditionalMinutes: 30 })
    );
    const walking = facts.walkingDurationMinutes ?? 0;
    expect(walking).toBeGreaterThan(60);
    expect(facts.plannedTotalMinutes).toBe(walking + 30);
    expect(facts.savedDurationSeconds).toBe(walking * 60);
    expect(facts.typeFields).toMatchObject({ tour_type: 'hike', max_hiking_difficulty: 3, boat_type: null });
  });

  it('HIK-01: saves a hike with its winter label and the same times as without, and no other type with one', () => {
    const analysis = { distanceKm: 8, gain: 600, loss: 600 } as TourPlannerFactsInput['routeAnalysis'];
    const summer = tourPlannerFacts(hike({ routeAnalysis: analysis, breakAdditionalMinutes: 30 }));
    const winter = tourPlannerFacts(
      hike({ routeAnalysis: analysis, breakAdditionalMinutes: 30, winterActivity: 'snowshoe' })
    );
    expect(winter.typeFields).toMatchObject({
      tour_type: 'hike',
      winter_activity: 'snowshoe',
      max_hiking_difficulty: 3,
    });
    expect(summer.typeFields).toMatchObject({ winter_activity: null });
    // A label only: the time is the signposts' rule, as for any hike.
    expect(winter.walkingDurationMinutes).toBe(summer.walkingDurationMinutes);
    expect(winter.plannedTotalMinutes).toBe(summer.plannedTotalMinutes);
    for (const tourType of ['bike', 'walk', 'kayak'] as const) {
      expect(tourPlannerFacts(hike({ tourType, winterActivity: 'winter_hike' })).typeFields.winter_activity).toBeNull();
    }
  });

  it('RUN-01: times a run as its distance at the pace, nothing else, and saves its profile and pace', () => {
    // 8 km with 600 m up and down at 6:00 min/km: 48 minutes, the climb left out.
    const analysis = { distanceKm: 8, gain: 600, loss: 600 } as TourPlannerFactsInput['routeAnalysis'];
    const facts = tourPlannerFacts(
      hike({ tourType: 'run', runPaceSecondsPerKm: 360, routeAnalysis: analysis, durationSeconds: 7200 })
    );
    expect(facts.walkingDurationMinutes).toBe(48);
    expect(facts.plannedTotalMinutes).toBe(48);
    expect(facts.savedDurationSeconds).toBe(48 * 60);
    expect(facts.runPaceMissing).toBe(false);
    expect(facts.runPaceInvalid).toBe(false);
    expect(facts.typeFields).toMatchObject({
      tour_type: 'run',
      run_profile: 'running',
      run_pace_seconds_per_km: 360,
      max_hiking_difficulty: null,
      hiking_preferences: null,
      winter_activity: null,
      bike_profile: null,
    });
    const withBreak = hike({
      tourType: 'run',
      runPaceSecondsPerKm: 360,
      routeAnalysis: analysis,
      breakAdditionalMinutes: 12,
    });
    expect(tourPlannerFacts(withBreak).plannedTotalMinutes).toBe(60);
  });

  it('RUN-01: a run without a pace, or with one that is none, has no time and no save, never the router time', () => {
    const analysis = { distanceKm: 8, gain: 0, loss: 0 } as TourPlannerFactsInput['routeAnalysis'];
    const missing = tourPlannerFacts(hike({ tourType: 'run', routeAnalysis: analysis, durationSeconds: 7200 }));
    expect(missing.walkingDurationMinutes).toBeNull();
    expect(missing.savedDurationSeconds).toBeNull();
    expect(missing.runPaceMissing).toBe(true);
    for (const pace of [Number.NaN, 0, -360, 1201]) {
      const facts = tourPlannerFacts(hike({ tourType: 'run', runPaceSecondsPerKm: pace, routeAnalysis: analysis }));
      expect(facts.runPaceInvalid).toBe(true);
      expect(facts.walkingDurationMinutes).toBeNull();
    }
    // Before the route is in, the time waits for it.
    expect(tourPlannerFacts(hike({ tourType: 'run', runPaceSecondsPerKm: 360 })).walkingDurationMinutes).toBeNull();
    // Another type carries neither, and is never held back by a pace.
    const bike = tourPlannerFacts(hike({ tourType: 'bike', runPaceSecondsPerKm: 360 }));
    expect(bike.typeFields).toMatchObject({ run_profile: null, run_pace_seconds_per_km: null });
    expect([bike.runPaceMissing, bike.runPaceInvalid]).toEqual([false, false]);
    const paddle = tourPlannerFacts(hike({ tourType: 'kayak', runPaceSecondsPerKm: 360 }));
    expect(paddle.typeFields).toMatchObject({ run_profile: null, run_pace_seconds_per_km: null });
  });

  it('RUN-01: opens a saved run with its profile and pace, and any tour cached before them with none', () => {
    const run = { name: 'River loop', tour_type: 'run', run_profile: 'running', run_pace_seconds_per_km: 330 };
    expect(openedTourFields(run as Parameters<typeof openedTourFields>[0])).toMatchObject({
      tourType: 'run',
      runProfile: 'running',
      runPaceSecondsPerKm: 330,
    });
    const hikeOpened = openedTourFields({ name: 'Ridge', tour_type: 'hike' } as Parameters<typeof openedTourFields>[0]);
    expect(hikeOpened).toMatchObject({
      runProfile: 'running',
      runPaceSecondsPerKm: null,
      winterActivity: null,
      winterActivityChoice: 'winter_hike',
    });
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

  it('CW-02: times a city walk by the router on foot, its stays on top in place of breaks, and saves no hiking limit', () => {
    const analysis = { distanceKm: 4, gain: 300, loss: 300 } as TourPlannerFactsInput['routeAnalysis'];
    const walk = hike({
      tourType: 'walk',
      routeAnalysis: analysis,
      durationSeconds: 3_000,
      breakAdditionalMinutes: 40,
      stays: { stayMinutes: 75, unknownStays: 0, stations: 2 },
      hikingPreferences: { avoid_steps: true },
    });
    const facts = tourPlannerFacts(walk);
    expect(facts.walkingDurationMinutes).toBe(50);
    expect(facts.automaticPlannedTotalMinutes).toBe(125);
    expect(facts.plannedTotalMinutes).toBe(125);
    expect(facts.savedDurationSeconds).toBe(3_000);
    expect(facts.typeFields).toMatchObject({
      tour_type: 'walk',
      max_hiking_difficulty: null,
      hiking_preferences: null,
      bike_profile: null,
      boat_type: null,
    });
    expect(facts.stationStays).toMatchObject({
      walkingMinutes: 50,
      stayMinutes: 75,
      totalMinutes: 125,
      partial: false,
    });
    // Stays nobody entered count for nothing; a total typed by hand still wins.
    expect(tourPlannerFacts({ ...walk, stays: null }).automaticPlannedTotalMinutes).toBe(50);
    expect(tourPlannerFacts({ ...walk, plannedDurationMinutes: 180 }).plannedTotalMinutes).toBe(180);
    expect(tourPlannerFacts({ ...walk, stays: null, durationSeconds: null }).automaticPlannedTotalMinutes).toBeNull();
  });

  it('CW-02: a walk whose walking time is not known plans at least the stays entered, as its overview says', () => {
    const walk = hike({
      tourType: 'walk',
      durationSeconds: null,
      stays: { stayMinutes: 120, unknownStays: 1, stations: 3 },
    });
    const facts = tourPlannerFacts(walk);
    expect(facts.walkingDurationMinutes).toBeNull();
    expect(facts.plannedTotalMinutes).toBe(120);
    expect(facts.stationStays).toMatchObject({ walkingMinutes: null, totalMinutes: 120, partial: true });
    expect(facts.plannedTotalInvalid).toBe(false);
    // Stays past the longest plan a tour may have hold the save up as the walking time would.
    expect(
      tourPlannerFacts({ ...walk, stays: { stayMinutes: 1_500, unknownStays: 0, stations: 2 } }).plannedTotalInvalid
    ).toBe(true);
    expect(tourPlannerFacts(hike({ durationSeconds: 600 })).stationStays).toBeNull();
  });

  it('MDT-01: a multi-day tour may take a day a stage on the move, a day tour one day', () => {
    // 30 hours on the move: too long for a day, room enough for two stages.
    const long = hike({ tourType: 'bike', durationSeconds: 30 * 3600 });
    expect(tourPlannerFacts(long).plannedTotalInvalid).toBe(true);
    expect(tourPlannerFacts({ ...long, stageCount: 2 }).plannedTotalInvalid).toBe(false);
    const withBreaks = { ...long, stageCount: 2, breakAdditionalMinutes: 19 * 60 };
    expect(tourPlannerFacts(withBreaks).plannedTotalInvalid).toBe(true);
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

  it('HIK-01: gives back a draft with its winter label, and drops one whose label it does not know', () => {
    localStorage.clear();
    const draft = { version: 10, name: 'Snowy ridge', waypoints: [{ id: 'a', lat: 47, lng: 11, role: 'start' }] };
    localStorage.setItem('tour-draft-5', JSON.stringify({ ...draft, winterActivity: 'snowshoe' }));
    expect(renderHook(() => useTourDraftStorage(5)).result.current.restored).toMatchObject({
      winterActivity: 'snowshoe',
    });
    localStorage.setItem('tour-draft-6', JSON.stringify({ ...draft, winterActivity: 'ski_tour' }));
    expect(renderHook(() => useTourDraftStorage(6)).result.current.restored).toBeNull();
  });

  it('RUN-01: gives back a draft with its run profile and pace, and drops one it cannot read', () => {
    localStorage.clear();
    const draft = { version: 10, name: 'River loop', waypoints: [{ id: 'a', lat: 48, lng: 11, role: 'start' }] };
    const run = { ...draft, tourType: 'run', runProfile: 'running', runPaceSecondsPerKm: 345 };
    localStorage.setItem('tour-draft-7', JSON.stringify(run));
    expect(renderHook(() => useTourDraftStorage(7)).result.current.restored).toMatchObject({
      tourType: 'run',
      runProfile: 'running',
      runPaceSecondsPerKm: 345,
    });
    localStorage.setItem('tour-draft-8', JSON.stringify({ ...draft, runPaceSecondsPerKm: null }));
    const unpaced = renderHook(() => useTourDraftStorage(8)).result.current.restored;
    expect(unpaced).toMatchObject({ runPaceSecondsPerKm: null });
    localStorage.setItem('tour-draft-9', JSON.stringify({ ...draft, runProfile: 'sprint' }));
    expect(renderHook(() => useTourDraftStorage(9)).result.current.restored).toBeNull();
    localStorage.setItem('tour-draft-10', JSON.stringify({ ...draft, runPaceSecondsPerKm: -5 }));
    expect(renderHook(() => useTourDraftStorage(10)).result.current.restored).toBeNull();
  });
});
