import {
  OPENHIKINGMAP_TILE_ATTRIBUTION,
  OPENHIKINGMAP_TILE_MAXZOOM,
  OPENHIKINGMAP_TILE_URL,
  OPENTOPOMAP_TILE_ATTRIBUTION,
  OPENTOPOMAP_TILE_MAXZOOM,
  OPENTOPOMAP_TILE_URL,
} from '../../constants/mapDefaults';

/** The raster base maps only the Tours planner offers, drawn the same way by Leaflet, GL and the 3D map. */
export type TourRasterBase = 'topo' | 'hiking';

export interface TourRasterBaseSource {
  /** The Leaflet template; `{s}` is a shard Leaflet fills in. */
  url: string;
  /** The same tiles spelled out for a GL source, which knows no shards. */
  tiles: string[];
  attribution: string;
  maxZoom: number;
}

export const TOUR_RASTER_BASES: Record<TourRasterBase, TourRasterBaseSource> = {
  topo: {
    url: OPENTOPOMAP_TILE_URL,
    tiles: ['a', 'b', 'c'].map((shard) => OPENTOPOMAP_TILE_URL.replace('{s}', shard)),
    attribution: OPENTOPOMAP_TILE_ATTRIBUTION,
    maxZoom: OPENTOPOMAP_TILE_MAXZOOM,
  },
  hiking: {
    url: OPENHIKINGMAP_TILE_URL,
    tiles: [OPENHIKINGMAP_TILE_URL],
    attribution: OPENHIKINGMAP_TILE_ATTRIBUTION,
    maxZoom: OPENHIKINGMAP_TILE_MAXZOOM,
  },
};

export const TOUR_RASTER_BASE_IDS = Object.keys(TOUR_RASTER_BASES) as TourRasterBase[];

/** The raster source of a base layer, or null for the user's own map and the imagery. */
export function tourRasterBaseOf(layer: string): TourRasterBaseSource | null {
  return layer === 'topo' || layer === 'hiking' ? TOUR_RASTER_BASES[layer] : null;
}

/**
 * Whether a best-effort tile source still answers: a run of failed tiles marks
 * it down, one tile arriving clears that. The maps report into it, the switch
 * shows it.
 */
export interface TileHealth {
  down: boolean;
  onTileError: () => void;
  onTileLoad: () => void;
}
