import { describe, expect, it } from 'vitest';
import type { TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';
import { defaultAfterId, insertionBlock, withPointAfter } from './poiInsertion';

// FE-TOUR-POI-INSERT-001 to FE-TOUR-POI-INSERT-005

const point = (id: string, lat: number, lng: number, over: Partial<TourPlannerWaypoint> = {}): TourPlannerWaypoint => ({
  id,
  lat,
  lng,
  role: 'via',
  ...over,
});

const A = point('a', 47.0, 11.0, { role: 'start' });
const B = point('b', 47.01, 11.0);
const C = point('c', 47.02, 11.0, { role: 'end' });
const NEW = point('new', 47.005, 11.001);

describe('placing a found place in the tour (PLN-03)', () => {
  it('FE-TOUR-POI-INSERT-001: goes in right after the point chosen, as a stop the router plans to', () => {
    expect(withPointAfter([A, B, C], 'a', NEW)?.map((p) => p.id)).toEqual(['a', 'new', 'b', 'c']);
    expect(withPointAfter([A, B, C], 'a', NEW)?.[1]).toMatchObject({ role: 'via' });
    // After the last point the tour goes on to it.
    expect(withPointAfter([A, B, C], 'c', NEW)?.map((p) => p.id)).toEqual(['a', 'b', 'c', 'new']);
  });

  it('FE-TOUR-POI-INSERT-002: never cuts a fixed line or a stretch drawn by hand', () => {
    const ferrata = point('b', 47.01, 11.0, {
      fixedLeg: {
        kind: 'ferrata',
        ref: 'way/1',
        name: null,
        geometry: [
          [47.01, 11.0],
          [47.02, 11.0],
        ],
      },
    });
    const free = point('b', 47.01, 11.0, {
      fixedLeg: {
        kind: 'free',
        geometry: [
          [47.01, 11.0],
          [47.02, 11.0],
        ],
      },
    });
    expect(insertionBlock([A, ferrata, C], 'b')).toBe('fixed');
    expect(insertionBlock([A, free, C], 'b')).toBe('free');
    expect(withPointAfter([A, free, C], 'b', NEW)).toBeNull();
    expect(insertionBlock([A, free, C], 'a')).toBeNull();
  });

  it('FE-TOUR-POI-INSERT-003: nothing goes after the way back of a loop, or after a point that is gone', () => {
    const back = point('back', 47.0, 11.0, { role: 'end' });
    expect(insertionBlock([A, B, back], 'back')).toBe('none');
    expect(insertionBlock([A, B, C], 'gone')).toBe('none');
    expect(withPointAfter([A, B, back], 'back', NEW)).toBeNull();
  });

  it('FE-TOUR-POI-INSERT-004: suggests the last point before the place along the route', () => {
    const route: Array<[number, number]> = [
      [47.0, 11.0],
      [47.01, 11.0],
      [47.02, 11.0],
    ];
    // About 1.6 km along: after B (1.1 km), before C (2.2 km).
    expect(defaultAfterId([A, B, C], route, 1600)).toBe('b');
    expect(defaultAfterId([A, B, C], route, 100)).toBe('a');
    // Without a route the points themselves stand in for the line.
    expect(defaultAfterId([A, B, C], null, 1600)).toBe('b');
  });

  it('FE-TOUR-POI-INSERT-005: skips a point that cannot take a stop, and has nothing to suggest without one', () => {
    const free = point('b', 47.01, 11.0, {
      fixedLeg: {
        kind: 'free',
        geometry: [
          [47.01, 11.0],
          [47.02, 11.0],
        ],
      },
    });
    expect(defaultAfterId([A, free, C], null, 1600)).toBe('a');
    expect(defaultAfterId([], null, 0)).toBeNull();
  });
});
