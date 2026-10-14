/**
 * FE-FERRATA-GL-001 to FE-FERRATA-GL-008: the via ferrata layer on a
 * MapLibre or Mapbox GL map.
 *
 * Pinned: the layers go in once per map (and wait for `idle` when tiles are
 * still loading, the failure the hazard overlay had), new data replaces the
 * source's contents instead of rebuilding the layers, a click on the hit line
 * hands the ferrata to `onSelect`, a theme change repaints the installed
 * layers in place, and an unmount leaves nothing behind.
 */
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';

import type { Ferrata } from '@trek/shared';

import FerrataLayerGL from './FerrataLayerGL';
import { useFerrataLayerGL } from './useFerrataLayerGL';

const SOURCE = 'trek-ferratas';
const LAYERS = ['trek-ferratas-casing', 'trek-ferratas-line', 'trek-ferratas-hit'];

const ferrata = (id: string, level: number | null = 2): Ferrata => ({
  id,
  name: `Ferrata ${id}`,
  grade: { raw: level === null ? null : String(level), level, plus: null },
  routeName: null,
  geometry: [
    [46.5, 11.7],
    [46.51, 11.71],
  ],
  osmUrl: `https://www.openstreetmap.org/${id}`,
});

type Handler = (event?: unknown) => void;

