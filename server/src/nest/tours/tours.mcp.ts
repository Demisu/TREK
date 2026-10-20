import { ADDON_IDS } from '../../addons';
import type { TourDayRow } from '../../db/repositories/Tours.repository';
import { noAccess } from '../../mcp/tools/_shared';
import { McpController, Tool, TOOL_ANNOTATIONS_READONLY, errorResult, ok, type McpContext } from '../../nest-mcp';
import { addonGate } from '../addons/addon-gate';
import { AddonsService } from '../addons/addons.service';
import { TripAccessService } from '../trip-membership/trip-access.service';
import { TourGpxExportService } from './tour-gpx-export.service';
import { TourPoiSearchService } from './tour-poi-search.service';
import { TourVisitsService } from './tour-visits.service';
import { ToursService } from './tours.service';
import { NotFoundException } from '@nestjs/common';
import {
  idSchema,
  tourPoiSearchRequestSchema,
  walkStationsOf,
  type TourListItem,
  type TourPoiSearchRequest,
  type TourWaypoint,
} from '@trek/shared';

type TourDay = Pick<TourDayRow, 'day_id' | 'day_number' | 'date' | 'title'>;

const poiFields = tourPoiSearchRequestSchema.shape;

/**
 * CW-10: a station of a city walk with every field it has spelled out, so an
 * assistant reads a stay nobody entered as null and never as missing: null
 * for an unknown stay, a normal importance and no known hours, false for an
 * unprotected station. REST answers the stored fields as they are.
 */
function spelledOut<T extends TourWaypoint>(station: T) {
  return {
    ...station,
    key: station.key ?? null,
    name: station.name ?? null,
    stay_minutes: station.stay_minutes ?? null,
    importance: station.importance ?? null,
    protected: station.protected === true,
    opening_hours: station.opening_hours ?? null,
  };
}

/** The points of a tour as get_tour_plan answers them: a city walk's stations spelled out, every other point as stored. */
function planPoints<T extends TourWaypoint>(tourType: string, points: T[]) {
  const stations = new Set<T>(tourType === 'walk' ? walkStationsOf(points) : []);
  return points.map((point) => (stations.has(point) ? spelledOut(point) : point));
}

/** A tour as a client reads it: its list facts and the days of the trip it is on. */
function withDays(tour: TourListItem, days: ReadonlyMap<number, TourDay[]>) {
  return { ...tour, days: days.get(tour.place_id) ?? [] };
}

/**
 * P2D-MCP-01: the saved tours of a trip, read only. A tool reads what the
 * tours list and the tour detail answer over REST, through the same service,
 * so a client sees the same facts the app shows: the tours of a trip, one
 * tour's plan (its control points, measures and provenance; the full line
 * stays out, it runs to thousands of points), and the tours of one day.
 * Nothing here writes. Drafts in a browser are never visible here: only
 * saved tours exist on the server.
 */
@McpController()
export class ToursMcp {
  constructor(
    private readonly tours: ToursService,
    private readonly access: TripAccessService,
    private readonly gpxExport: TourGpxExportService,
    private readonly poiSearch: TourPoiSearchService,
    private readonly visits: TourVisitsService,
    // Read by the addon gate of every tool here.
    readonly addons: AddonsService,
  ) {}

  /** Each tour of the trip with the days it is on, each day once, in day order. */
  private async daysByTour(tripId: number): Promise<Map<number, TourDay[]>> {
    const byTour = new Map<number, TourDay[]>();
    for (const { place_id, ...day } of await this.tours.listTourDays(tripId)) {
      byTour.set(place_id, [...(byTour.get(place_id) ?? []), day]);
    }
    return byTour;
  }

