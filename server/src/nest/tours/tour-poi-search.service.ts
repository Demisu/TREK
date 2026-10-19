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
  // Museums and galleries alone, parks and gardens alone: the explore pill's
  // `museum` also brings theatres and cinemas, its `nature` beaches and summits.
  museum: ['museum_gallery'],
  park: ['park'],
  cafe: ['cafe'],
  restaurant: ['restaurant'],
  market: ['market'],
};

/** The most places of one kind the map search answers from each source. */
const PER_KIND_LIMIT = 30;

/** Within this many metres, two places of one name are one place mapped twice. */
const SAME_PLACE_M = 60;

type MapsPoi = Awaited<ReturnType<MapsService['poisAlong']>>['pois'][number];

function withinSamePlace(a: Pick<TourPoi, 'lat' | 'lng'>, b: { lat: number; lng: number }): boolean {
  const metresPerDegree = 111_320;
  const dLat = (a.lat - b.lat) * metresPerDegree;
  const dLng = (a.lng - b.lng) * metresPerDegree * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) <= SAME_PLACE_M;
}

function tourCategoryOf(mapsCategory: string, asked: readonly TourPoiCategory[]): TourPoiCategory | undefined {
  return asked.find((category) => MAPS_CATEGORIES[category].includes(mapsCategory));
}

/**
 * The places found, each once and within the corridor, with where they lie.
 * OpenStreetMap often maps one place twice, as a point and as its outline, and
 * the index may hold it beside OpenStreetMap: one name in one spot is one
 * place. An unnamed place (a tap, a bench) is never merged with another.
 */
function placesWithin(found: MapsPoi[], body: TourPoiSearchRequest, line: Array<[number, number]>): TourPoi[] {
  const kept = new Map<string, TourPoi>();
  const byName = new Map<string, TourPoi[]>();
  for (const poi of found) {
    const category = tourCategoryOf(poi.category, body.categories);
    const near = nearnessToLine({ lat: poi.lat, lng: poi.lng }, line);
    if (!category || !near || near.distanceM > body.corridor_m || kept.has(poi.osm_id)) continue;
    const name = poi.name.trim().toLocaleLowerCase();
    const namesakes = name ? (byName.get(name) ?? []) : [];
    if (namesakes.some((other) => withinSamePlace(other, poi))) continue;
    const place: TourPoi = {
      id: poi.osm_id,
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      category,
      kind: poi.poi_type,
      source: poi.source,
      address: poi.address,
      website: poi.website,
      phone: poi.phone,
      opening_hours: poi.opening_hours,
      distance_m: Math.round(near.distanceM),
      along_m: Math.round(near.alongM),
    };
    kept.set(poi.osm_id, place);
    if (name) byName.set(name, [...namesakes, place]);
  }
  return [...kept.values()];
}

/**
 * PLN-02: places along a tour, searched on purpose. The map search asks the
 * TREK places index in circles along the line and OpenStreetMap near it for
 * the kinds the index does not know; the places kept are those within the
 * corridor of the line itself, the nearest to it when there are more than one
 * answer carries, listed from the start. Nothing is written. A kind no source
 * could be asked for is named as unavailable, so a failed source never reads
 * as nothing found; the distance is measured straight across to the line,
 * never a way someone walked or paddled.
 */
@Injectable()
export class TourPoiSearchService {
  constructor(
    private readonly maps: MapsService,
    @InjectRepository(Tours) private readonly toursRepo: ToursRepository,
    @InjectRepository(Places) private readonly placesRepo: PlacesRepository,
  ) {}

  async search(body: TourPoiSearchRequest): Promise<TourPoiSearchResponse> {
    // The contract's tuples, spelled out as pairs once for the measures below.
    const line = body.line.map((point): [number, number] => [Number(point[0]), Number(point[1])]);
    const asked = [...new Set(body.categories.flatMap((category) => MAPS_CATEGORIES[category]))];
    const along = await this.maps.poisAlong(
      asked,
      line.map(([lat, lng]) => ({ lat, lng })),
      body.corridor_m,
      body.lang,
      PER_KIND_LIMIT,
    );
    const places = placesWithin(along.pois, body, line);
    // The nearest to the line when there are too many, then in the order the tour meets them.
    const nearest = [...places].sort((a, b) => a.distance_m - b.distance_m).slice(0, TOUR_POI_LIMIT);
    return {
      pois: nearest.sort((a, b) => a.along_m - b.along_m || a.distance_m - b.distance_m),
      truncated: along.truncated || places.length > TOUR_POI_LIMIT,
      partial: along.partial,
      capped: along.capped,
      unavailable: body.categories.filter((category) =>
        MAPS_CATEGORIES[category].every((mapsCategory) => along.failed.includes(mapsCategory)),
      ),
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
