import type { PaddleFeature, PaddleObstacleKind, RelatedObstacle } from '@trek/shared';
import { OBSTACLE_GLYPH, PADDLE_GLYPH_PATHS, paddleGlyphSvg, type PaddleGlyphKind } from './paddleGlyphPaths';

/**
 * PAD-05B: the paddle obstacles as the planner maps draw them, one model for
 * Leaflet and GL. Colours sort objects into what they are, never into safe or
 * unsafe: obstacles in slate, access rules in indigo, places to get in and out
 * in teal, portage ways in the earth brown of the planner's own portages.
 * How strongly an object shows says how it stands to the route.
 */

export type PaddleMapRelation = 'on_route' | 'near' | 'area';
type Category = 'obstacle' | 'access' | 'landing' | 'portage';

const CATEGORY: Record<PaddleObstacleKind, Category> = {
  weir: 'obstacle',
  dam: 'obstacle',
  lock: 'obstacle',
  lock_gate: 'obstacle',
  waterfall: 'obstacle',
  rapids: 'obstacle',
  hazard: 'obstacle',
  access: 'access',
  put_in: 'landing',
  egress: 'landing',
  slipway: 'landing',
  portage: 'portage',
};

export const CATEGORY_COLOR: Record<Category, string> = {
  obstacle: '#334155', // theme-lint-disable map colour
  access: '#4338ca', // theme-lint-disable map colour
  landing: '#0f766e', // theme-lint-disable map colour
  portage: '#9a6233', // theme-lint-disable map colour
};

export interface PaddleMapItem {
  feature: PaddleFeature;
  relation: PaddleMapRelation;
  color: string;
  glyph: PaddleGlyphKind;
  /** Where its marker sits: the point itself, or the middle of its line. */
  marker: [number, number];
  /** Its line or outline as [lat, lng] pairs; null for a point. */
  line: [number, number][] | null;
}

export interface PaddleMapLayer {
  items: PaddleMapItem[];
  selectedRef: string | null;
  onSelect: (ref: string) => void;
}

function lineOf(feature: PaddleFeature): [number, number][] | null {
  const { geometry } = feature;
  if (geometry.type === 'Point') return null;
  const ring = geometry.type === 'LineString' ? geometry.coordinates : (geometry.coordinates[0] ?? []);
  return ring.map(([lng, lat]) => [lat, lng]);
}

function markerOf(feature: PaddleFeature, line: [number, number][] | null): [number, number] {
  if (feature.geometry.type === 'Point') return [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
  const points = line ?? [];
  return points[Math.floor(points.length / 2)] ?? [0, 0];
}

/** The items to draw: the related ones as they stand to the route, the rest of the area quietly. */
export function paddleMapItems(features: readonly PaddleFeature[], related: readonly RelatedObstacle[]): PaddleMapItem[] {
  const relations = new Map(related.map((entry) => [entry.feature.ref, entry.relation]));
  return features.map((feature) => {
    const line = lineOf(feature);
    return {
      feature,
      relation: relations.get(feature.ref) ?? 'area',
      color: CATEGORY_COLOR[CATEGORY[feature.kind]],
      glyph: OBSTACLE_GLYPH[feature.kind],
      marker: markerOf(feature, line),
      line,
    };
  });
}

/** The marker's size in pixels by how it stands to the route; a selected one is larger still. */
export function markerSize(relation: PaddleMapRelation, selected: boolean): number {
  if (selected) return 36;
  return relation === 'on_route' ? 30 : relation === 'near' ? 26 : 22;
}

/**
 * A marker as markup: a white disc with a ring in the object's colour and its
 * glyph inside, dashed when the object is only near the route, faded when it
 * is merely in the area. It carries no user content.
 */
export function paddleMarkerHtml(item: PaddleMapItem, selected: boolean): string {
  const size = markerSize(item.relation, selected);
  const ring = selected ? 3 : 2;
  const dash = item.relation === 'near' && !selected ? 'dashed' : 'solid';
  const opacity = item.relation === 'area' && !selected ? 0.6 : 1;
  const glyph = paddleGlyphSvg(item.glyph, Math.round(size * 0.58), item.color);
  const style = `width:${size}px;height:${size}px;border-radius:9999px;background:#fff;border:${ring}px ${dash} ${item.color};box-shadow:0 1px 3px rgba(15,23,42,.35);display:grid;place-items:center;box-sizing:border-box;opacity:${opacity}`; // theme-lint-disable map marker on the map's own white
  return `<div style="${style}">${glyph}</div>`;
}

/**
 * The same marker as a standalone SVG, for the GL maps' symbol images: drawn
 * at twice its size for sharp pixels on dense screens, the ring dashed or
 * faded as the HTML marker is.
 */
export function paddleMarkerSvg(item: PaddleMapItem, selected: boolean): string {
  const size = markerSize(item.relation, selected) * 2;
  const ring = (selected ? 3 : 2) * 2;
  const r = size / 2 - ring / 2 - 2;
  const dash = item.relation === 'near' && !selected ? ' stroke-dasharray="6 5"' : '';
  const opacity = item.relation === 'area' && !selected ? 0.6 : 1;
  const glyph = Math.round(size * 0.58);
  const offset = (size - glyph) / 2;
  const paths = PADDLE_GLYPH_PATHS[item.glyph].map((d) => `<path d="${d}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" opacity="${opacity}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#fff" stroke="${item.color}" stroke-width="${ring}"${dash}/>` + // theme-lint-disable marker disc
    `<svg x="${offset}" y="${offset}" width="${glyph}" height="${glyph}" viewBox="0 0 24 24" fill="none" stroke="${item.color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></svg>`
  );
}

/** The name of a marker's image on a GL map, one per look. */
export function paddleMarkerImageId(item: PaddleMapItem, selected: boolean): string {
  return `trek-paddle-${item.glyph}-${item.color.slice(1)}-${item.relation}${selected ? '-sel' : ''}`;
}
