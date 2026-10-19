import { Places } from '../../db/entities/Places.entity';
import { Tours } from '../../db/entities/Tours.entity';
import type { PlacesRepository } from '../../db/repositories/Places.repository';
import type { ToursRepository } from '../../db/repositories/Tours.repository';
import { MapsService } from '../maps/maps.service';
import { parseRouteGeometry, thinnedLine } from './tours.helpers';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  nearnessToLine,
  plannableTourTypeSchema,
  TOUR_POI_LIMIT,
  TOUR_POI_MAX_LINE_POINTS,
  type TourPoi,
  type TourPoiCategory,
  type TourPoiSearchRequest,
  type TourPoiSearchResponse,
} from '@trek/shared';
import { corridorTiles, simplifyLine } from '@trek/shared/roadtrip';

/** The map search's own categories each Tours category asks for. */
const MAPS_CATEGORIES: Record<TourPoiCategory, readonly string[]> = {
  viewpoint: ['viewpoint'],
  peak: ['peak'],
  shelter: ['shelter'],
  drinking_water: ['drinking_water'],
  food: ['restaurant', 'cafe'],
  toilets: ['toilets'],
  picnic: ['picnic'],
  campsite: ['campsite'],
  sights: ['sights'],
  slipway: ['slipway'],
  boat_rental: ['boat_rental'],
  bike_repair: ['bike_repair'],
  museum: ['museum'],
  park: ['nature'],
  cafe: ['cafe'],
  restaurant: ['restaurant'],
  market: ['market'],
};

/**
 * How many stretches of the line one search covers, each at most about half a
 * degree, so a long tour is searched along its first stretches and the answer
 * says so. Three are asked at a time, so the public mirrors are not flooded.
 */
const MAX_TILES = 12;
const PARALLEL_TILES = 3;
/** The most places one stretch is asked for. */
const PER_TILE_LIMIT = 60;

/** Within this many metres, two places of one name are one place mapped twice. */
const SAME_PLACE_M = 60;

function sameSpot(a: Pick<TourPoi, 'name' | 'lat' | 'lng'>, b: { name: string; lat: number; lng: number }): boolean {
  if (a.name.trim().toLocaleLowerCase() !== b.name.trim().toLocaleLowerCase()) return false;
  const metresPerDegree = 111_320;
  const dLat = (a.lat - b.lat) * metresPerDegree;
  const dLng = (a.lng - b.lng) * metresPerDegree * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) <= SAME_PLACE_M;
}

function tourCategoryOf(mapsCategory: string, asked: readonly TourPoiCategory[]): TourPoiCategory | undefined {
  return asked.find((category) => MAPS_CATEGORIES[category].includes(mapsCategory));
}

/**
 * PLN-02: places along a tour, searched on purpose. The line is cut into
 * stretches as the road trip's corridor search does, each searched through
 * the map search (the TREK places index first, OpenStreetMap after), the
 * places kept that lie within the corridor of the line itself, nearest the
 * start first. Nothing is written. A stretch that fails leaves the others'
 * places and marks the answer partial; the distance is measured straight
 * across to the line, never a way someone walked or paddled.
 */
@Injectable()
export class TourPoiSearchService {
  constructor(
    private readonly maps: MapsService,
    @InjectRepository(Tours) private readonly toursRepo: ToursRepository,
    @InjectRepository(Places) private readonly placesRepo: PlacesRepository,
  ) {}

  async search(body: TourPoiSearchRequest): Promise<TourPoiSearchResponse> {
    const corridorKm = body.corridor_m / 1000;
    // The contract's tuples, spelled out as pairs once for the measures below.
    const line = body.line.map((point): [number, number] => [Number(point[0]), Number(point[1])]);
    const simplified = simplifyLine(
      line.map(([lat, lng]) => ({ lat, lng })),
      Math.max(0.05, corridorKm / 4),
    );
    const tiles = corridorTiles(simplified, corridorKm);
    const searched = tiles.slice(0, MAX_TILES);
    const asked = [...new Set(body.categories.flatMap((category) => MAPS_CATEGORIES[category]))].join(',');

    // Three stretches at a time, each batch after the last, so no more than three are ever in flight.
    const batches = Array.from({ length: Math.ceil(searched.length / PARALLEL_TILES) }, (_, index) =>
      searched.slice(index * PARALLEL_TILES, (index + 1) * PARALLEL_TILES),
    );
    const answers = await batches.reduce<
      Promise<Array<PromiseSettledResult<Awaited<ReturnType<MapsService['pois']>>>>>
    >(
      async (done, batch) => [
        ...(await done),
        ...(await Promise.allSettled(batch.map((tile) => this.maps.pois(asked, tile, body.lang, PER_TILE_LIMIT)))),
      ],
      Promise.resolve([]),
    );

    const found = new Map<string, TourPoi>();
    let truncated = false;
    for (const answer of answers) {
      if (answer.status !== 'fulfilled') continue;
      truncated ||= answer.value.truncated || answer.value.clamped;
      for (const poi of answer.value.pois) {
        const category = tourCategoryOf(poi.category, body.categories);
        const near = nearnessToLine({ lat: poi.lat, lng: poi.lng }, line);
        if (!category || !near || near.distanceM > body.corridor_m || found.has(poi.osm_id)) continue;
        // OpenStreetMap often maps one place twice, as a point and as its outline: one name in one spot is one place.
        if (poi.name && [...found.values()].some((other) => sameSpot(other, poi))) continue;
        found.set(poi.osm_id, {
          id: poi.osm_id,
          name: poi.name,
          lat: poi.lat,
          lng: poi.lng,
          category,
          kind: poi.poi_type,
          source: poi.source ?? 'openstreetmap',
          address: poi.address,
          website: poi.website,
          phone: poi.phone,
          opening_hours: poi.opening_hours,
          distance_m: Math.round(near.distanceM),
          along_m: Math.round(near.alongM),
        });
      }
    }
    const pois = [...found.values()].sort((a, b) => a.along_m - b.along_m || a.distance_m - b.distance_m);
    return {
      pois: pois.slice(0, TOUR_POI_LIMIT),
      truncated: truncated || pois.length > TOUR_POI_LIMIT,
      partial: answers.some((answer) => answer.status === 'rejected'),
      capped: tiles.length > MAX_TILES,
    };
  }

  /** The same search along a saved tour's line, for a client that has no draft (MCP). */
  async searchSavedTour(
    tripId: number,
    placeId: number,
    request: Pick<TourPoiSearchRequest, 'categories' | 'corridor_m' | 'lang'>,
  ): Promise<TourPoiSearchResponse> {
    const [tour, place] = await Promise.all([
      this.toursRepo.findInTrip(tripId, placeId),
      this.placesRepo.findInTrip(placeId, tripId),
    ]);
    const line = parseRouteGeometry(place?.route_geometry).map((point): [number, number] => [point[0], point[1]]);
    const tourType = plannableTourTypeSchema.safeParse(tour?.tour_type);
    if (!tour || line.length < 2) throw new NotFoundException('Tour not found');
    return await this.search({
      ...request,
      tour_type: tourType.success ? tourType.data : 'hike',
      line: thinnedLine(line, TOUR_POI_MAX_LINE_POINTS),
    });
  }
}
