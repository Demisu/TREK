import { DomainError } from '../../../src/nest/common/domain-error';
import { OverpassElementsClient } from '../../../src/nest/overpass/overpass-elements.service';
import {
  HORSE_ROUTES_KEPT_MS,
  HORSE_ROUTES_UNAVAILABLE_MESSAGE,
  TourHorseRoutesService,
} from '../../../src/nest/tours/tour-horse-routes.service';
import { Test } from '@nestjs/testing';
import { HORSE_ROUTES_ATTRIBUTION, HORSE_ROUTES_UNAVAILABLE_CODE, horseRoutesResponseSchema } from '@trek/shared';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// HORSE-SVC-001 to HORSE-SVC-005

const query = vi.fn<(q: string, caller: string) => Promise<unknown[]>>();
let service: TourHorseRoutesService;

const NOW = 1_800_000_000_000;
const box = { south: 47.12, west: 11.21, north: 47.18, east: 11.29 };
const elements = [
  { type: 'relation', id: 7, tags: { route: 'horse', name: 'Reitweg' }, members: [{ type: 'way', ref: 1, role: '' }] },
  {
    type: 'way',
    id: 1,
    tags: { horse: 'designated' },
    nodes: [1, 2],
    geometry: [
      { lat: 47.15, lon: 11.25 },
      { lat: 47.16, lon: 11.25 },
    ],
  },
];

beforeEach(async () => {
  query.mockReset();
  const moduleRef = await Test.createTestingModule({
    providers: [TourHorseRoutesService, { provide: OverpassElementsClient, useValue: { query } }],
  }).compile();
  service = moduleRef.get(TourHorseRoutesService);
});

describe('TourHorseRoutesService (HOR-01)', () => {
  it('HORSE-SVC-001: asks Overpass for the box grown to the grid and answers the contract', async () => {
    query.mockResolvedValue(elements);
    const answer = await service.list(box, NOW);
    expect(horseRoutesResponseSchema.parse(answer)).toEqual(answer);
    expect(answer).toMatchObject({ truncated: false, source: 'openstreetmap', attribution: HORSE_ROUTES_ATTRIBUTION });
    expect(answer.routes.map((route) => route.id)).toEqual(['relation/7']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('(47.1,11.2,47.2,11.3)');
    expect(query.mock.calls[0]?.[1]).toBe('HorseRoutes');
  });

  it('HORSE-SVC-002: keeps an answer for nearby views, and asks again once it is old', async () => {
    query.mockResolvedValue(elements);
    await service.list(box, NOW);
    await service.list({ south: 47.11, west: 11.22, north: 47.19, east: 11.28 }, NOW + 1000);
    expect(query).toHaveBeenCalledTimes(1);
    await service.list(box, NOW + HORSE_ROUTES_KEPT_MS);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('HORSE-SVC-003: two requests for the same box at once share one query', async () => {
    let answer: (value: unknown[]) => void = () => undefined;
    query.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const both = Promise.all([service.list(box, NOW), service.list(box, NOW)]);
    answer(elements);
    const [first, second] = await both;
    expect(first).toEqual(second);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('HORSE-SVC-004: no mirror answering is a 502 the client can show, and the next request asks again', async () => {
    query.mockRejectedValueOnce(new Error('all mirrors down'));
    const failure = await service.list(box, NOW).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).getStatus()).toBe(502);
    expect((failure as DomainError).getResponse()).toEqual({
      error: HORSE_ROUTES_UNAVAILABLE_MESSAGE,
      code: HORSE_ROUTES_UNAVAILABLE_CODE,
    });
    query.mockResolvedValueOnce(elements);
    expect((await service.list(box, NOW)).routes).toHaveLength(1);
  });

  it('HORSE-SVC-005: keeps at most two hundred answers, letting the one kept longest go', async () => {
    query.mockResolvedValue([]);
    const nth = (n: number) => ({ south: 40 + n * 0.1, west: 5, north: 40.05 + n * 0.1, east: 5.05 });
    for (let n = 0; n <= 200; n += 1) await service.list(nth(n), NOW);
    expect(query).toHaveBeenCalledTimes(201);
    await service.list(nth(200), NOW);
    expect(query).toHaveBeenCalledTimes(201);
    await service.list(nth(0), NOW);
    expect(query).toHaveBeenCalledTimes(202);
  });
});
