import type { ExpressionSpecification, GeoJSONSource, Map, MapMouseEvent } from 'mapbox-gl';
import { useEffect, useMemo, useRef } from 'react';

import type { Ferrata } from '@trek/shared';

import { ferrataFeatureCollection } from './ferrataModel';
import { useFerrataPaint } from './useFerrataPaint';

const SOURCE = 'trek-ferratas';
const CASING = `${SOURCE}-casing`;
const LINE = `${SOURCE}-line`;
/** A wide, invisible line on top, so a thin dashed route is still easy to tap. */
const HIT = `${SOURCE}-hit`;
const LAYERS = [CASING, LINE, HIT];

/** Where on the map a ferrata was clicked, for a popup or card anchored there. */
interface FerrataClickPoint {
  lng: number;
  lat: number;
}

export type FerrataSelectHandler = (ferrata: Ferrata, at: FerrataClickPoint) => void;

type Paint = ReturnType<typeof useFerrataPaint>;

/** The line colour per difficulty band, as a GL `match` on the feature's `tone`. */
function toneColor(paint: Paint): ExpressionSpecification {
  return [
    'match',
    ['get', 'tone'],
    'easy',
    paint.tone.easy,
    'medium',
    paint.tone.medium,
    'hard',
    paint.tone.hard,
    paint.tone.unknown,
  ];
}

/**
 * The via ferrata layer on a MapLibre or Mapbox GL map: one GeoJSON source,
 * a casing, the dashed line coloured by difficulty band, and a hit line that
 * turns a click into `onSelect(ferrata, point)`.
 *
 * The layers are installed once per map and again after a style swap (a
 * basemap or theme change drops every custom layer); new ferratas only replace
 * the source's data, so a refetch after a pan does not rebuild the layers. Like
 * the hazard overlay, a draw that finds the style busy loading tiles waits for
 * `idle` rather than for a `style.load` that may never come. A theme change
 * repaints the installed layers in place instead of rebuilding them.
 */
export function useFerrataLayerGL(map: Map | null, ferratas: readonly Ferrata[], onSelect: FerrataSelectHandler) {
  const data = useMemo(() => ferrataFeatureCollection(ferratas), [ferratas]);
  const paint = useFerrataPaint();
  // The handlers read the newest props without reinstalling the layers on every render.
  const latest = useRef({ ferratas, data, onSelect, paint });
  // The paint the installed layers were last drawn in, so a mount does not repaint what it just drew.
  const painted = useRef<Paint | null>(null);
  useEffect(() => {
    latest.current = { ferratas, data, onSelect, paint };
  });

  useEffect(() => {
    if (!map) return;
    let waiting = false;
    const draw = () => {
      if (map.getSource(SOURCE)) return;
      if (!map.isStyleLoaded()) {
        if (!waiting) {
          waiting = true;
          map.once('idle', retry);
        }
        return;
      }
      const paint = latest.current.paint;
      painted.current = paint;
      const lineLayout = { 'line-cap': 'round', 'line-join': 'round' } as const;
      map.addSource(SOURCE, { type: 'geojson', data: latest.current.data });
      map.addLayer({
        id: CASING,
        type: 'line',
        source: SOURCE,
        layout: lineLayout,
        paint: { 'line-color': paint.casing, 'line-width': 6, 'line-opacity': 0.75 },
      });
      map.addLayer({
        id: LINE,
        type: 'line',
        source: SOURCE,
        layout: lineLayout,
        paint: {
          'line-color': toneColor(paint),
          'line-width': 3,
          'line-dasharray': [2, 1.5],
        },
      });
      map.addLayer({
        id: HIT,
        type: 'line',
        source: SOURCE,
        layout: lineLayout,
        paint: { 'line-color': paint.casing, 'line-width': 16, 'line-opacity': 0 },
      });
    };
    const retry = () => {
      waiting = false;
      draw();
    };
    const click = (event: MapMouseEvent) => {
      if (!map.getLayer(HIT)) return;
      const hit = map.queryRenderedFeatures(event.point, { layers: [HIT] })[0];
      const id: unknown = hit?.properties?.id;
      const ferrata = latest.current.ferratas.find((candidate) => candidate.id === id);
      if (ferrata) latest.current.onSelect(ferrata, { lng: event.lngLat.lng, lat: event.lngLat.lat });
    };
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => {
      map.getCanvas().style.cursor = '';
    };

    draw();
    map.on('style.load', draw);
    map.on('click', click);
    map.on('mouseenter', HIT, enter);
    map.on('mouseleave', HIT, leave);
    return () => {
      map.off('style.load', draw);
      map.off('idle', retry);
      map.off('click', click);
      map.off('mouseenter', HIT, enter);
      map.off('mouseleave', HIT, leave);
      for (const layer of [...LAYERS].reverse()) if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
  }, [map]);

  useEffect(() => {
    const source = map?.getSource(SOURCE) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [map, data]);

  useEffect(() => {
    if (!map || painted.current === paint || !map.getLayer(LINE)) return;
    painted.current = paint;
    if (map.getLayer(CASING)) map.setPaintProperty(CASING, 'line-color', paint.casing);
    if (map.getLayer(LINE)) map.setPaintProperty(LINE, 'line-color', toneColor(paint));
  }, [map, paint]);
}

/** The GL map the layer draws on. MapLibre's map answers the same calls the layer makes. */
export type FerrataGlMap = Map;

/**
 * Just the two calls a hit test needs, so the Mapbox and the MapLibre map both
 * fit, each with the point type of its own click events. Optional because a stand-in map (a test double, a map torn down mid
 * click) may lack them, and a hit test must then answer no rather than throw.
 */
interface HitTestMap<Point> {
  getLayer?(id: string): unknown;
  queryRenderedFeatures?(point: Point, options: { layers: string[] }): unknown[];
}

/**
 * Whether a click at `point` landed on a drawn ferrata. A map's own click
 * handler asks this first, so picking a ferrata opens its card instead of also
 * dropping a control point or a place under it.
 */
export function isFerrataHit<Point>(map: HitTestMap<Point>, point: Point): boolean {
  if (typeof map.getLayer !== 'function' || typeof map.queryRenderedFeatures !== 'function') return false;
  return !!map.getLayer(HIT) && map.queryRenderedFeatures(point, { layers: [HIT] }).length > 0;
}

const NO_FERRATAS: readonly Ferrata[] = [];
const IGNORE_SELECT: FerrataSelectHandler = () => {};

/**
 * The layer as a map view mounts it from a `FerrataMapLayer`: drawn only while
 * it is switched on, so a map with the layer off carries no source or layers.
 */
export function useFerrataMapLayerGL(
  map: Map | null,
  layer: { active: boolean; ferratas: readonly Ferrata[]; onSelect: FerrataSelectHandler } | undefined
) {
  useFerrataLayerGL(layer?.active ? map : null, layer?.ferratas ?? NO_FERRATAS, layer?.onSelect ?? IGNORE_SELECT);
}
