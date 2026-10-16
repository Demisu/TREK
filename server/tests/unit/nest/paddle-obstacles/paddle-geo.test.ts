/**
 * The geometry of PAD-05A's reading side: the box a request asks for, whether
 * a point lies in a region's boundary, and how far the data covers a box.
 */
import {
  boundaryContains,
  boxOfBoundary,
  coverageOf,
  parseBox,
  type RegionBoundary,
} from '../../../../src/nest/paddle-obstacles/paddle-geo';

import { describe, expect, it } from 'vitest';

/** A square region 49 to 50 north and 11 to 13 east, with a hole 49.4 to 49.6 north, 11.8 to 12.2 east. */
const holed: RegionBoundary = {
  type: 'Polygon',
  coordinates: [
    [
      [11, 49],
      [13, 49],
      [13, 50],
      [11, 50],
      [11, 49],
    ],
    [
      [11.8, 49.4],
      [12.2, 49.4],
      [12.2, 49.6],
      [11.8, 49.6],
      [11.8, 49.4],
    ],
  ],
};

const twoIslands: RegionBoundary = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
    [
      [
        [5, 5],
        [6, 5],
        [6, 6],
        [5, 6],
        [5, 5],
      ],
    ],
  ],
};

describe('parseBox', () => {
  it('PGEO-001: reads south,west,north,east', () => {
    expect(parseBox('49.1,12.0,49.3,12.4')).toEqual({ south: 49.1, west: 12, north: 49.3, east: 12.4 });
    expect(parseBox('-34,-71,-33.5,-70.5')).toEqual({ south: -34, west: -71, north: -33.5, east: -70.5 });
  });

  it.each([
    ['49.1,12.0,49.3', 'a corner missing'],
    ['49.1,12.0,49.3,abc', 'a part that is no number'],
    ['49.3,12.0,49.1,12.4', 'south above north'],
    ['49.1,12.4,49.3,12.0', 'west east of east'],
    ['89.5,0,91,0.5', 'a latitude past the pole'],
    ['0,179.5,0.5,181', 'a longitude past the date line'],
    ['49,12,50.5,12.5', 'more than one degree north to south'],
    ['49,12,49.5,13.5', 'more than one degree west to east'],
  ])('PGEO-002: refuses %s (%s)', (text) => {
    expect(parseBox(text)).toBeNull();
  });

  it('PGEO-003: takes a box of exactly one degree a side', () => {
    expect(parseBox('49,12,50,13')).toEqual({ south: 49, west: 12, north: 50, east: 13 });
  });
});

describe('boundaryContains', () => {
  it('PGEO-004: a point in the outer ring and in no hole is inside', () => {
    expect(boundaryContains(holed, 49.2, 11.5)).toBe(true);
    expect(boundaryContains(holed, 49.5, 12)).toBe(false);
    expect(boundaryContains(holed, 48.9, 12)).toBe(false);
  });

  it('PGEO-005: a point in any polygon of a multipolygon is inside', () => {
    expect(boundaryContains(twoIslands, 0.5, 0.5)).toBe(true);
    expect(boundaryContains(twoIslands, 5.5, 5.5)).toBe(true);
    expect(boundaryContains(twoIslands, 3, 3)).toBe(false);
  });

  it('PGEO-006: a polygon without rings contains nothing', () => {
    expect(boundaryContains({ type: 'Polygon', coordinates: [] }, 0, 0)).toBe(false);
  });
});

describe('coverageOf', () => {
  it('PGEO-007: without a region the area is not covered at all', () => {
    expect(coverageOf({ south: 49, west: 11, north: 49.1, east: 11.1 }, [])).toBe('none');
  });

  it('PGEO-008: a box wholly inside a boundary is covered', () => {
    expect(coverageOf({ south: 49.1, west: 11.1, north: 49.2, east: 11.3 }, [holed])).toBe('covered');
  });

  it('PGEO-009: a box reaching past the edge, or into a hole, is partly covered', () => {
    expect(coverageOf({ south: 49.9, west: 12.9, north: 50.1, east: 13.1 }, [holed])).toBe('partial');
    expect(coverageOf({ south: 49.45, west: 11.9, north: 49.55, east: 12.1 }, [holed])).toBe('partial');
  });

  it('PGEO-010: two regions together can cover a box neither covers alone', () => {
    const west: RegionBoundary = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    const east: RegionBoundary = {
      type: 'Polygon',
      coordinates: [
        [
          [0.9, 0],
          [2, 0],
          [2, 1],
          [0.9, 1],
          [0.9, 0],
        ],
      ],
    };
    const box = { south: 0.2, west: 0.5, north: 0.8, east: 1.5 };
    expect(coverageOf(box, [west])).toBe('partial');
    expect(coverageOf(box, [west, east])).toBe('covered');
  });

  it('PGEO-011: a region whose boundary is unknown counts by its box alone', () => {
    expect(coverageOf({ south: 0, west: 0, north: 0.5, east: 0.5 }, [null])).toBe('covered');
  });
});

describe('boxOfBoundary', () => {
  it('PGEO-012: spans the outer rings of every polygon', () => {
    expect(boxOfBoundary(holed)).toEqual({ south: 49, west: 11, north: 50, east: 13 });
    expect(boxOfBoundary(twoIslands)).toEqual({ south: 0, west: 0, north: 6, east: 6 });
  });
});