  @Tool({
    name: 'list_tours',
    description:
      'List the saved tours of a trip (hikes, city walks, runs, bike tours and paddle tours planned or imported in the Tours addon): name, type (hike, walk for a city walk, run, bike, or kayak for a paddle tour), where it came from (origin: trek, gpx or wanderer), distance in km, ascent and descent in metres, the stored routing limit of a hike (max_hiking_difficulty, SAC T1 to T6) and its route choices (hiking_preferences: avoid_climbs for gentler ways, avoid_steps, avoid_ferries; weightings, never a grade of the path), the profile a bike tour is routed for (bike_profile: touring for paved cycle paths and quiet roads, road for asphalt, gravel for gravel and farm tracks, mtb for rough tracks; a routing preference, never a statement that a way is rideable or safe), the winter label of a hike (winter_activity: winter_hike or snowshoe, null for none; a label the travellers chose, while the route and its time are planned as for any hike, never a statement that a way can be walked in winter or anything about snow or avalanches), the profile and pace of a run (run_profile: running for runnable, mostly paved ways in towns and parks, trail for forest tracks and natural paths up to mountain paths (T2); a routing preference, never a statement that a way can be run; run_pace_seconds_per_km, the pace the runners planned with, null while they entered none; its duration is the distance at that pace and nothing else, no climb, descent or difficulty is in it, and it is a plan, never a recorded time), the boat, water and chosen speed of a paddle tour (boat_type, water_context, paddle_speed_kmh in km/h, null while the suggested speed of the boat applies), the check bench of a paddle tour (paddle_check: how far the OpenStreetMap obstacle data covers its line and how many obstacles are open, to check again or decided by the travellers; a planning status, never a safety or legal clearance), for a city walk the number of its stations (station_count: its points without the shaping points and the way back of a loop), their stays as far as entered (station_stay_minutes) and how many have none (station_stays_unknown), whether a tour still waits for its way to be planned (route_pending: saved with its points only, so its distance and walking time stay null until someone opens it in the planner and saves it), the revision (raised by every saved change of the tour), and the days of the trip each tour is on.',
    inputSchema: { tripId: idSchema },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async listTours({ tripId }: { tripId: number }, ctx: McpContext) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    const [tours, days] = await Promise.all([this.tours.listTours(String(tripId)), this.daysByTour(tripId)]);
    return ok({ tours: tours.map((tour) => withDays(tour, days)) });
  }

  @Tool({
    name: 'get_tour_plan',
    description:
      'Read one saved tour of a trip: its facts, its ordered control points (start, via and end; an import without its own shows the two ends of its track), where it came from (provenance) and the days it is on. A control point with linked_place_id stands for that place of the trip (linked_place_name names it); it keeps its own coordinates. A control point whose fixed_leg is set leads to the next one along a line the router did not plan: kind ferrata follows a via ferrata, kind free is drawn by hand and was checked by nothing. A paddle tour also carries its obstacle checklist (obstacle_check): the obstacles of the OpenStreetMap data along its line, the decisions the travellers made about them and their own portages and locks; a planning aid, never a safety or legal clearance. A city walk (tour_type walk) has stations for control points, shaping points and the way back of a loop aside, each with every field spelled out: key (its own id, the same across saves; the visits of a day are kept by it), name, stay_minutes (the stay in minutes; 0 for a point only passed through, null when not known), importance (optional or must; null for a normal station), protected (true for a station any change you propose has to keep where it is: neither removed, replaced nor moved; the travellers can still edit it themselves in the app) and opening_hours (as OpenStreetMap writes them; a hint to check, never a promise; null when none is known). How far a walk got on a day is get_city_walk_progress. The full track geometry is not included.',
    inputSchema: { tripId: idSchema, placeId: idSchema.describe('The place id of the tour, as list_tours gives it') },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async getTourPlan({ tripId, placeId }: { tripId: number; placeId: number }, ctx: McpContext) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    try {
      const [detail, days] = await Promise.all([
        this.tours.getTour(String(tripId), String(placeId)),
        this.daysByTour(tripId),
      ]);
      // A point standing for a place of the trip (PR1-10) says which, by name.
      const names = await this.tours.linkedPlaceNames(tripId, detail.waypoints);
      const named = detail.waypoints.map((point) =>
        point.linked_place_id ? { ...point, linked_place_name: names.get(point.linked_place_id) ?? null } : point,
      );
      const waypoints = planPoints(detail.tour.tour_type, named);
      return ok({ ...detail, waypoints, tour: withDays(detail.tour, days) });
    } catch (err: unknown) {
      if (err instanceof NotFoundException) return errorResult('Tour not found.');
      throw err;
    }
  }

  @Tool({
    name: 'get_city_walk_progress',
    description:
      'Read how far a city walk (tour_type walk) got on one day it is on: every station in order with its key (its own id, as get_tour_plan gives it), its status that day (planned, visited or skipped, as the travellers checked them off in the day plan), its importance (normal, optional, must; get_tour_plan says null for normal), whether it is protected (a station a proposed change must leave where it is, neither removed, replaced nor moved), its stay in minutes (null when not known, 0 for a point passed through), its opening hours as OpenStreetMap writes them (null when none is known) and its linked place. "open" sums what is still planned: the stations, their known stays and how many stays are unknown; walking_minutes is the walking time of the whole walk. Visits belong to that day only: the same walk on another day, or a copy, has none. Anything the traveller tells you besides (for instance "continue from 2 pm") is theirs to say, not stored here. Reading changes nothing.',
    inputSchema: {
      tripId: idSchema,
      placeId: idSchema.describe('The place id of the city walk, as list_tours gives it'),
      dayId: idSchema.describe('The day the walk is on, as find_tours_for_day gives it'),
    },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async getCityWalkProgress(
    { tripId, placeId, dayId }: { tripId: number; placeId: number; dayId: number },
    ctx: McpContext,
  ) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    try {
      return ok(await this.visits.progress(tripId, placeId, dayId));
    } catch (err: unknown) {
      if (err instanceof NotFoundException) return errorResult('No city walk of this trip is on that day.');
      throw err;
    }
  }

  @Tool({
    name: 'find_tours_for_day',
    description: 'List the saved tours put on one day of a trip, with the same facts as list_tours.',
    inputSchema: { tripId: idSchema, dayId: idSchema },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async findToursForDay({ tripId, dayId }: { tripId: number; dayId: number }, ctx: McpContext) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    const [tours, days] = await Promise.all([this.tours.listTours(String(tripId)), this.daysByTour(tripId)]);
    const onDay = tours.filter((tour) => (days.get(tour.place_id) ?? []).some((day) => day.day_id === dayId));
    return ok({ tours: onDay.map((tour) => withDays(tour, days)) });
  }

  @Tool({
    name: 'export_tour_gpx',
    description:
      'Export one saved tour of a trip as a GPX 1.1 document: its whole saved line as one track, with the heights it carries and none it lacks. Returns the GPX text and a file name. A tour without a line of at least two points cannot be exported. Nothing about the tour changes.',
    inputSchema: { tripId: idSchema, placeId: idSchema.describe('The place id of the tour, as list_tours gives it') },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async exportTourGpx({ tripId, placeId }: { tripId: number; placeId: number }, ctx: McpContext) {
    // A read, like the REST route: seeing the trip is enough.
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    try {
      return ok(await this.gpxExport.export(String(tripId), String(placeId)));
    } catch (err: unknown) {
      if (err instanceof NotFoundException) return errorResult('Tour not found.');
      throw err;
    }
  }

  @Tool({
    name: 'search_tour_pois',
    description:
      'Search places along the saved line of a tour: what a hike, a run, a bike tour, a paddle tour or a city walk stops for (viewpoint, peak, shelter, drinking_water, food, toilets, picnic, campsite, sights, slipway, boat_rental, bike_repair for repair stations and bike shops, and for a city walk museum for museums and galleries, park for parks and gardens, cafe, restaurant and market), within corridor_m metres of the line. Answers each place with its source (TREK places index or OpenStreetMap), kind, address, website and phone where known, opening hours as the source has them (a hint to check, never a promise), distance_m (straight across to the line, not a detour) and along_m (from the start along the line); up to 60, the nearest to the line when more match, listed from the start. When sights are asked for, the best known places near the line (by the page views of their Wikidata item) are searched too: a square or landmark no category names is added as a sight, and the highlights among them carry highlight: true and come first, the best known first. A place OpenStreetMap has no name for (a tap, a bench) comes with an empty name. unavailable lists the categories no source could be searched for right now: their places are missing, not absent, so ask again later rather than reporting none. partial says some stretches could not be searched, capped that only the first part of a long line was, truncated that more places matched. A tour saved with its points only (route_pending) has no line to search along yet. Nothing is added to the tour or the trip.',
    inputSchema: {
      tripId: idSchema,
      placeId: idSchema.describe('The place id of the tour, as list_tours gives it'),
      categories: poiFields.categories,
      corridor_m: poiFields.corridor_m,
      lang: poiFields.lang,
    },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async searchTourPois(
    {
      tripId,
      placeId,
      ...request
    }: { tripId: number; placeId: number } & Pick<TourPoiSearchRequest, 'categories' | 'corridor_m' | 'lang'>,
    ctx: McpContext,
  ) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    try {
      return ok(await this.poiSearch.searchSavedTour(tripId, placeId, request));
    } catch (err: unknown) {
      if (err instanceof NotFoundException) return errorResult('Tour not found.');
      throw err;
    }
  }
}
