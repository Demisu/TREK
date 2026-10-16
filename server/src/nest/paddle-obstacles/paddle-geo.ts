import type { Box } from '../../db/repositories/PaddleFeatures.repository';
import {
  PADDLE_OBSTACLES_MAX_SPAN_DEG,
  type PaddleCoverageState,
  type PaddleRegionBoundary as RegionBoundary,
} from '@trek/shared';

export type { RegionBoundary };

/** `south,west,north,east` as a box, or null when it is not one or wider than a request may ask. */
export function parseBox(text: string): Box | null {
  const [south, west, north, east] = text.split(',').map(Number);
  if ([south, west, north, east].some((value) => value === undefined || !Number.isFinite(value))) return null;
  const box = { south: south as number, west: west as number, north: north as number, east: east as number };
  if (box.south > box.north || box.west > box.east) return null;
  if (Math.abs(box.south) > 90 || Math.abs(box.north) > 90 || Math.abs(box.west) > 180 || Math.abs(box.east) > 180)
    return null;
  if (box.north - box.south > PADDLE_OBSTACLES_MAX_SPAN_DEG || box.east - box.west > PADDLE_OBSTACLES_MAX_SPAN_DEG)
    return null;
  return box;
}

/** Read as plain values: this workspace compiles without strict mode, where the schema's tuples are "maybe two". */
function inRing(points: ReadonlyArray<ReadonlyArray<unknown>>, lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = Number(points[i]?.[0]);
    const yi = Number(points[i]?.[1]);
    const xj = Number(points[j]?.[0]);
    const yj = Number(points[j]?.[1]);
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether a point lies inside a region's boundary: in an outer ring and in none of its holes. */
export function boundaryContains(boundary: RegionBoundary, lat: number, lng: number): boolean {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;
  return polygons.some(
    ([outer, ...holes]) => !!outer && inRing(outer, lat, lng) && !holes.some((hole) => inRing(hole, lat, lng)),
  );
}

/** The points a box is checked at: its corners and its middle. */
function samplesOf(box: Box): Array<[number, number]> {
  const midLat = (box.south + box.north) / 2;
  const midLng = (box.west + box.east) / 2;
  return [
    [box.south, box.west],
    [box.south, box.east],
    [box.north, box.west],
    [box.north, box.east],
    [midLat, midLng],
  ];
}

/**
 * How far TREK's data reaches over a box whose area some region's box
 * reaches into: covered when every sample point lies inside a region's
 * boundary, partial otherwise; without such a region, none. A region whose
 * boundary is unknown counts by its box alone.
 */
export function coverageOf(box: Box, boundaries: ReadonlyArray<RegionBoundary | null>): PaddleCoverageState {
  if (boundaries.length === 0) return 'none';
  const inside = samplesOf(box).map(([lat, lng]) =>
    boundaries.some((boundary) => boundary === null || boundaryContains(boundary, lat, lng)),
  );
  // A region's box reaching in without any sample inside its boundary still touches the area at an edge.
  return inside.every(Boolean) ? 'covered' : 'partial';
}

/** The box around a boundary, for the region's row. */
export function boxOfBoundary(boundary: RegionBoundary): Box {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates;
  const box = { south: 90, west: 180, north: -90, east: -180 };
  for (const polygon of polygons) {
    for (const point of polygon[0] ?? []) {
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      box.south = Math.min(box.south, lat);
      box.north = Math.max(box.north, lat);
      box.west = Math.min(box.west, lng);
      box.east = Math.max(box.east, lng);
    }
  }
  return box;
}
