/**
 * FE-FERRATA-HOOK-001 to FE-FERRATA-HOOK-010: when the via ferrata layer asks
 * the server, and what it reports while it does.
 *
 * The request goes to a public Overpass mirror behind the server, so the hook
 * has to be frugal: nothing while the layer is off, one request per settled
 * map area, the old one aborted when the area moves on, and none at all for an
 * area the server would refuse or a device that is offline.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ferrata, FerrataBbox, FerratasResponse } from '@trek/shared';

import { useNetworkMode } from '../../hooks/useNetworkMode';
import { ferrataRepo } from '../../repo/ferrataRepo';
import { useTripFerratas } from './useTripFerratas';

vi.mock('../../repo/ferrataRepo', () => ({ ferrataRepo: { list: vi.fn() } }));
vi.mock('../../hooks/useNetworkMode', () => ({ useNetworkMode: vi.fn() }));

const BOX: FerrataBbox = { south: 46.5, west: 11.7, north: 46.6, east: 11.9 };
const OTHER: FerrataBbox = { south: 46.4, west: 11.6, north: 46.5, east: 11.8 };

const FERRATA: Ferrata = {
  id: 'way/42',
  name: 'Via delle Trincee',
  grade: { raw: '4', level: 4, plus: null },
  routeName: null,
  geometry: [
    [46.52, 11.8],
    [46.53, 11.81],
  ],
  osmUrl: 'https://www.openstreetmap.org/way/42',
};

const reply = (ferratas: Ferrata[] = [FERRATA], truncated = false): FerratasResponse => ({
  ferratas,
  truncated,
  source: 'openstreetmap',
  attribution: '© OpenStreetMap contributors',
});

const network = (offline: boolean) =>
  vi.mocked(useNetworkMode).mockReturnValue({ offline, forced: false, setForced: vi.fn() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  network(false);
  vi.mocked(ferrataRepo.list).mockResolvedValue(reply());
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the debounce run out and the repo's promise settle. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('useTripFerratas', () => {
  it('FE-FERRATA-HOOK-001: asks for nothing while the layer is off', async () => {
    const { result } = renderHook(() => useTripFerratas(7, BOX, false));
    await settle();

    expect(ferrataRepo.list).not.toHaveBeenCalled();
    expect(result.current).toEqual({ ferratas: [], status: 'idle', truncated: false, attribution: null });
  });

  it('FE-FERRATA-HOOK-002: waits for the area to settle, then asks once for the rounded box', async () => {
    const { result } = renderHook(() => useTripFerratas(7, BOX, true));
    expect(result.current.status).toBe('loading');
    expect(ferrataRepo.list).not.toHaveBeenCalled();

    await settle();

    expect(ferrataRepo.list).toHaveBeenCalledTimes(1);
    expect(ferrataRepo.list).toHaveBeenCalledWith(7, '46.500,11.700,46.600,11.900', expect.any(AbortSignal));
    expect(result.current).toEqual({
      ferratas: [FERRATA],
      status: 'ready',
      truncated: false,
      attribution: '© OpenStreetMap contributors',
    });
  });

  it('FE-FERRATA-HOOK-003: a pan before the debounce runs out sends only the last area', async () => {
    const { rerender } = renderHook(({ box }) => useTripFerratas(7, box, true), { initialProps: { box: BOX } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    rerender({ box: OTHER });
    await settle();

    expect(ferrataRepo.list).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ferrataRepo.list).mock.calls[0]?.[1]).toBe('46.400,11.600,46.500,11.800');
  });

  it('FE-FERRATA-HOOK-004: a new area aborts the request in flight and keeps the old lines while it loads', async () => {
    let first: AbortSignal | undefined;
    vi.mocked(ferrataRepo.list).mockImplementationOnce((_trip, _bbox, signal) => {
      first = signal;
      return Promise.resolve(reply());
    });
    const { result, rerender } = renderHook(({ box }) => useTripFerratas(7, box, true), {
      initialProps: { box: BOX },
    });
    await settle();
    expect(result.current.status).toBe('ready');

    vi.mocked(ferrataRepo.list).mockReturnValueOnce(new Promise(() => {}));
    rerender({ box: OTHER });
    expect(first?.aborted).toBe(true);
    expect(result.current.status).toBe('loading');
    expect(result.current.ferratas).toEqual([FERRATA]);
  });

  it('FE-FERRATA-HOOK-005: a failed request reports an error and draws nothing', async () => {
    vi.mocked(ferrataRepo.list).mockRejectedValue(Object.assign(new Error('502'), { response: { status: 502 } }));
    const { result } = renderHook(() => useTripFerratas(7, BOX, true));
    await settle();

    expect(result.current.status).toBe('error');
    expect(result.current.ferratas).toEqual([]);
  });

  it('FE-FERRATA-HOOK-006: an area wider than the server takes asks the user to zoom in, without a request', async () => {
    const { result } = renderHook(() => useTripFerratas(7, { south: 46, west: 11, north: 47, east: 12 }, true));
    await settle();

    expect(result.current.status).toBe('tooLarge');
    expect(ferrataRepo.list).not.toHaveBeenCalled();
  });

  it('FE-FERRATA-HOOK-007: offline it says so and sends nothing', async () => {
    network(true);
    const { result } = renderHook(() => useTripFerratas(7, BOX, true));
    await settle();

    expect(result.current.status).toBe('offline');
    expect(ferrataRepo.list).not.toHaveBeenCalled();
  });

  it('FE-FERRATA-HOOK-008: switching the layer off aborts and clears, and a truncated answer is passed on', async () => {
    vi.mocked(ferrataRepo.list).mockResolvedValue(reply([FERRATA], true));
    const { result, rerender } = renderHook(({ on }) => useTripFerratas(7, BOX, on), { initialProps: { on: true } });
    await settle();
    expect(result.current.truncated).toBe(true);

    rerender({ on: false });
    expect(result.current).toEqual({ ferratas: [], status: 'idle', truncated: false, attribution: null });
    expect(renderHook(() => useTripFerratas(undefined, BOX, true)).result.current.status).toBe('idle');
    expect(renderHook(() => useTripFerratas(7, null, true)).result.current.status).toBe('idle');
  });

  it('FE-FERRATA-HOOK-009: a 400 reads as "zoom in" and is not asked again', async () => {
    vi.mocked(ferrataRepo.list).mockRejectedValue(Object.assign(new Error('400'), { response: { status: 400 } }));
    const { result } = renderHook(() => useTripFerratas(7, BOX, true));
    await settle();
    expect(result.current.status).toBe('tooLarge');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(ferrataRepo.list).toHaveBeenCalledTimes(1);
  });

  it('FE-FERRATA-HOOK-010: an outage asks again for the same area after a backoff and recovers', async () => {
    vi.mocked(ferrataRepo.list)
      .mockRejectedValueOnce(Object.assign(new Error('502'), { response: { status: 502 } }))
      .mockResolvedValueOnce(reply());
    const { result } = renderHook(() => useTripFerratas(7, BOX, true));
    await settle();
    expect(result.current.status).toBe('error');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(ferrataRepo.list).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await settle();
    expect(ferrataRepo.list).toHaveBeenCalledTimes(2);
    expect(vi.mocked(ferrataRepo.list).mock.calls[1]?.[1]).toBe('46.500,11.700,46.600,11.900');
    expect(result.current.status).toBe('ready');
    expect(result.current.ferratas).toEqual([FERRATA]);
  });
});
