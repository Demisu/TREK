import { ADDON_IDS } from '../../addons';
import type { TourDayRow } from '../../db/repositories/Tours.repository';
import { noAccess } from '../../mcp/tools/_shared';
import { McpController, Tool, TOOL_ANNOTATIONS_READONLY, errorResult, ok, type McpContext } from '../../nest-mcp';
import { addonGate } from '../addons/addon-gate';
import { AddonsService } from '../addons/addons.service';
import { TripAccessService } from '../trip-membership/trip-access.service';
import { withoutLine } from './tour-activities.helpers';
import { TourGpxExportService } from './tour-gpx-export.service';
import { derivedFields, planLegs, planLine, planPoints, planRun } from './tour-plan-read';
import { TourPoiSearchService } from './tour-poi-search.service';
import { TourVisitsService, type WalkProgress } from './tour-visits.service';
import type { GeometryPoint } from './tours.helpers';
import { ToursService } from './tours.service';
import { NotFoundException } from '@nestjs/common';
import {
  idSchema,
  tourPoiSearchRequestSchema,
  type TourDetailResponse,
  type TourListItem,
  type TourPoiSearchRequest,
} from '@trek/shared';

type TourDay = Pick<TourDayRow, 'day_id' | 'day_number' | 'date' | 'title' | 'tour_stage_key'>;

const poiFields = tourPoiSearchRequestSchema.shape;

/** A tour as a client reads it: its list facts and the days of the trip it is on. */
function withDays(tour: TourListItem, days: ReadonlyMap<number, TourDay[]>) {
  return { ...tour, days: days.get(tour.place_id) ?? [] };
}

/** What get_tour_plan reads of one saved tour, before a day's visits are added. */
interface PlanRead {
  detail: TourDetailResponse;
  days: ReadonlyMap<number, TourDay[]>;
  line: GeometryPoint[];
  /** The names of the places of the trip its control points stand for (PR1-10). */
  names: ReadonlyMap<number, string>;
}

/**
 * MCP-T01: the plan of one saved tour as an assistant reads it: the detail the
 * app reads, its days, the legs between its control points, its saved line in
 * brief, the recorded tracks assigned to it (ACT-01), for a city walk the
 * visits of the day asked for, and the fields that were worked out on reading
 * rather than stored.
 */
