import type { Map } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { markerSize, paddleMarkerImageId, paddleMarkerSvg, type PaddleMapItem, type PaddleMapLayer } from './paddleMapLayer';

/** One map type for both engines, as the ferrata layer has: MapLibre answers every call made here. */
export type PaddleGlMap = Map;

const SOURCE = 'trek-paddle';
const CASING = 'trek-paddle-casing';
const LINE = 'trek-paddle-line';
const PINS = 'trek-paddle-pins';
const LAYERS = [CASING, LINE, PINS];

const WIDTH = { on_route: 4, near: 3, area: 2 } as const;
const OPACITY = { on_route: 1, near: 0.85, area: 0.5 } as const;

function collection(items: readonly PaddleMapItem[], selectedRef: string | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const item of items) {
    const selected = item.feature.ref === selectedRef;
    if (item.line) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: item.line.map(([lat, lng]) => [lng, lat]) },
        properties: {
          ref: item.feature.ref,
          color: item.color,
          width: WIDTH[item.relation],
          opacity: OPACITY[item.relation],
          near: item.relation === 'near',
        },
      });
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.marker[1], item.marker[0]] },
      properties: {
        ref: item.feature.ref,
        icon: paddleMarkerImageId(item, selected),
        order: selected ? 3 : item.relation === 'on_route' ? 2 : item.relation === 'near' ? 1 : 0,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Draws each marker look the map does not have yet; a look is an image of its own. */
function addImages(map: PaddleGlMap, items: readonly PaddleMapItem[], selectedRef: string | null, gone: () => boolean) {
  for (const item of items) {
    const selected = item.feature.ref === selectedRef;
    const id = paddleMarkerImageId(item, selected);
    if (map.hasImage(id)) continue;
    const image = new Image(markerSize(item.relation, selected) * 2, markerSize(item.relation, selected) * 2);
    image.onload = () => {
      if (!gone() && !map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(paddleMarkerSvg(item, selected))}`;
  }
}

function addLayers(map: PaddleGlMap, data: GeoJSON.FeatureCollection): void {
  map.addSource(SOURCE, { type: 'geojson', data });
  const lines: ['==', ['geometry-type'], string] = ['==', ['geometry-type'], 'LineString'];
  map.addLayer({
    id: CASING,
    type: 'line',
    source: SOURCE,
    filter: lines,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff', // theme-lint-disable map casing
      'line-width': ['+', ['get', 'width'], 3],
      'line-opacity': ['get', 'opacity'],
    },
  });
  map.addLayer({
    id: LINE,
    type: 'line',
    source: SOURCE,
    filter: lines,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] },
  });
  map.addLayer({
    id: PINS,
    type: 'symbol',
    source: SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'order'],
    },
  });
}

/**
 * Whether a click at `point` landed on a paddle object. The map's own click
 * handler asks this first, so picking an obstacle opens its card instead of
 * also setting a waypoint under it.
 */
export function isPaddleHit<Point>(
  map: { getLayer?(id: string): unknown; queryRenderedFeatures?(point: Point, options: { layers: string[] }): unknown[] },
  point: Point
): boolean {
  if (typeof map.getLayer !== 'function' || typeof map.queryRenderedFeatures !== 'function') return false;
  const layers = [PINS, LINE].filter((id) => map.getLayer?.(id));
  return layers.length > 0 && map.queryRenderedFeatures(point, { layers }).length > 0;
}

/**
 * PAD-05B on a GL map (MapLibre or Mapbox, the 2D planner and the 3D
 * terrain alike): the paddle objects as lines on a white casing and as round
 * glyph markers, in the same look as on Leaflet. Kept through a basemap
 * change, which rebuilds the style and drops them, and removed with the layer.
 */
export function usePaddleLayerGL(map: PaddleGlMap | null, layer: PaddleMapLayer | undefined) {
  const onSelect = useRef(layer?.onSelect);
  useEffect(() => {
    onSelect.current = layer?.onSelect;
  }, [layer?.onSelect]);
  const items = layer?.items;
  const selectedRef = layer?.selectedRef ?? null;

  useEffect(() => {
    if (!map || !items?.length) return;
    let gone = false;
    const data = collection(items, selectedRef);
    const apply = () => {
      try {
        addImages(map, items, selectedRef, () => gone);
        const source = map.getSource(SOURCE) as { setData?: (next: GeoJSON.FeatureCollection) => void } | undefined;
        if (source?.setData) source.setData(data);
        else addLayers(map, data);
      } catch {
        // A style still loading takes the layers on its next styledata event.
      }
    };
    apply();
    map.on('styledata', apply);
    return () => {
      gone = true;
      map.off('styledata', apply);
    };
  }, [items, map, selectedRef]);

  useEffect(() => {
    if (!map) return;
    const click = (event: { features?: Array<{ properties?: { ref?: unknown } }> }) => {
      const ref = event.features?.[0]?.properties?.ref;
      if (typeof ref === 'string') onSelect.current?.(ref);
    };
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => {
      map.getCanvas().style.cursor = '';
    };
    for (const id of [PINS, LINE]) {
      map.on('click', id, click);
      map.on('mouseenter', id, enter);
      map.on('mouseleave', id, leave);
    }
    return () => {
      for (const id of [PINS, LINE]) {
        map.off('click', id, click);
        map.off('mouseenter', id, enter);
        map.off('mouseleave', id, leave);
      }
    };
  }, [map]);

  // Without objects to show, the layers go; the next objects bring them back.
  useEffect(() => {
    if (!map || items?.length) return;
    try {
      for (const id of [...LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    } catch {
      // A map torn down meanwhile has nothing left to remove.
    }
  }, [items, map]);
}
