import { OverpassElementsClient } from '../../../src/nest/overpass/overpass-elements.service';
import { TourTrailGradeService } from '../../../src/nest/tours/tour-trail-grade.service';
import { Test } from '@nestjs/testing';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// TOUR-GRADE-001 to TOUR-GRADE-006

const query = vi.fn<(q: string, caller: string) => Promise<unknown[]>>();
let service: TourTrailGradeService;

beforeEach(async () => {
  query.mockReset();
  const moduleRef = await Test.createTestingModule({
    providers: [TourTrailGradeService, { provide: OverpassElementsClient, useValue: { query } }],
  }).compile();
  service = moduleRef.get(TourTrailGradeService);
});

const way = (id: number, tags: Record<string, string>) => ({ type: 'way', id, tags });

describe('TourTrailGradeService (BIK-05)', () => {
  it('TOUR-GRADE-001: reads each scale to its steps and leaves a way without one out', async () => {
    query.mockResolvedValue([
      way(1, { 'mtb:scale': '2+', 'mtb:scale:uphill': '3' }),
      way(2, { 'mtb:scale': 'S1', 'mtb:scale:imba': '2' }),
      way(3, { highway: 'track' }),
      way(4, { 'mtb:scale': '9', 'mtb:scale:imba': 'hard' }),
    ]);
    const answer = await service.grades({ way_ids: [1, 2, 3, 4, 5] });
    expect(answer).toEqual({
      ways: [
        { id: 1, mtb_scale: '2+', mtb_scale_uphill: '3', mtb_scale_imba: null },
        { id: 2, mtb_scale: '1', mtb_scale_uphill: null, mtb_scale_imba: '2' },
      ],
      unanswered: [],
    });
    expect(query).toHaveBeenCalledWith('[out:json][timeout:25];way(id:1,2,3,4,5);out tags;', 'Tours');
  });

  it('TOUR-GRADE-002: names the ways it could not ask about, never guesses them', async () => {
    query.mockRejectedValue(new Error('all mirrors down'));
    expect(await service.grades({ way_ids: [7, 8] })).toEqual({ ways: [], unanswered: [7, 8] });
  });

  it('TOUR-GRADE-003: asks a long tour in parts, one after another, and keeps what one part answered', async () => {
    const ids = Array.from({ length: 900 }, (_, index) => index + 1);
    query
      .mockResolvedValueOnce([way(1, { 'mtb:scale': '0' })])
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([way(900, { 'mtb:scale': '5' })]);
    const answer = await service.grades({ way_ids: ids });
    expect(query).toHaveBeenCalledTimes(3);
    expect(answer.ways.map((grade) => grade.id)).toEqual([1, 900]);
    expect(answer.unanswered).toHaveLength(400);
    expect(answer.unanswered[0]).toBe(401);
  });

  it('TOUR-GRADE-004: asks a way it already read only again a day later', async () => {
    vi.useFakeTimers();
    try {
      query.mockResolvedValue([way(1, { 'mtb:scale': '3' })]);
      await service.grades({ way_ids: [1, 1] });
      await service.grades({ way_ids: [1] });
      expect(query).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
      await service.grades({ way_ids: [1] });
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('TOUR-GRADE-005: skips what is no way in the answer', async () => {
    query.mockResolvedValue([{ type: 'node', id: 1, tags: { 'mtb:scale': '1' } }, { nonsense: true }]);
    expect(await service.grades({ way_ids: [1] })).toEqual({ ways: [], unanswered: [] });
  });

  it('TOUR-GRADE-006: keeps at most fifty thousand ways, forgetting the longest kept first', async () => {
    query.mockResolvedValue([]);
    // One request after another, as the planner sends them.
    await Array.from({ length: 26 }, (_, part) => part).reduce(async (previous, part) => {
      await previous;
      await service.grades({ way_ids: Array.from({ length: 2000 }, (_, index) => part * 2000 + index + 1) });
    }, Promise.resolve());
    query.mockClear();
    // The first way was forgotten, so it is asked about again; the last one is still kept.
    await service.grades({ way_ids: [1] });
    expect(query).toHaveBeenCalledTimes(1);
    query.mockClear();
    await service.grades({ way_ids: [52_000] });
    expect(query).not.toHaveBeenCalled();
  });
});