function planOf({ detail, days, line, names }: PlanRead, run: WalkProgress | null) {
  const named = detail.waypoints.map((point) =>
    point.linked_place_id ? { ...point, linked_place_name: names.get(point.linked_place_id) ?? null } : point,
  );
  const saved = planLine(line);
  // A tour that stores no control points answers the two ends of its line instead.
  const recorded = detail.tour.has_waypoints !== true;
  const controlsFromTrack = recorded && detail.waypoints.length > 0;
  const isWalk = detail.tour.tour_type === 'walk';
  return {
    ...detail,
    tour: withDays(detail.tour, days),
    waypoints: planPoints(detail.tour.tour_type, named, run),
    // ACT-01: the recorded tracks assigned to the tour, with their values and without their lines.
    activities: (detail.activities ?? []).map(withoutLine),
    // SKI-02: a ski tour saved before the piste router, or with none of its legs planned by it, was drawn straight.
    legs: planLegs(detail.waypoints, {
      recorded,
      drawn: detail.tour.tour_type === 'ski' && !detail.tour.ski_route_build,
    }),
    line: saved,
    ...(isWalk ? { run: run ? planRun(run) : null } : {}),
    derived: derivedFields(detail, { controlsFromTrack, line: saved, run }),
  };
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
      'List the saved tours of a trip (hikes, city walks, runs, bike tours, paddle tours, rides on horseback and ski and winter tours planned or imported in the Tours addon): name, type (hike, walk for a city walk, run, bike, kayak for a paddle tour, horse for a ride, or ski for a ski and winter tour; a ride has no time worked out, so its duration is null), where it came from (origin: trek, gpx for an imported GPX, KML or KMZ file, or wanderer), distance in km, ascent and descent in metres, the stored routing limit of a hike (max_hiking_difficulty, SAC T1 to T6) and its route choices (hiking_preferences: avoid_climbs for gentler ways, avoid_steps, avoid_ferries; weightings, never a grade of the path), the profile a bike tour is routed for (bike_profile: touring for paved cycle paths and quiet roads, road for asphalt, gravel for gravel and farm tracks, mtb for rough tracks; a routing preference, never a statement that a way is rideable or safe), the profile and pace of a run (run_profile: running for runnable, mostly paved ways in towns and parks, trail for forest tracks and natural paths up to mountain paths (T2); a routing preference, never a statement that a way can be run; run_pace_seconds_per_km, the pace the runners planned with, null while they entered none; its duration is the distance at that pace and nothing else, no climb, descent or difficulty is in it, and it is a plan, never a recorded time), the discipline of a ski tour (ski_discipline: alpine, snowboard, cross_country, touring for ski touring, snowshoe or winter_hike; snowshoeing and winter hiking are ski tours, a hike is summer only; ski_technique for cross-country only: classic, skating or unknown when the travellers did not know; a planned ski tour has its legs planned by the piste router along the runs, lifts and trails of OpenStreetMap where that data reaches (ski_options: the router options it was planned with, ski_route_build: the piste data build) and drawn straight elsewhere, an imported one is kept as recorded; its duration is the estimate of the router only when every leg was planned by it, else null, and nothing in it says anything about snow, avalanches or whether a run or trail is open), the boat, water and chosen speed of a paddle tour (boat_type, water_context, paddle_speed_kmh in km/h, null while the suggested speed of the boat applies), the check bench of a paddle tour (paddle_check: how far the OpenStreetMap obstacle data covers its line and how many obstacles are open, to check again or decided by the travellers; a planning status, never a safety or legal clearance), for a city walk the number of its stations (station_count: its points without the shaping points and the way back of a loop), their stays as far as entered (station_stay_minutes) and how many have none (station_stays_unknown), whether a tour still waits for its way to be planned (route_pending: saved with its points only, so its distance and walking time stay null until someone opens it in the planner and saves it), for a multi-day tour the number of stages its route is split into (stage_count: one route planned whole, each stage ending at a stop marked as its end; null for a tour of one day) and the stops they run between (stage_stops, in route order with key and coordinates: stage n runs from stop n-1 to stop n, and is known by the key of the stop it starts at), the revision (raised by every saved change of the tour), the recorded tracks assigned to a tour (activity_tracks) and, for a recorded track, the tour it documents (activity_of), when an imported track was recorded (track_started_at, track_ended_at; null when the file carried no times), the time a tour without a planned time (an import) is estimated to take (time_estimate: minutes and basis, din33466 for a hike by the hiking signpost rule DIN 33466 from its distance, ascent and descent, run_pace for a run at the pace entered; worked out on reading and without breaks, never a recorded or planned time; minutes null when the track has no heights, and time_estimate null where nothing estimates it, a tour the planner timed among them, whose duration is its time), and the days of the trip each tour is on (tour_stage_key names the stage a day holds by its starting stop, null where the day holds the whole tour; a stage may also be on no day yet).',
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
      'Read one saved tour of a trip as the travellers saved it: its facts (tour: place_id, name, tour_type, distance, heights and walking time as stored, null when not known; the routing options as list_tours describes them; revision, raised by every saved change; the days it is on), its ordered control points (start, via and end, each with its sequence and its key, the same across saves; an import without its own shows the two ends of its track), where it came from (provenance) and its legs. Drafts in a browser are never visible: only saved tours exist here, and reading changes nothing, not the tour, its revision nor any visit. A control point with linked_place_id stands for that place of the trip (linked_place_name names it); it keeps its own coordinates. A control point with stage_end true ends a stage of a multi-day tour, and the next stage begins there; the stages run in the order of the route, the first from the start, the last to the end, and a tour without such a point is a tour of one day. legs lists every step from one control point to the next (from_sequence, to_sequence, from_key, to_key) with its kind: routed (planned by the router), track (part of a recorded line, an import without control points of its own, which no router planned), ferrata (follows a via ferrata, name gives it), free (drawn by hand and checked by nothing; every leg of a planned ski tour is free, a straight line between its points), portage (a paddle tour carried over land) or horse_route (a ride only: a section of a signposted horse route from OpenStreetMap in the direction the rider chose; the fixed_leg of its control point says signposted, with or against the direction the route is signposted in, null where it is not signposted one way, and access, the metres of each horse=* value its ways carried when it was taken, unknown where untagged; being on a horse route is no permission to ride it); length_km is the length of the line a fixed leg keeps (for the leg of a ski tour the straight line) and null for a routed or track leg, whose length is not stored apart. line gives the saved line in brief: point_count, has_heights and a preview thinned to 200 points; null while the tour waits for its way to be planned. A paddle tour also carries its obstacle checklist (obstacle_check): the obstacles of the OpenStreetMap data along its line, the decisions the travellers made about them and their own portages and locks; a planning aid, never a safety or legal clearance. A city walk (tour_type walk) has stations for control points, shaping points and the way back of a loop aside, each with every field spelled out: key (the visits of a day are kept by it), name, stay_minutes (the stay in minutes; 0 for a point only passed through, null when not known), importance (optional or must; null for a normal station), protected (true for a station any change you propose has to keep where it is: neither removed, replaced nor moved; the travellers can still edit it themselves in the app), opening_hours (as OpenStreetMap writes them; a hint to check, never a promise; null when none is known) and visit_status. Visits belong to one day of the walk: name that day with dayId (one of its days) to read the status of each station that day (planned, visited or skipped) and run (the day, its assignment and what is still open); without dayId visit_status and run are null. A station visited or skipped that day is done: do not ask about it again or move it to another day. dayId is for a city walk only. The recorded tracks assigned to the tour (activities, ACT-01) each name their execution (assignment_id and day_id, null for none), the recording (track: its tour in the trip, origin, file name, when it came in) and what the recording measures (metrics: distance_km, elevation_gain_m and elevation_loss_m, null without heights; started_at, ended_at and elapsed_minutes from the first to the last time on its points, pauses included, null when the file carried no times, never estimated); these are the values of the recording, the planned values of the tour stay apart and unchanged. derived names the fields worked out on reading rather than stored with the tour: never present them as saved facts. tour.time_estimate is one of them where present: an estimate from distance and heights (or the pace of a run), never a time the travellers planned or recorded.',
    inputSchema: {
      tripId: idSchema,
      placeId: idSchema.describe('The place id of the tour, as list_tours gives it'),
      dayId: idSchema
        .optional()
        .describe('For a city walk only: the day whose visits to read, one of the days the tour is on'),
    },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async getTourPlan({ tripId, placeId, dayId }: { tripId: number; placeId: number; dayId?: number }, ctx: McpContext) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    let read: PlanRead;
    try {
      read = await this.readPlan(tripId, placeId);
    } catch (err: unknown) {
      if (err instanceof NotFoundException) return errorResult('Tour not found.');
      throw err;
    }
    if (dayId === undefined) return ok(planOf(read, null));
    if (read.detail.tour.tour_type !== 'walk') {
      return errorResult('Only a city walk keeps visits for a day: read this tour without dayId.');
    }
    try {
      return ok(planOf(read, await this.visits.progress(tripId, placeId, dayId)));
    } catch (err: unknown) {
      if (err instanceof NotFoundException) return errorResult('This city walk is not on that day.');
      throw err;
    }
  }

  /** One saved tour as the app reads it, its days, its saved line and the places its points stand for. */
  private async readPlan(tripId: number, placeId: number): Promise<PlanRead> {
    const [detail, days, line] = await Promise.all([
      this.tours.getTour(String(tripId), String(placeId)),
      this.daysByTour(tripId),
      this.tours.savedLine(tripId, placeId),
    ]);
    return { detail, days, line, names: await this.tours.linkedPlaceNames(tripId, detail.waypoints) };
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
      'Search places along the saved line of a tour: what a hike, a run, a ride, a bike tour, a paddle tour, a ski and winter tour or a city walk stops for (viewpoint, peak, shelter, drinking_water, food, toilets, picnic, campsite, sights, slipway, boat_rental, bike_repair for repair stations and bike shops, for a ski and winter tour cafe and restaurant as well, and for a city walk museum for museums and galleries, park for parks and gardens, cafe, restaurant and market), within corridor_m metres of the line. Answers each place with its source (TREK places index or OpenStreetMap), kind, address, website and phone where known, opening hours as the source has them (a hint to check, never a promise), distance_m (straight across to the line, not a detour) and along_m (from the start along the line); up to 60, the nearest to the line when more match, listed from the start. When sights are asked for, the best known places near the line (by the page views of their Wikidata item) are searched too: a square or landmark no category names is added as a sight, and the highlights among them carry highlight: true and come first, the best known first. A place OpenStreetMap has no name for (a tap, a bench) comes with an empty name. unavailable lists the categories no source could be searched for right now: their places are missing, not absent, so ask again later rather than reporting none. partial says some stretches could not be searched, capped that only the first part of a long line was, truncated that more places matched. A tour saved with its points only (route_pending) has no line to search along yet. Nothing is added to the tour or the trip.',
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
