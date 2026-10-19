import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePolyline } from '../../../../tests/helpers/polyline';
import { OnlineOnlyError } from '../../../repo/onlineOnly';
import { useTourRouteHighlightStore } from '../../../store/tourRouteHighlightStore';
import { useRouteWays } from './useRouteWays';

const trace = vi.hoisted(() => ({ valhallaTraceAttributes: vi.fn() }));
const gradesRepo = vi.hoisted(() => ({ grades: vi.fn() }));
const network = vi.hoisted(() => ({ offline: false }));
vi.mock('../../Map/valhallaRoute', () => trace);
vi.mock('../../../repo/tourTrailGradeRepo', () => ({ tourTrailGradeRepo: gradesRepo }));
vi.mock('../../../hooks/useNetworkMode', () => ({ useNetworkMode: () => ({ offline: network.offline }) }));

// FE-TOUR-WAYS-HOOK-001 to FE-TOUR-WAYS-HOOK-008

const ROUTE: [number, number][] = [
  [47.0, 11.0],
  [47.002, 11.0],
  [47.004, 11.0],
];
const ANSWER = {
  shape: encodePolyline(ROUTE, 6),
  edges: [
    { begin_shape_index: 0, end_shape_index: 1, length: 0.2, surface: 'gravel', use: 'track', way_id: 11 },
    { begin_shape_index: 1, end_shape_index: 2, length: 0.2, surface: 'dirt', use: 'path', way_id: 12 },
  ],
};

type Input = Parameters<typeof useRouteWays>[0];
const input = (overrides: Partial<Input> = {}): Input => ({
  tripId: 3,
  active: true,
  route: ROUTE,
  profile: 'touring',
  ...overrides,
});

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  network.offline = false;
  trace.valhallaTraceAttributes.mockReset().mockResolvedValue(ANSWER);
  gradesRepo.grades.mockReset();
});

afterEach(() => vi.useRealTimers());

describe('useRouteWays (BIK-01 to BIK-05)', () => {
  it('FE-TOUR-WAYS-HOOK-001: asks nothing while inactive or without a route of two points', () => {
    for (const overrides of [{ active: false }, { route: null }, { route: ROUTE.slice(0, 1) }]) {
      const { result } = renderHook(() => useRouteWays(input(overrides)));
      expect(result.current.status).toBe('idle');
    }
    expect(trace.valhallaTraceAttributes).not.toHaveBeenCalled();
  });

  it('FE-TOUR-WAYS-HOOK-002: waits for the route to settle, then reads its ways, without grades for a touring bike', async () => {
    const { result } = renderHook(() => useRouteWays(input()));
    expect(result.current.status).toBe('loading');
    expect(trace.valhallaTraceAttributes).not.toHaveBeenCalled();
    await settle();
    expect(trace.valhallaTraceAttributes).toHaveBeenCalledWith(ROUTE, expect.any(AbortSignal));
    expect(result.current.status).toBe('ready');
    expect(result.current.ways?.edges.map((edge) => edge.surface)).toEqual(['gravel', 'ground']);
    expect(result.current.grades).toBeNull();
    expect(gradesRepo.grades).not.toHaveBeenCalled();
  });

  it('FE-TOUR-WAYS-HOOK-003: a mountain bike tour asks the grades of its ways, and keeps what could not be asked apart', async () => {
    gradesRepo.grades.mockResolvedValue({
      ways: [{ id: 11, mtb_scale: '2', mtb_scale_uphill: null, mtb_scale_imba: null }],
      unanswered: [12],
    });
    const { result } = renderHook(() => useRouteWays(input({ profile: 'mtb' })));
    await settle();
    expect(gradesRepo.grades).toHaveBeenCalledWith(3, { way_ids: [11, 12] }, expect.any(AbortSignal));
    expect(result.current.grades?.status).toBe('ready');
    expect(result.current.grades?.byWay.get(11)?.mtb_scale).toBe('2');
    expect([...(result.current.grades?.unasked ?? [])]).toEqual([12]);
  });

  it('FE-TOUR-WAYS-HOOK-004: grades that cannot be had say why: offline, or failed', async () => {
    gradesRepo.grades.mockRejectedValueOnce(new OnlineOnlyError());
    const offline = renderHook(() => useRouteWays(input({ profile: 'mtb' })));
    await settle();
    expect(offline.result.current.status).toBe('ready');
    expect(offline.result.current.grades?.status).toBe('offline');
    offline.unmount();

    gradesRepo.grades.mockRejectedValueOnce(new Error('overpass'));
    const failed = renderHook(() => useRouteWays(input({ profile: 'mtb' })));
    await settle();
    expect(failed.result.current.grades?.status).toBe('failed');
  });

  it('FE-TOUR-WAYS-HOOK-005: a route the router cannot describe fails, and retry asks again', async () => {
    trace.valhallaTraceAttributes.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useRouteWays(input()));
    await settle();
    expect(result.current.status).toBe('failed');
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await settle();
    expect(trace.valhallaTraceAttributes).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
  });

  it('FE-TOUR-WAYS-HOOK-006: an error on the way fails rather than leaving the card waiting', async () => {
    trace.valhallaTraceAttributes.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useRouteWays(input()));
    await settle();
    expect(result.current.status).toBe('failed');
  });

  it('FE-TOUR-WAYS-HOOK-007: offline it says so and asks nothing', async () => {
    network.offline = true;
    const { result } = renderHook(() => useRouteWays(input()));
    await settle();
    expect(result.current.status).toBe('offline');
    expect(trace.valhallaTraceAttributes).not.toHaveBeenCalled();
  });

  it('FE-TOUR-WAYS-HOOK-008: a new route drops the highlight and the old answer, and leaving takes the highlight down', async () => {
    const { result, rerender, unmount } = renderHook((props: Input) => useRouteWays(props), { initialProps: input() });
    await settle();
    expect(result.current.status).toBe('ready');
    useTourRouteHighlightStore.getState().show({ id: 'surface-gravel', lines: [ROUTE], paint: 'gravel' });
    rerender(input({ route: [...ROUTE, [47.006, 11.0]] }));
    expect(useTourRouteHighlightStore.getState().highlight).toBeNull();
    expect(result.current.status).toBe('loading');
    useTourRouteHighlightStore.getState().show({ id: 'surface-gravel', lines: [ROUTE], paint: 'gravel' });
    unmount();
    expect(useTourRouteHighlightStore.getState().highlight).toBeNull();
  });
});
