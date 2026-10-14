import { type Ferrata, type FerrataBbox, type FerrataGrade, ferrataBboxSpanOk } from '@trek/shared';

/**
 * The pure half of the via ferrata layer: grade wording, the difficulty band a
 * badge and a line are coloured by, the map area a request asks for, and the
 * GeoJSON the GL renderer draws. React-free, so both renderers and the detail
 * card read the same answers.
 */

/** The difficulty band a grade falls into; `unknown` when OSM gave no 0 to 6 level. */
export type FerrataTone = 'easy' | 'medium' | 'hard' | 'unknown';

/**
 * The grade as the K scale reads it: `K3`, `K4+`, `K2-`. Null when the way has
 * no numeric level (untagged, or a letter scale such as "C/D" the server keeps
 * as `raw` and does not convert).
 */
export function ferrataGradeLabel(grade: FerrataGrade): string | null {
  if (grade.level === null || grade.level === undefined) return null;
  return `K${grade.level}${grade.plus ?? ''}`;
}

/** Levels 0 to 2 are easy, 3 and 4 medium, 5 and 6 hard. */
export function ferrataGradeTone(grade: FerrataGrade): FerrataTone {
  const level = grade.level;
  if (level === null || level === undefined) return 'unknown';
  if (level <= 2) return 'easy';
  if (level <= 4) return 'medium';
  return 'hard';
}

/**
 * The line as `[lat, lng]` pairs Leaflet takes. Zod's tuple reads as "maybe two
 * numbers, maybe more" where the client compiles without strict mode, so the
 * pairs are narrowed here rather than cast; the schema has already guaranteed
 * both are numbers.
 */
export function ferrataPositions(ferrata: Pick<Ferrata, 'geometry'>): Array<[number, number]> {
  return ferrata.geometry.flatMap((pair): Array<[number, number]> =>
    typeof pair[0] === 'number' && typeof pair[1] === 'number' ? [[pair[0], pair[1]]] : []
  );
}

const OSM_ORIGIN = 'https://www.openstreetmap.org/';

/**
 * The way's page on openstreetmap.org. Built from the id the contract pins to
 * `way/<digits>` rather than taken from `osmUrl` as sent, so the link can only
 * ever point at OpenStreetMap whatever an Overpass mirror put in the answer.
 */
export function ferrataOsmUrl(ferrata: Pick<Ferrata, 'id'>): string {
  return /^way\/\d+$/.test(ferrata.id) ? `${OSM_ORIGIN}${ferrata.id}` : OSM_ORIGIN;
}

/** Three decimals is about 100 m: small pans land on the same area and do not refetch. */
const STEP = 1000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The map area rounded outwards to the request grid, so the box asked for
 * always covers the box on screen.
 */
export function roundFerrataBbox(bbox: FerrataBbox): FerrataBbox {
  return {
    south: clamp(Math.floor(bbox.south * STEP) / STEP, -90, 90),
    west: clamp(Math.floor(bbox.west * STEP) / STEP, -180, 180),
    north: clamp(Math.ceil(bbox.north * STEP) / STEP, -90, 90),
    east: clamp(Math.ceil(bbox.east * STEP) / STEP, -180, 180),
  };
}

/**
 * Whether the server takes this area: a real box no wider than
 * FERRATA_BBOX_MAX_SPAN_DEG per side. A wider one is refused with a 400, so
 * the client asks the user to zoom in instead of sending it.
 */
export function ferrataBboxFits(bbox: FerrataBbox): boolean {
  // The span check is the server's own, so a box the client sends is never refused as too large.
  return bbox.north > bbox.south && bbox.east > bbox.west && ferrataBboxSpanOk(bbox);
}

/** The `bbox` query parameter, in the south,west,north,east order the contract reads. */
export function ferrataBboxParam(bbox: FerrataBbox): string {
  return [bbox.south, bbox.west, bbox.north, bbox.east].map((edge) => edge.toFixed(3)).join(',');
}

interface FerrataFeature {
  type: 'Feature';
  properties: { id: string; tone: FerrataTone };
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
}

interface FerrataFeatureCollection {
  type: 'FeatureCollection';
  features: FerrataFeature[];
}

/**
 * The ferratas as a GeoJSON FeatureCollection for MapLibre or Mapbox GL. The
 * contract carries [lat, lng] like the rest of TREK; GeoJSON wants [lng, lat],
 * and this is the one place the layer flips it. Only the id and the tone ride
 * along: a click looks the ferrata up by id, so names never pass through the
 * map's own feature state.
 */
export function ferrataFeatureCollection(ferratas: readonly Ferrata[]): FerrataFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: ferratas.map((ferrata) => ({
      type: 'Feature' as const,
      properties: { id: ferrata.id, tone: ferrataGradeTone(ferrata.grade) },
      geometry: {
        type: 'LineString' as const,
        coordinates: ferrataPositions(ferrata).map(([lat, lng]): [number, number] => [lng, lat]),
      },
    })),
  };
}
