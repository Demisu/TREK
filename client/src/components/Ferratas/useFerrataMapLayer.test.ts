/**
 * FE-FERRATA-MAPLAYER-001 to FE-FERRATA-MAPLAYER-005: the via ferrata layer as
 * one map surface holds it: off by default, the area the map reports, the card
 * a click opens.
 *
 * useTripFerratas is mocked: what it asks the server is its own suite's
 * subject. This one checks what the layer hands it (the area, and whether it
 * is on at all) and what it hands the map back.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ferrata, FerrataBbox } from '@trek/shared';

import { useFerrataMapLayer } from './useFerrataMapLayer';
import { useTripFerratas } from './useTripFerratas';

vi.mock('./useTripFerratas', () => ({ useTripFerratas: vi.fn() }));

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

const lastCall = () => vi.mocked(useTripFerratas).mock.lastCall;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useTripFerratas).mockReturnValue({
    ferratas: [FERRATA],
    status: 'ready',
    truncated: false,
    attribution: null,
  });
});

describe('useFerrataMapLayer', () => {
  it('FE-FERRATA-MAPLAYER-001: starts off, so nothing is asked for', () => {
    const { result } = renderHook(() => useFerrataMapLayer(7));
    expect(result.current.layer.active).toBe(false);
    expect(result.current.selected).toBeNull();
    expect(lastCall()).toEqual([7, null, false]);
  });

  it('FE-FERRATA-MAPLAYER-002: an area reported while off is remembered without a re-render, and used once it is on', () => {
    const { result } = renderHook(() => useFerrataMapLayer(7));
    const renders = vi.mocked(useTripFerratas).mock.calls.length;

    act(() => result.current.onViewportChange(BOX));
    expect(vi.mocked(useTripFerratas).mock.calls.length).toBe(renders);

    act(() => result.current.layer.onToggle());
    expect(result.current.layer.active).toBe(true);
    expect(lastCall()).toEqual([7, BOX, true]);
  });

  it('FE-FERRATA-MAPLAYER-003: while on, every new area reaches the request', () => {
    const { result } = renderHook(() => useFerrataMapLayer(7));
    act(() => result.current.layer.onToggle());
    act(() => result.current.onViewportChange(OTHER));
    expect(lastCall()).toEqual([7, OTHER, true]);
  });

  it('FE-FERRATA-MAPLAYER-004: a click opens the card, close shuts it, and the map gets what the request found', () => {
    const { result } = renderHook(() => useFerrataMapLayer(7));
    act(() => result.current.layer.onToggle());
    expect(result.current.layer.ferratas).toEqual([FERRATA]);
    expect(result.current.layer.status).toBe('ready');

    act(() => result.current.layer.onSelect(FERRATA, { lat: 46.52, lng: 11.8 }));
    expect(result.current.selected).toBe(FERRATA);

    act(() => result.current.close());
    expect(result.current.selected).toBeNull();
  });

  it('FE-FERRATA-MAPLAYER-005: switching the layer off closes the card and stops asking', () => {
    const { result } = renderHook(() => useFerrataMapLayer(7));
    act(() => result.current.layer.onToggle());
    act(() => result.current.layer.onSelect(FERRATA, { lat: 46.52, lng: 11.8 }));

    act(() => result.current.layer.onToggle());
    expect(result.current.layer.active).toBe(false);
    expect(result.current.selected).toBeNull();
    expect(lastCall()?.[2]).toBe(false);

    // On again, the card stays closed until the next click.
    act(() => result.current.layer.onToggle());
    expect(result.current.selected).toBeNull();
  });
});
