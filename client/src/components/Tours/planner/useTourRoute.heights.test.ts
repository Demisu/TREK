import { describe, expect, it } from 'vitest';
import { interpolatedHeights } from './useTourRoute';

// FE-TOUR-ROUTE-HEIGHTS-001 to FE-TOUR-ROUTE-HEIGHTS-002

describe('interpolatedHeights (SKI-02)', () => {
  it('FE-TOUR-ROUTE-HEIGHTS-001: fills the points the elevation source missed straight between the known ones', () => {
    const line: Array<[number, number] | [number, number, number]> = [
      [47, 11],
      [47.001, 11, 1000],
      [47.002, 11],
      [47.003, 11],
      [47.004, 11, 1300],
      [47.005, 11],
    ];
    expect(interpolatedHeights(line)?.map((point) => point[2])).toEqual([1000, 1000, 1100, 1200, 1300, 1300]);
  });

  it('FE-TOUR-ROUTE-HEIGHTS-002: a line without one known height has none to estimate from', () => {
    expect(
      interpolatedHeights([
        [47, 11],
        [47.001, 11],
      ])
    ).toBeNull();
  });
});
