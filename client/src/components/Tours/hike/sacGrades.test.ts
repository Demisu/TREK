import type { TourTrailGrade } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import type { RouteWayEdge, RouteWays } from '../bike/routeWays';
import {
  highestStep,
  isSacStep,
  sacClassifier,
  sacOverlay,
  sacPaintKey,
  sacShares,
  sacStepOfClass,
  sacTagOf,
  unclearTags,
} from './sacGrades';

// FE-HIKE-SAC-001 to FE-HIKE-SAC-007

const LINE: [number, number][] = Array.from({ length: 8 }, (_, index): [number, number] => [47 + index / 1000, 11]);

const edge = (from: number, wayId: number | null, lengthM = 100): RouteWayEdge => ({
  from,
  to: from + 1,
  lengthM,
  surface: 'unknown',
  way: 'path',
  wayId,
});

const grade = (id: number, sac: Partial<Pick<TourTrailGrade, 'sac_scale' | 'sac_scale_unclear'>>): TourTrailGrade => ({
  id,
  mtb_scale: null,
  mtb_scale_uphill: null,
  mtb_scale_imba: null,
  sac_scale: null,
  sac_scale_unclear: null,
  ...sac,
});

// One stretch of each kind: T3 (twice as long), T1, unclear, untagged, unasked, no way, a T6 way that strays.
const WAYS: RouteWays = {
  line: LINE,
  edges: [
    edge(0, 1, 200),
    edge(1, 2),
    edge(2, 3),
    edge(3, 4),
    edge(4, 5),
    edge(5, null),
    edge(6, 7),
  ],
};
const GRADES = {
  byWay: new Map([
    [1, grade(1, { sac_scale: 'demanding_mountain_hiking' })],
    [2, grade(2, { sac_scale: 'hiking' })],
    [3, grade(3, { sac_scale_unclear: 'T3;T4' })],
    [7, grade(7, { sac_scale: 'difficult_alpine_hiking' })],
  ]),
  unasked: new Set([5]),
};
const STRAYS = new Set([WAYS.edges[6]]);

describe('sacGrades (MAP-03)', () => {
  it('FE-HIKE-SAC-001: reads each stretch to its step, and every unknown to its own reason, never to T1', () => {
    const classOf = sacClassifier(GRADES, STRAYS);
    expect(WAYS.edges.map(classOf)).toEqual(['t3', 't1', 'unclear', 'untagged', 'unasked', 'unmatched', 'unmatched']);
  });

  it('FE-HIKE-SAC-002: the shares come in the scale order, the steps first, then the unknown', () => {
    const rows = sacShares(WAYS, sacClassifier(GRADES, STRAYS));
    expect(rows.map((row) => row.key)).toEqual(['t1', 't3', 'untagged', 'unclear', 'unmatched', 'unasked']);
    expect(rows.find((row) => row.key === 't3')).toMatchObject({ lengthM: 200, share: 0.25 });
    expect(rows.find((row) => row.key === 'unmatched')?.lengthM).toBe(200);
  });

  it('FE-HIKE-SAC-003: names a step by its class, its value in OpenStreetMap and its paint', () => {
    expect(isSacStep('t4')).toBe(true);
    expect(isSacStep('unclear')).toBe(false);
    expect(isSacStep('untagged')).toBe(false);
    expect(sacStepOfClass('t6')).toBe(6);
    expect(sacStepOfClass('untagged')).toBeNull();
    expect(sacTagOf('t1')).toBe('hiking');
    expect(sacTagOf('t6')).toBe('difficult_alpine_hiking');
    expect(sacPaintKey('t2')).toBe('t2');
    expect(sacPaintKey('unasked')).toBe('unknown');
  });

  it('FE-HIKE-SAC-004: hands on an unclear grade as OpenStreetMap wrote it, each value once', () => {
    const twice: RouteWays = { line: LINE, edges: [edge(0, 3), edge(1, 3), edge(2, 1)] };
    expect(unclearTags(twice, GRADES, () => true)).toEqual(['T3;T4']);
    expect(unclearTags(twice, GRADES, () => false)).toEqual([]);
    expect(unclearTags({ line: LINE, edges: [edge(0, null)] }, GRADES, () => true)).toEqual([]);
  });

  it('FE-HIKE-SAC-005: the highest step known, or none where no step is', () => {
    const rows = sacShares(WAYS, sacClassifier(GRADES, STRAYS));
    expect(highestStep(rows)).toBe(3);
    expect(highestStep(rows.filter((row) => !isSacStep(row.key)))).toBeNull();
  });

  it('FE-HIKE-SAC-006: draws every class along the line in its paint, neighbours of a class joined', () => {
    const classOf = sacClassifier(GRADES, STRAYS);
    const overlay = sacOverlay(WAYS, sacShares(WAYS, classOf), classOf);
    expect(overlay.paints).toEqual(['t1', 't3', 'unknown', 'unknown', 'unknown', 'unknown']);
    expect(overlay.lines).toHaveLength(6);
    // The no-way stretch and the stray one sit side by side and are one stretch of their class.
    expect(overlay.lines[4]).toEqual(LINE.slice(5, 8));
  });

  it('FE-HIKE-SAC-007: draws one class alone when it is picked', () => {
    const classOf = sacClassifier(GRADES, STRAYS);
    const overlay = sacOverlay(WAYS, sacShares(WAYS, classOf), classOf, 't3');
    expect(overlay).toEqual({ lines: [LINE.slice(0, 2)], paints: ['t3'] });
  });
});
