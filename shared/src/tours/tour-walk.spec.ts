import { isClosedLoop, walkStationsOf } from './tour-walk';

import { describe, expect, it } from 'vitest';

const cathedral = { lat: 48.1, lng: 11.5, name: 'Cathedral' };
const market = { lat: 48.11, lng: 11.51, name: 'Market' };
const park = { lat: 48.13, lng: 11.53, name: 'Park' };
const steer = { lat: 48.105, lng: 11.505, shaping: true };

describe('isClosedLoop (PR1-01)', () => {
  it('is a tour of three points or more whose last stands on the spot of its first', () => {
    expect(isClosedLoop([cathedral, market, { ...cathedral }])).toBe(true);
    expect(isClosedLoop([cathedral, market, { lat: cathedral.lat + 5e-8, lng: cathedral.lng - 5e-8 }])).toBe(true);
    expect(isClosedLoop([cathedral, market, park])).toBe(false);
    expect(isClosedLoop([cathedral, market, { lat: cathedral.lat + 1e-6, lng: cathedral.lng }])).toBe(false);
  });

  it('is no loop with two points on one spot, or with none', () => {
    expect(isClosedLoop([cathedral, { ...cathedral }])).toBe(false);
    expect(isClosedLoop([])).toBe(false);
  });
});

describe('walkStationsOf (CW-02, CW-03)', () => {
  it('lists the stops in order and leaves a shaping point out', () => {
    expect(walkStationsOf([cathedral, steer, market, park])).toEqual([cathedral, market, park]);
  });

  it('leaves the way back of a loop out, so its start is one station', () => {
    const back = { ...cathedral, name: 'Cathedral again' };
    expect(walkStationsOf([cathedral, steer, market, park, back])).toEqual([cathedral, market, park]);
    expect(walkStationsOf([cathedral, { ...cathedral }])).toEqual([cathedral, cathedral]);
    expect(walkStationsOf([])).toEqual([]);
  });
});
