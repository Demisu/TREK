/**
 * PaddleCheckCache: the readings of the last lines, the least recently used
 * one dropped once it holds more than it keeps.
 */
import { PaddleCheckCache, type PaddleCheckEvaluation } from '../../../src/nest/tours/tour-paddle-check.cache';

import { describe, expect, it } from 'vitest';

function evaluation(totalM: number): PaddleCheckEvaluation {
  return {
    line: { points: [], alongM: [], totalM, portages: [], locks: [] },
    candidates: [],
    own: [],
    dataKeys: new Set(),
    complete: true,
    data: { data: 'covered', data_as_of: null, read_at: null },
  };
}

describe('PaddleCheckCache', () => {
  it('PCC-001: answers what it was given and nothing it was not', () => {
    const cache = new PaddleCheckCache();
    cache.set('a', evaluation(1));
    expect(cache.get('a')?.line.totalM).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    cache.set('a', evaluation(2));
    expect(cache.get('a')?.line.totalM).toBe(2);
  });

  it('PCC-002: past 256 readings drops the one used longest ago, a reading just read is kept', () => {
    const cache = new PaddleCheckCache();
    for (let i = 0; i < 256; i++) cache.set(`line-${i}`, evaluation(i));
    expect(cache.get('line-0')).toBeDefined();
    cache.set('line-256', evaluation(256));
    expect(cache.get('line-0')).toBeDefined();
    expect(cache.get('line-1')).toBeUndefined();
    expect(cache.get('line-256')).toBeDefined();
  });
});
