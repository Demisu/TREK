// FE-WALK-TIMES-001 to FE-WALK-TIMES-002: a city walk's walking time and stays kept apart (CW-02).
import { describe, expect, it } from 'vitest';
import { walkTimes } from './stationModel';
import type { TourPlannerWaypoint } from './tourPlannerWaypoints';

const cathedral: TourPlannerWaypoint = { id: 'a', lat: 48.1, lng: 11.5, role: 'start', stayMinutes: 30 };
const steer: TourPlannerWaypoint = { id: 's', lat: 48.105, lng: 11.505, role: 'via', shaping: true, stayMinutes: 99 };
const market: TourPlannerWaypoint = { id: 'b', lat: 48.11, lng: 11.51, role: 'via', stayMinutes: 0 };
const park: TourPlannerWaypoint = { id: 'c', lat: 48.13, lng: 11.53, role: 'end' };

describe('walkTimes', () => {
  it('FE-WALK-TIMES-001: adds the stays entered to the walking time and says what is not known', () => {
    expect(walkTimes([cathedral, steer, market, park], 45)).toEqual({
      walkingMinutes: 45,
      stayMinutes: 30,
      unknownStays: 1,
      totalMinutes: 75,
      partial: true,
    });
    expect(walkTimes([cathedral, market], null)).toMatchObject({ totalMinutes: null, partial: false });
  });

  it("FE-WALK-TIMES-002: the way back of a loop is its start again, so the start's stay counts once", () => {
    const back: TourPlannerWaypoint = { ...cathedral, id: 'back', role: 'end' };
    expect(walkTimes([cathedral, market, { ...park, role: 'via' }, back], 45)).toEqual({
      walkingMinutes: 45,
      stayMinutes: 30,
      unknownStays: 1,
      totalMinutes: 75,
      partial: true,
    });
  });
});