function fakeGlMap(styleLoaded = true) {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  const handlers = new Map<string, Set<Handler>>();
  const once = new Map<string, Set<Handler>>();
  const state = { styleLoaded, hit: null as null | { properties: { id: string } } };
  const canvas = document.createElement('canvas');
  const keyOf = (type: string, layer?: unknown) => (typeof layer === 'string' ? `${type}:${layer}` : type);
  const map = {
    isStyleLoaded: vi.fn(() => state.styleLoaded),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => {
      sources.set(id, { setData: vi.fn() });
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    getLayer: vi.fn((id: string) => (layers.has(id) ? {} : undefined)),
    addLayer: vi.fn((spec: { id: string }) => {
      layers.add(spec.id);
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
    }),
    setPaintProperty: vi.fn(),
    queryRenderedFeatures: vi.fn(() => (state.hit ? [state.hit] : [])),
    getCanvas: vi.fn(() => canvas),
    on: vi.fn((type: string, layerOrFn: unknown, fn?: Handler) => {
      const key = keyOf(type, layerOrFn);
      const set = handlers.get(key) ?? new Set<Handler>();
      set.add((fn ?? layerOrFn) as Handler);
      handlers.set(key, set);
    }),
    once: vi.fn((type: string, fn: Handler) => {
      const set = once.get(type) ?? new Set<Handler>();
      set.add(fn);
      once.set(type, set);
    }),
    off: vi.fn((type: string, layerOrFn: unknown, fn?: Handler) => {
      const target = (fn ?? layerOrFn) as Handler;
      handlers.get(keyOf(type, layerOrFn))?.delete(target);
      once.get(type)?.delete(target);
    }),
  };
  const emit = (key: string, event?: unknown) => [...(handlers.get(key) ?? [])].forEach((fn) => fn(event));
  return {
    map: map as unknown as MapboxMap,
    spies: map,
    state,
    sources,
    layers,
    canvas,
    emit,
    listeners: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
    emitIdle: () => {
      const pending = [...(once.get('idle') ?? [])];
      once.delete('idle');
      pending.forEach((fn) => fn());
    },
  };
}

const click = { point: { x: 4, y: 4 }, lngLat: { lng: 11.705, lat: 46.505 } } as unknown as MapMouseEvent;

describe('useFerrataLayerGL', () => {
  it('FE-FERRATA-GL-001: adds one source and the casing, line and hit layers, in that order', () => {
    const gl = fakeGlMap();
    renderHook(() => useFerrataLayerGL(gl.map, [ferrata('way/1')], vi.fn()));

    expect(gl.spies.addSource).toHaveBeenCalledWith(SOURCE, expect.objectContaining({ type: 'geojson' }));
    expect(gl.spies.addLayer.mock.calls.map(([spec]) => spec.id)).toEqual(LAYERS);
  });

  it('FE-FERRATA-GL-002: colours the line by difficulty band through a match on the tone', () => {
    const gl = fakeGlMap();
    renderHook(() => useFerrataLayerGL(gl.map, [ferrata('way/1')], vi.fn()));

    const line = gl.spies.addLayer.mock.calls
      .map(([spec]) => spec)
      .find((spec) => spec.id === LAYERS[1]) as unknown as {
      paint: { 'line-color': unknown[] };
    };
    expect(line.paint['line-color'].slice(0, 2)).toEqual(['match', ['get', 'tone']]);
  });

  it('FE-FERRATA-GL-003: waits for idle when the style is still loading tiles', () => {
    const gl = fakeGlMap(false);
    renderHook(() => useFerrataLayerGL(gl.map, [ferrata('way/1')], vi.fn()));
    expect(gl.spies.addSource).not.toHaveBeenCalled();

    gl.state.styleLoaded = true;
    gl.emitIdle();
    expect(gl.spies.addLayer).toHaveBeenCalledTimes(3);
  });

  it('FE-FERRATA-GL-004: new ferratas replace the source data without rebuilding the layers', () => {
    const gl = fakeGlMap();
    const { rerender } = renderHook(({ list }) => useFerrataLayerGL(gl.map, list, vi.fn()), {
      initialProps: { list: [ferrata('way/1')] },
    });
    rerender({ list: [ferrata('way/1'), ferrata('way/2', 5)] });

    expect(gl.spies.addLayer).toHaveBeenCalledTimes(3);
    const setData = gl.sources.get(SOURCE)?.setData;
    expect(setData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: [expect.anything(), expect.objectContaining({ properties: { id: 'way/2', tone: 'hard' } })],
      })
    );
  });

  it('FE-FERRATA-GL-005: a click on the hit line hands the ferrata and the point to onSelect', () => {
    const gl = fakeGlMap();
    const onSelect = vi.fn();
    const target = ferrata('way/2');
    renderHook(() => useFerrataLayerGL(gl.map, [ferrata('way/1'), target], onSelect));

    gl.state.hit = { properties: { id: 'way/2' } };
    gl.emit('click', click);
    expect(onSelect).toHaveBeenCalledWith(target, { lng: 11.705, lat: 46.505 });

    onSelect.mockClear();
    gl.state.hit = null;
    gl.emit('click', click);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('FE-FERRATA-GL-006: the pointer turns into a hand over the hit line', () => {
    const gl = fakeGlMap();
    renderHook(() => useFerrataLayerGL(gl.map, [ferrata('way/1')], vi.fn()));

    gl.emit(`mouseenter:${LAYERS[2]}`);
    expect(gl.canvas.style.cursor).toBe('pointer');
    gl.emit(`mouseleave:${LAYERS[2]}`);
    expect(gl.canvas.style.cursor).toBe('');
  });

  it('FE-FERRATA-GL-007: unmounting removes the layers, the source and every listener; no map, no work', () => {
    const gl = fakeGlMap();
    const { unmount } = render(<FerrataLayerGL map={gl.map} ferratas={[ferrata('way/1')]} onSelect={vi.fn()} />);
    unmount();

    expect(gl.layers.size).toBe(0);
    expect(gl.sources.size).toBe(0);
    expect(gl.listeners()).toBe(0);
    expect(() => renderHook(() => useFerrataLayerGL(null, [ferrata('way/1')], vi.fn()))).not.toThrow();
  });

  it('FE-FERRATA-GL-008: a theme change repaints the installed layers without rebuilding them', async () => {
    const root = document.documentElement;
    root.style.setProperty('--success', 'green');
    const gl = fakeGlMap();
    renderHook(() => useFerrataLayerGL(gl.map, [ferrata('way/1')], vi.fn()));
    expect(gl.spies.setPaintProperty).not.toHaveBeenCalled();

    await act(async () => {
      root.style.setProperty('--success', 'lime');
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(gl.spies.setPaintProperty).toHaveBeenCalledWith(LAYERS[1], 'line-color', expect.arrayContaining(['lime']))
    );
    expect(gl.spies.addLayer).toHaveBeenCalledTimes(3);
    root.style.removeProperty('--success');
  });
});
