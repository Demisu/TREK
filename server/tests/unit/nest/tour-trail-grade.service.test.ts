import { OverpassElementsClient } from '../../../src/nest/overpass/overpass-elements.service';
import { TourTrailGradeService } from '../../../src/nest/tours/tour-trail-grade.service';
import { Test } from '@nestjs/testing';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// TOUR-GRADE-001 to TOUR-GRADE-010

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
const NO_SAC = { sac_scale: null, sac_scale_unclear: null };
const NO_MTB = { mtb_scale: null, mtb_scale_uphill: null, mtb_scale_imba: null };
const NO_WAY = { surface: null, highway: null };

describe('TourTrailGradeService (BIK-05)', () => {
  it('TOUR-GRADE-001: reads each scale to its steps and leaves a way without any value out', async () => {
    query.mockResolvedValue([
      way(1, { 'mtb:scale': '2+', 'mtb:scale:uphill': '3' }),
      way(2, { 'mtb:scale': 'S1', 'mtb:scale:imba': '2' }),
      way(3, { name: 'Forstweg' }),
      way(4, { 'mtb:scale': '9', 'mtb:scale:imba': 'hard' }),
    ]);
    const answer = await service.grades({ way_ids: [1, 2, 3, 4, 5] });
    expect(answer).toEqual({
      ways: [
        { ...NO_SAC, ...NO_WAY, id: 1, mtb_scale: '2+', mtb_scale_uphill: '3', mtb_scale_imba: null },
        { ...NO_SAC, ...NO_WAY, id: 2, mtb_scale: '1', mtb_scale_uphill: null, mtb_scale_imba: '2' },
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

  it('TOUR-GRADE-007: reads sac_scale exactly as OpenStreetMap wrote it and hands any other value on as written (MAP-03)', async () => {
    query.mockResolvedValue([
      way(1, { sac_scale: 'demanding_mountain_hiking' }),
      way(2, { sac_scale: ' Alpine_Hiking ', 'mtb:scale': '3' }),
      way(3, { sac_scale: 'T3' }),
      way(4, { sac_scale: 'hiking;mountain_hiking' }),
      way(5, { sac_scale: '   ' }),
      way(6, { sac_scale: `x${'y'.repeat(80)}` }),
      way(7, { sac_scale: ' mountain_hiking ' }),
    ]);
    const answer = await service.grades({ way_ids: [1, 2, 3, 4, 5, 6, 7] });
    expect(answer.ways).toEqual([
      { ...NO_MTB, ...NO_WAY, id: 1, sac_scale: 'demanding_mountain_hiking', sac_scale_unclear: null },
      { ...NO_MTB, ...NO_WAY, id: 2, mtb_scale: '3', sac_scale: null, sac_scale_unclear: 'Alpine_Hiking' },
      { ...NO_MTB, ...NO_WAY, id: 3, sac_scale: null, sac_scale_unclear: 'T3' },
      { ...NO_MTB, ...NO_WAY, id: 4, sac_scale: null, sac_scale_unclear: 'hiking;mountain_hiking' },
      { ...NO_MTB, ...NO_WAY, id: 6, sac_scale: null, sac_scale_unclear: `x${'y'.repeat(63)}` },
      { ...NO_MTB, ...NO_WAY, id: 7, sac_scale: 'mountain_hiking', sac_scale_unclear: null },
    ]);
  });

  it('TOUR-GRADE-008: never reads a hiking grade from anything but sac_scale (MAP-03)', async () => {
    query.mockResolvedValue([
      way(1, { trail_visibility: 'bad', 'osmc:symbol': 'blue:white:blue_bar', highway: 'path', incline: '30%' }),
    ]);
    expect(await service.grades({ way_ids: [1] })).toEqual({
      ways: [{ ...NO_MTB, ...NO_SAC, id: 1, surface: null, highway: 'path' }],
      unanswered: [],
    });
  });

  it('TOUR-GRADE-009: hands the surface and the kind of way on as written, only trimmed and bounded (MAP-04)', async () => {
    query.mockResolvedValue([
      way(1, { surface: 'fine_gravel', highway: 'track' }),
      way(2, { surface: ' Asphalt ', highway: 'footway' }),
      way(3, { surface: 'gravel;ground' }),
      way(4, { surface: '  ', highway: `x${'y'.repeat(80)}` }),
    ]);
    const answer = await service.grades({ way_ids: [1, 2, 3, 4] });
    expect(answer.ways).toEqual([
      { ...NO_MTB, ...NO_SAC, id: 1, surface: 'fine_gravel', highway: 'track' },
      { ...NO_MTB, ...NO_SAC, id: 2, surface: 'Asphalt', highway: 'footway' },
      { ...NO_MTB, ...NO_SAC, id: 3, surface: 'gravel;ground', highway: null },
      { ...NO_MTB, ...NO_SAC, id: 4, surface: null, highway: `x${'y'.repeat(63)}` },
    ]);
  });

  it('TOUR-GRADE-010: never reads a surface from anything but the surface tag (MAP-04)', async () => {
    query.mockResolvedValue([way(1, { tracktype: 'grade1', smoothness: 'good', 'surface:note': 'gravel' })]);
    expect(await service.grades({ way_ids: [1] })).toEqual({ ways: [], unanswered: [] });
  });
});
