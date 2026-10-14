import { DomainError } from '../../../src/nest/common/domain-error';
import { FerratasOverpassClient } from '../../../src/nest/ferratas/ferratas-overpass.client';
import {
  FERRATA_CACHE_MAX,
  FERRATA_CACHE_TTL_MS,
  FERRATAS_UNAVAILABLE_MESSAGE,
  FerratasService,
} from '../../../src/nest/ferratas/ferratas.service';
import { Test } from '@nestjs/testing';
import { FERRATAS_ATTRIBUTION, FERRATAS_UNAVAILABLE_CODE, ferratasResponseSchema } from '@trek/shared';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const bbox = { south: 47.12, west: 11.21, north: 47.38, east: 11.57 };
const element = {
  type: 'way',
  id: 42,
  tags: { highway: 'via_ferrata', name: 'Klettersteig', via_ferrata_scale: '2+' },
  geometry: [
    { lat: 47.2, lon: 11.3 },
    { lat: 47.21, lon: 11.31 },
  ],
};

const query = vi.fn<(q: string) => Promise<unknown[]>>();
let service: FerratasService;

beforeEach(async () => {
  query.mockReset();
  query.mockResolvedValue([element]);
  const moduleRef = await Test.createTestingModule({
    providers: [FerratasService, { provide: FerratasOverpassClient, useValue: { query } }],
  }).compile();
  service = moduleRef.get(FerratasService);
});

describe('FerratasService.list', () => {
  it('answers the ferratas with source and attribution, inside the response contract', async () => {
    const res = await service.list(bbox);
    expect(res).toMatchObject({ truncated: false, source: 'openstreetmap', attribution: FERRATAS_ATTRIBUTION });
    expect(res.ferratas.map((f) => f.id)).toEqual(['way/42']);
    expect(ferratasResponseSchema.safeParse(res).success).toBe(true);
  });

  it('answers only the ferratas that reach into the asked box, not the whole snapped box', async () => {
    const outside = {
      ...element,
      id: 43,
      geometry: [
        { lat: 47.1, lon: 11.3 },
        { lat: 47.11, lon: 11.31 },
      ],
    };
    query.mockResolvedValue([element, outside]);

    const res = await service.list(bbox);

    expect(res.ferratas.map((ferrata) => ferrata.id)).toEqual(['way/42']);
  });

  it('asks Overpass for the box snapped to the grid', async () => {
    await service.list(bbox);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('(47.1,11.2,47.4,11.6)');
  });

  it('serves a nearby request from the cache inside the TTL', async () => {
    await service.list(bbox, 1_000);
    await service.list({ south: 47.11, west: 11.22, north: 47.39, east: 11.59 }, 1_000 + FERRATA_CACHE_TTL_MS - 1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('asks again once the entry is older than the TTL', async () => {
    await service.list(bbox, 1_000);
    await service.list(bbox, 1_000 + FERRATA_CACHE_TTL_MS);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('shares one Overpass call between concurrent identical requests', async () => {
    let release: (v: unknown[]) => void = () => {};
    query.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const both = Promise.all([service.list(bbox), service.list(bbox)]);
    release([element]);
    const [a, b] = await both;
    expect(a).toBe(b);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('turns an Overpass failure into a 502 with a code, and does not cache it', async () => {
    query.mockRejectedValueOnce(new Error('Could not reach any Overpass endpoint'));
    const err = await service.list(bbox).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    const domain = err as DomainError;
    expect(domain.getStatus()).toBe(502);
    expect(domain.code).toBe(FERRATAS_UNAVAILABLE_CODE);
    expect(domain.getResponse()).toEqual({ error: FERRATAS_UNAVAILABLE_MESSAGE, code: FERRATAS_UNAVAILABLE_CODE });

    const retry = await service.list(bbox);
    expect(retry.ferratas).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest box once the cache is full', async () => {
    const boxAt = (i: number) => ({ south: 10 + i * 0.1, west: 10, north: 10.04 + i * 0.1, east: 10.04 });
    // One after another, so the insertion order is the call order.
    await Array.from({ length: FERRATA_CACHE_MAX + 1 }, (_, i) => i).reduce<Promise<unknown>>(async (previous, i) => {
      await previous;
      return service.list(boxAt(i), 1_000);
    }, Promise.resolve());
    expect(query).toHaveBeenCalledTimes(FERRATA_CACHE_MAX + 1);

    await service.list(boxAt(FERRATA_CACHE_MAX), 1_000);
    expect(query).toHaveBeenCalledTimes(FERRATA_CACHE_MAX + 1);
    await service.list(boxAt(0), 1_000);
    expect(query).toHaveBeenCalledTimes(FERRATA_CACHE_MAX + 2);
  });
});
