import { Places } from '../../db/entities/Places.entity';
import { TourActivities } from '../../db/entities/TourActivities.entity';
import { TourStationVisits } from '../../db/entities/TourStationVisits.entity';
import { TourTypes } from '../../db/entities/TourTypes.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import { TOUR_HIKING_PREFERENCES, TOUR_TRACK_MARKS } from '../../db/json-columns';
import type { PlacesRepository } from '../../db/repositories/Places.repository';
import type { TourActivitiesRepository, TourActivityRefRow } from '../../db/repositories/TourActivities.repository';
import type { TourStationVisitsRepository } from '../../db/repositories/TourStationVisits.repository';
import type { TourTypesRepository } from '../../db/repositories/TourTypes.repository';
import type {
  TourWaypointRow,
  TourWaypointsRepository,
  TourWaypointWithPlaceRow,
} from '../../db/repositories/TourWaypoints.repository';
import type {
  TourDayRow,
  TourListRow,
  TourProvenanceRow,
  ToursRepository,
  TourUpdate,
} from '../../db/repositories/Tours.repository';
import { utcSuffix } from '../../db/types';
import { decodeJson, encodeJson } from '../../utils/json-column';
import { AssignmentsService } from '../assignments/assignments.service';
import { badRequest, DomainError } from '../common/domain-error';
import { toRowId } from '../common/row-id';
import { UnitOfWork } from '../database/unit-of-work';
import { PlaceImportService } from '../place-import/place-import.service';
import { PlacesService } from '../places/places.service';
import { activityFacts, toActivity, trackTimesFor } from './tour-activities.helpers';
import { TourPaddleCheckService } from './tour-paddle-check.service';
import { advanceTourRevision } from './tour-revision';
import { toVisit } from './tour-visits.service';
import {
  computeTourMetrics,
  localHashOf,
  parseRouteGeometry,
  LOW_CONFIDENCE_THRESHOLD,
  type GeometryPoint,
} from './tours.helpers';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  hikingPreferencesOf,
  maxTourMinutesFor,
  plannedTimeLimitMessage,
  plannedTourDurationMinutesSchema,
  tourWebsiteSchema,
  type BikeProfile,
  type CityWalkCreateRequest,
  type PaddleBoatType,
  type PaddleLakeStyle,
  type PaddleWaterContext,
  type RunProfile,
  type SkiDiscipline,
  type SkiTechnique,
  type TourCreateRequest,
  type TourCreateResponse,
  type TourDetailResponse,
  type TourGpxImportFields,
  type TourGpxPreviewResponse,
  type TourListItem,
  type TourOrigin,
  type TourProvenance,
  type TourProvenanceSource,
  type TourWaypoint,
  tourStageCountOf,
  tourStageIssues,
  tourStageKeysOf,
  tourStageStopsOf,
  type WandererDifficulty,
  type WinterActivity,
  walkStationFacts,
  walkStationsOf,
  wandererDifficultyToSac,
} from '@trek/shared';

import { randomUUID } from 'node:crypto';

export interface ImportGpxAsTourResult {
  tours: TourListItem[];
  caution: boolean;
  skipped: number;
}

/**
 * Tours domain: the `tours` facet table (place_id PK/FK) carries tour-specific
 * metadata while existing places and day assignments are reused.
 * GPX parsing goes through PlaceImportService.readGpx, persistence through
 * PlacesService.importPreparedGpx. Places and facet rows are persisted in one transaction,
 * with tour metrics derived from each place's route_geometry.
 */
/** A GPX file imported without a type is a hike. */
const HIKE_IMPORT: TourGpxImportFields = { tour_type: 'hike' };

/**
 * What a create writes: the request as the contract reads it, or for a city
 * walk an assistant created from its stations (CW-11) the way the server's
 * router planned on foot, which has no heights, or no line when it planned
 * none, which the planner then plans when the walk is opened.
 */
export type TourCreateCommand = Omit<TourCreateRequest, 'route_geometry'> & {
  route_geometry: GeometryPoint[] | null;
};

/** A route write checked and ready for its transaction: the write, where the tour starts and its fields. */
export interface TourRouteWrite {
  input: TourCreateCommand;
  start: GeometryPoint;
  fields: TourUpdate;
}

/** What a route write took along: the visits of stations that are gone, and the days that held a stage that is gone (MDT-02). */
export interface TourRouteDrops {
  visitsDropped: readonly number[];
  stagesDropped: ReadonlyArray<{ id: number; day_id: number }>;
}

/** The way on foot the server's router planned for a city walk (CW-11): its line, and how long it walks in seconds. */
interface CityWalkFootRoute {
  line: Array<[number, number]>;
  seconds: number;
}

/** MF-08: a save's hiking preferences as stored: a hike's switched-on ones as JSON, else NULL. */
function hikingFields(input: TourCreateCommand): string | null {
  const preferences = input.tour_type === 'hike' ? hikingPreferencesOf(input.hiking_preferences) : null;
  return preferences ? encodeJson(TOUR_HIKING_PREFERENCES, preferences) : null;
}

/**
 * HIK-01: a save's winter label as stored. Only a hike keeps one; another type
 * takes it off. A hike's save that leaves the field out (a client from before
 * the label) keeps the one the tour has, rather than taking it off unasked.
 */
function winterField(input: TourCreateCommand): WinterActivity | null | undefined {
  return input.tour_type === 'hike' ? input.winter_activity : null;
}

/**
 * RUN-01: a save's run profile and pace as stored. Only a run keeps them;
 * another type takes them off. A run without a pace keeps none: its time stays
 * unknown rather than reckoned at a pace nobody chose.
 */
function runFields(input: TourCreateCommand): Pick<TourUpdate, 'run_profile' | 'run_pace_seconds_per_km'> {
  if (input.tour_type !== 'run') return { run_profile: null, run_pace_seconds_per_km: null };
  return { run_profile: input.run_profile ?? null, run_pace_seconds_per_km: input.run_pace_seconds_per_km ?? null };
}

/**
 * CW-03: every point with its key, kept from the write where it came with one,
 * so the visits of a city walk's stations outlast a reorder or a new point. A
 * key sent twice stays with its first point; a later one gets a fresh key, so
 * checking one station off never marks another.
 */
function keyedWaypoints(waypoints: TourWaypoint[]): Array<TourWaypoint & { key: string }> {
  const taken = new Set<string>();
  return waypoints.map((point) => {
    const key = point.key && !taken.has(point.key) ? point.key : randomUUID();
    taken.add(key);
    return { ...point, key };
  });
}

/** MDT-02: the stops a multi-day tour's stages run between; null where its points do not tell them. */
function stageStopsOrNull(points: Parameters<typeof tourStageStopsOf>[0]): TourListItem['stage_stops'] {
  const stops = tourStageStopsOf(points);
  return stops.length > 0 ? stops : null;
}

@Injectable()
export class ToursService {
  private readonly logger = new Logger(ToursService.name);

  constructor(
    private readonly uow: UnitOfWork,
    private readonly places: PlacesService,
    @InjectRepository(Tours) private readonly toursRepo: ToursRepository,
    @InjectRepository(TourTypes) private readonly tourTypesRepo: TourTypesRepository,
    @InjectRepository(TourWaypoints) private readonly waypointsRepo: TourWaypointsRepository,
    @InjectRepository(TourStationVisits) private readonly visitsRepo: TourStationVisitsRepository,
    @InjectRepository(Places) private readonly placesRepo: PlacesRepository,
    @InjectRepository(TourActivities) private readonly activitiesRepo: TourActivitiesRepository,
    private readonly placeImport: PlaceImportService,
    private readonly paddleChecks: TourPaddleCheckService,
    private readonly assignments: AssignmentsService,
  ) {}

  /**
   * A tour as it is listed; a city walk with the stations its points make and their stays (CW-02, CW-03),
   * every tour with the recordings assigned to it and the tour it documents itself (ACT-01).
   */
  private toItem(
    r: TourListRow,
    points: readonly TourWaypointRow[] = [],
    activities: readonly TourActivityRefRow[] = [],
  ): TourListItem {
    return {
      place_id: r.place_id,
      name: r.name,
      description: r.description,
      website: r.website,
      tour_type: r.tour_type as TourListItem['tour_type'],
      distance: r.distance,
      elevation_gain: r.elevation_gain,
      elevation_loss: r.elevation_loss,
      duration: r.duration,
      planned_duration_minutes: r.planned_duration_minutes,
      break_additional_minutes: r.break_additional_minutes,
      difficulty: r.difficulty,
      wanderer_ref: r.wanderer_ref,
      match_confidence: r.match_confidence,
      max_hiking_difficulty: r.max_hiking_difficulty,
      derived_from_place_id: r.derived_from_place_id,
      origin: r.origin as TourOrigin,
      bike_profile: r.bike_profile as BikeProfile | null,
      winter_activity: r.winter_activity as WinterActivity | null,
      run_profile: r.run_profile as RunProfile | null,
      run_pace_seconds_per_km: r.run_pace_seconds_per_km,
      ski_discipline: r.ski_discipline as SkiDiscipline | null,
      ski_technique: r.ski_technique as SkiTechnique | null,
      boat_type: r.boat_type as PaddleBoatType | null,
      water_context: r.water_context as PaddleWaterContext | null,
      paddle_speed_kmh: r.paddle_speed_kmh,
      portage_speed_kmh: r.portage_speed_kmh,
      paddle_lake_style: r.paddle_lake_style as PaddleLakeStyle | null,
      track_marks: decodeJson(TOUR_TRACK_MARKS, r.track_marks, 'tour'),
      has_recorded_track: Boolean(r.has_recorded_track),
      planned: Boolean(r.planned),
      caution: r.match_confidence !== null && r.match_confidence < LOW_CONFIDENCE_THRESHOLD,
      has_waypoints: Boolean(r.has_waypoints),
      revision: r.revision,
      hiking_preferences: decodeJson(TOUR_HIKING_PREFERENCES, r.hiking_preferences, 'tour'),
      ...walkStationFacts(r.tour_type, points),
      route_pending: Boolean(r.route_missing) && Boolean(r.has_waypoints),
      track_started_at: utcSuffix(r.track_started_at),
      track_ended_at: utcSuffix(r.track_ended_at),
      ...activityFacts(r.place_id, activities),
      // MDT-01: a multi-day tour's stages, one more than the stops that end one.
      stage_count: r.stage_ends > 0 ? r.stage_ends + 1 : null,
      // MDT-02: the stops they run between, by which a day holds one of them.
      stage_stops: r.stage_ends > 0 ? stageStopsOrNull(points) : null,
    };
  }

  /**
   * The route a create or an update writes: metrics derived from the geometry, duration stored in minutes.
   * Without a line (CW-11) distance, heights and walking time stay unknown until the planner plans the way.
   */
  private routeFields(input: TourCreateCommand): TourUpdate {
    const metrics = input.route_geometry ? computeTourMetrics(input.route_geometry) : null;
    // A paddle tour drawn here has its heights read off the banks at the points set, not
    // off the water: its ascent and descent stay unknown rather than wrong.
    const heightsKnown = input.tour_type !== 'kayak';
    return {
      tour_type: input.tour_type,
      distance: metrics?.distanceKm ?? null,
      elevation_gain: heightsKnown ? (metrics?.elevationGainM ?? null) : null,
      elevation_loss: heightsKnown ? (metrics?.elevationLossM ?? null) : null,
      duration: input.duration_seconds == null ? null : Math.round(input.duration_seconds / 60),
      ...(input.planned_duration_minutes !== undefined
        ? { planned_duration_minutes: input.planned_duration_minutes }
        : {}),
      ...(input.break_additional_minutes !== undefined
        ? { break_additional_minutes: input.break_additional_minutes }
        : {}),
      match_confidence: 1,
      max_hiking_difficulty: input.max_hiking_difficulty,
      bike_profile: input.tour_type === 'bike' ? (input.bike_profile ?? null) : null,
      winter_activity: winterField(input),
      ...runFields(input),
      // SKI-02: TREK plans no ski track, so a planned save is never one and takes its classification off.
      ski_discipline: null,
      ski_technique: null,
      boat_type: input.boat_type ?? null,
      water_context: input.water_context ?? null,
      paddle_speed_kmh: input.paddle_speed_kmh ?? null,
      portage_speed_kmh: input.portage_speed_kmh ?? null,
      paddle_lake_style: input.paddle_lake_style ?? null,
      // MF-08: only a hike keeps preferences, and only those switched on; none is NULL.
      hiking_preferences: hikingFields(input),
    };
  }

  /**
   * `tour_types` knows every key the contract accepts, most of them disabled.
   * Checked before the write, so a disabled type is a 400 and not a tour the
   * planner cannot show. The refusals here are DomainErrors, so REST answers
   * `{ error }` and an MCP tool the same text as its error result.
   */
  private async assertTourTypeEnabled(key: string): Promise<void> {
    if (!(await this.tourTypesRepo.isEnabled(key))) throw badRequest('Tour type is not available');
  }

  private validateInformationalMetadata(input: TourCreateCommand): void {
    if (input.description != null && input.description.length > 2000) {
      throw badRequest('description must be 2000 characters or less');
    }
    if (input.website != null && !tourWebsiteSchema.safeParse(input.website).success) {
      throw badRequest('website must be a valid HTTPS URL without credentials');
    }
  }

  private validatePlannedTimes(input: TourCreateCommand): void {
    for (const value of [input.planned_duration_minutes, input.break_additional_minutes]) {
      if (value !== undefined && !plannedTourDurationMinutesSchema.safeParse(value).success) {
        throw badRequest('planned Tour times must be whole minutes from 0 to 1440');
      }
    }
    // MDT-01: a multi-day tour is held to a day a stage, a day tour to one day.
    const stages = tourStageCountOf(input.waypoints);
    if (
      input.planned_duration_minutes == null &&
      input.duration_seconds != null &&
      Math.round(input.duration_seconds / 60) + (input.break_additional_minutes ?? 0) > maxTourMinutesFor(stages)
    ) {
      throw badRequest(plannedTimeLimitMessage(stages));
    }
  }

  /**
   * MDT-01: the stage ends sit at stops between start and end, as the contract
   * holds a request to; checked here too for a write that did not come through
   * it (an assistant's city walk), so no surface can store one out of place.
   */
  private validateStageEnds(input: TourCreateCommand): void {
    const [issue] = tourStageIssues(input.waypoints);
    if (issue) throw badRequest(issue.message);
  }

  /** All tours (the facet + owning place) for a trip, newest first; a paddle tour with its check bench (PAD-09). */
  async listTours(tripId: string): Promise<TourListItem[]> {
    const tid = toRowId(tripId);
    if (tid === null) return [];
    const rows = await this.toursRepo.listForTrip(tid);
    const listedPoints = await this.listedPointsByPlace(rows);
    const activities = await this.activitiesRepo.listForTrip(tid);
    return await this.paddleChecks.forTrip(
      tid,
      rows.map((r) => this.toItem(r, listedPoints.get(r.place_id) ?? [], activities)),
    );
  }

  /**
   * The points a list reads, by tour: a city walk's, which it counts the
   * stations and stays of (CW-02, CW-03), and a multi-day tour's, which it
   * reads the stops between the stages off (MDT-02). The points of any other
   * tour are not read.
   */
  async listedPointsByPlace(
    rows: readonly { place_id: number; tour_type: string; stage_ends?: number }[],
  ): Promise<Map<number, TourWaypointWithPlaceRow[]>> {
    const byPlace = new Map<number, TourWaypointWithPlaceRow[]>();
    const read = rows
      .filter((row) => row.tour_type === 'walk' || (row.stage_ends ?? 0) > 0)
      .map((row) => row.place_id);
    for (const point of await this.waypointsRepo.listForPlaces(read)) {
      const points = byPlace.get(point.place_id);
      if (points) points.push(point);
      else byPlace.set(point.place_id, [point]);
    }
    return byPlace;
  }

  /** The days every tour of the trip sits on, for the MCP read tools. */
  async listTourDays(tripId: number): Promise<TourDayRow[]> {
    return await this.toursRepo.listTourDays(tripId);
  }

  /**
   * MCP-T01: the saved line of a tour of this trip, as stored; empty for a
   * place out of the trip and for a tour saved with its points only.
   */
  async savedLine(tripId: number, placeId: number): Promise<GeometryPoint[]> {
    return parseRouteGeometry((await this.placesRepo.findInTrip(placeId, tripId))?.route_geometry);
  }

  /** One saved tour plus the persisted routing controls needed by the editor. */
  async getTour(tripId: string, placeId: string): Promise<TourDetailResponse> {
    const tid = toRowId(tripId);
    const pid = toRowId(placeId);
    const row = tid !== null && pid !== null ? await this.toursRepo.findInTrip(tid, pid) : undefined;
    if (!row || tid === null) throw new NotFoundException('Tour not found');

    const stored: TourWaypoint[] = await this.waypointsRepo.listForPlace(row.place_id);
    let waypoints = stored;
    // A recorded paddle track's checklist reads its line, so the place is read for it as for the controls below.
    const place =
      waypoints.length < 2 || row.tour_type === 'kayak' ? await this.placesRepo.findInTrip(row.place_id, tid) : null;
    // GPX tours created before tour_waypoints existed still belong in this
    // all-tours rail. A read-only endpoint must not backfill the database, so
    // expose their saved geometry endpoints as controls; the first edit/save
    // replaces them with normal persisted tour_waypoints transactionally.
    if (waypoints.length < 2) {
      const geometry = parseRouteGeometry(place?.route_geometry);
      if (geometry.length >= 2) {
        const start = geometry[0];
        const end = geometry[geometry.length - 1];
        waypoints = [
          { lat: start[0], lng: start[1], role: 'start', sequence: 0 },
          { lat: end[0], lng: end[1], role: 'end', sequence: 1 },
        ];
      }
    }

    // ACT-01: the recordings assigned to this tour, and the assignment this tour is the recording of.
    const activities = await this.activitiesRepo.listForPlace(tid, row.place_id);
    const documents = await this.activitiesRepo.findByTrack(row.place_id);
    const refs = documents ? [...activities, documents] : activities;
    const checked = await this.paddleChecks.forTour(
      this.toItem(row, stored, refs),
      stored,
      place?.route_geometry ?? null,
    );
    return {
      tour: checked.item,
      waypoints,
      provenance: await this.provenanceOf(tid, row.place_id),
      ...(checked.obstacle_check ? { obstacle_check: checked.obstacle_check } : {}),
      activities: activities.map(toActivity),
    };
  }

  /**
   * Where a tour came from (P2C-02): the origin it was saved with, what its
   * source carried, the import it was planned from, and whether it still
   * matches the import. Nothing here is guessed: a field the tour never
   * recorded stays null.
   */
  private async provenanceOf(tripId: number, placeId: number): Promise<TourProvenance> {
    const row = await this.toursRepo.findProvenance(tripId, placeId);
    if (!row) throw new NotFoundException('Tour not found');
    const origin = row.origin as TourOrigin;
    return {
      origin,
      createdAt: row.created_at,
      source: provenanceSource(origin, row),
      derivedFrom:
        row.derived_from_place_id !== null && row.derived_from_name !== null
          ? { placeId: row.derived_from_place_id, name: row.derived_from_name }
          : null,
      plannedOver: row.has_recorded_track === 1,
      editedLocally:
        origin === 'wanderer' && row.source_local_hash !== null
          ? localHashOf(row.name, parseRouteGeometry(row.route_geometry)) !== row.source_local_hash
          : null,
      takenOverFrom:
        row.taken_over_from_trip_title != null && row.taken_over_from_tour_name != null
          ? { tripTitle: row.taken_over_from_trip_title, tourName: row.taken_over_from_tour_name }
          : null,
    };
  }

  /**
   * Create the owning Place, Tours facet, and ordered control points as one write. A create
   * without a line (CW-11) puts the place at its first point.
   */
  async createTour(tripId: string, input: TourCreateCommand, socketId?: string): Promise<TourCreateResponse> {
    // The controller's TripAccessGuard already resolved this trip id.
    const tid = toRowId(tripId)!;
    await this.assertTourTypeEnabled(input.tour_type);
    this.validateInformationalMetadata(input);
    this.validateStageEnds(input);
    this.validatePlannedTimes(input);
    const start = input.route_geometry ? input.route_geometry[0] : firstPointOf(input.waypoints);
    if (!start || (input.route_geometry === null && input.waypoints.length < 2)) {
      throw badRequest('A tour needs at least two points');
    }
    const fields = this.routeFields(input);
    const derivedFrom = input.derived_from_place_id ?? null;

    const placeId = await this.uow.transactional(async () => {
      // What it was planned from has to be an import (no waypoints of its own) of this same trip,
      // read in the write so it cannot go meanwhile.
      if (derivedFrom !== null) {
        const source = await this.toursRepo.findInTrip(tid, derivedFrom);
        if (!source || source.origin === 'trek' || source.has_waypoints) {
          throw new DomainError(400, 'derived_from_place_id is not an imported tour of this trip');
        }
      }
      const id = await this.placesRepo.insertTourPlace({
        trip_id: tid,
        name: input.name,
        lat: start[0],
        lng: start[1],
        route_geometry: input.route_geometry ? JSON.stringify(input.route_geometry) : null,
        description: input.description ?? null,
        website: input.website ?? null,
      });
      await this.toursRepo.insertTour({
        place_id: id,
        ...fields,
        planned_duration_minutes: fields.planned_duration_minutes ?? null,
        break_additional_minutes: fields.break_additional_minutes ?? null,
        derived_from_place_id: derivedFrom,
      });
      await this.waypointsRepo.insertForPlace(id, keyedWaypoints(await this.linkedWaypoints(tid, input.waypoints)));
      return id;
    });

    const row = await this.toursRepo.findInTrip(tid, placeId);
    const place = await this.placesRepo.findWithTagsAndRatings(placeId);
    if (!row || !place) throw new Error('Created tour could not be loaded');
    const waypoints = await this.waypointsRepo.listForPlace(placeId);

    // Only announce after every row committed. The originating client reloads
    // explicitly because socket-id exclusion intentionally suppresses its echo.
    this.broadcastToursChanged(tripId, [placeId], socketId);
    try {
      this.places.broadcast(tripId, 'place:created', { place }, socketId);
    } catch {
      this.logger.warn(`Committed Tour ${placeId}: place notification failed`);
    }
    const checked = await this.paddleChecks.forTour(
      this.toItem(row, waypoints),
      waypoints,
      place.route_geometry ?? null,
    );
    return {
      tour: checked.item,
      waypoints,
      provenance: await this.provenanceOf(tid, placeId),
      ...(checked.obstacle_check ? { obstacle_check: checked.obstacle_check } : {}),
    };
  }

  /**
   * CW-11: a city walk the traveller confirmed through an assistant, made the
   * way the planner's save makes one, in the same write with the same checks:
   * its stations in order, each with a key of its own, its links to the trip's
   * places checked. Its distance and walking time come from the way the
   * server's router planned on foot. Without one it is saved with its stations
   * only: no line, no distance and no walking time, until the planner plans the
   * way when it is opened.
   */
  async createCityWalk(
    tripId: string,
    input: CityWalkCreateRequest,
    way: CityWalkFootRoute | null,
  ): Promise<TourCreateResponse> {
    const last = input.stations.length - 1;
    return await this.createTour(tripId, {
      name: input.name,
      description: input.description,
      tour_type: 'walk',
      route_geometry: way?.line ?? null,
      duration_seconds: way?.seconds ?? null,
      max_hiking_difficulty: null,
      waypoints: input.stations.map((station, sequence) => ({
        ...station,
        role: sequence === 0 ? 'start' : sequence === last ? 'end' : 'via',
        sequence,
      })),
    });
  }

  /**
   * Takes an import that was planned over in place back to the track it was
   * recorded with: its line, the measures read from that line and the grade
   * its source gave, without the waypoints. The tour keeps its id, days and notes.
   */
  async restoreRecordedTrack(tripId: string, placeId: string, socketId?: string): Promise<TourDetailResponse> {
    const tid = toRowId(tripId);
    const pid = toRowId(placeId);
    if (tid === null || pid === null) throw new NotFoundException('Tour not found');

    const stagesDropped = await this.uow.transactional(async () => {
      const row = await this.toursRepo.findInTrip(tid, pid);
      if (!row) throw new NotFoundException('Tour not found');
      const recorded = await this.toursRepo.findRecordedTrack(tid, pid);
      if (recorded === null) {
        throw new DomainError(409, 'This tour keeps no recorded track to go back to', {
          code: 'no_recorded_track',
          details: { code: 'no_recorded_track' },
        });
      }
      const geometry = parseRouteGeometry(recorded);
      const start = geometry[0];
      if (!start)
        throw new DomainError(409, 'The recorded track of this tour is empty', {
          code: 'no_recorded_track',
          details: { code: 'no_recorded_track' },
        });
      const metrics = computeTourMetrics(geometry);
      await advanceTourRevision(this.toursRepo, pid);
      await this.placesRepo.updateTourRoute(pid, tid, {
        name: row.name,
        lat: start[0],
        lng: start[1],
        route_geometry: recorded,
      });
      await this.toursRepo.updateInTrip(tid, pid, {
        tour_type: row.tour_type,
        distance: metrics.distanceKm,
        elevation_gain: metrics.elevationGainM,
        elevation_loss: metrics.elevationLossM,
        duration: null,
        match_confidence: metrics.hasElevation ? 1 : 0.3,
        // The grade its source gave, on the one scale tours use; a GPX file gives none.
        max_hiking_difficulty:
          row.wanderer_ref && row.tour_type === 'hike'
            ? wandererDifficultyToSac(row.difficulty as WandererDifficulty | null)
            : null,
        bike_profile: row.bike_profile as BikeProfile | null,
        run_profile: row.run_profile as RunProfile | null,
        run_pace_seconds_per_km: row.run_pace_seconds_per_km,
        ski_discipline: row.ski_discipline as SkiDiscipline | null,
        ski_technique: row.ski_technique as SkiTechnique | null,
        boat_type: row.boat_type as PaddleBoatType | null,
        water_context: row.water_context as PaddleWaterContext | null,
        paddle_speed_kmh: row.paddle_speed_kmh,
        portage_speed_kmh: row.portage_speed_kmh,
        paddle_lake_style: row.paddle_lake_style as PaddleLakeStyle | null,
      });
      await this.waypointsRepo.deleteForPlace(pid);
      await this.toursRepo.clearRecordedTrack(pid);
      // MDT-02: back to the recorded track the tour has no stages, so no day holds one.
      return await this.assignments.dropStaleTourStages(pid, []);
    });

    const result = await this.getTour(tripId, placeId);
    const place = await this.placesRepo.findWithTagsAndRatings(pid);
    if (!place) throw new Error('Restored tour could not be loaded');
    this.broadcastToursChanged(tripId, [pid], socketId);
    try {
      this.places.broadcast(tripId, 'place:updated', { place }, socketId);
    } catch {
      this.logger.warn(`Committed Tour ${placeId}: place notification failed`);
    }
    await this.announceStagesDropped(tripId, stagesDropped);
    return result;
  }

  /**
   * P2C-07 "save as new tour": an independent tour made from one of the trip,
   * with its own id, its own copy of the line and the control points, the
   * same measures and source, and none of the days. It points at the tour it
   * came from (`derived_from_place_id`), so the detail can name it; nothing
   * keeps the two in step afterwards.
   */
  async copyTour(tripId: string, placeId: string, name: string, socketId?: string): Promise<TourCreateResponse> {
    const tid = toRowId(tripId);
    const pid = toRowId(placeId);
    if (tid === null || pid === null) throw new NotFoundException('Tour not found');
    // Within the trip: the copy points at the tour it was planned from, keeps its
    // stops' links to the trip's places and the decisions about its obstacles.
    const copyId = await this.uow.transactional(() =>
      this.insertCopyOf({ tid, pid }, { tid, name }, { derivedFrom: pid, sameTrip: true }),
    );
    return await this.announceCopy(tripId, copyId, socketId);
  }

  /**
   * LIB-02: an independent copy of a tour of another trip, written into this
   * trip. The caller has checked that the user may open the source trip; the
   * source is read here again, inside the write, so a tour gone meanwhile
   * leaves nothing behind. The copy keeps where it came from as text, and none
   * of what belongs to the other trip: no link to its places or its import, no
   * decisions its people took about obstacles, no days.
   */
  async takeOverTour(
    tripId: string,
    source: { tripId: number; placeId: number; tripTitle: string; tourName: string },
    name: string,
    socketId?: string,
  ): Promise<TourCreateResponse> {
    const tid = toRowId(tripId);
    if (tid === null) throw new NotFoundException('Tour not found');
    const copyId = await this.uow.transactional(() =>
      this.insertCopyOf(
        { tid: source.tripId, pid: source.placeId },
        { tid, name },
        { derivedFrom: null, sameTrip: false, takenOverFrom: source },
      ),
    );
    return await this.announceCopy(tripId, copyId, socketId);
  }

  /**
   * One copy of a tour: its place with the same line, its facet with every
   * measure and setting, its control points. Inside the caller's transaction.
   */
  private async insertCopyOf(
    source: { tid: number; pid: number },
    target: { tid: number; name: string },
    how: { derivedFrom: number | null; sameTrip: boolean; takenOverFrom?: { tripTitle: string; tourName: string } },
  ): Promise<number> {
    const [row, provenance, place, waypoints] = await Promise.all([
      this.toursRepo.findInTrip(source.tid, source.pid),
      this.toursRepo.findProvenance(source.tid, source.pid),
      this.placesRepo.findInTrip(source.pid, source.tid),
      this.waypointsRepo.listForPlace(source.pid),
    ]);
    // A city walk saved with its stations only (CW-11) is copied from its first one, its way still to plan;
    // a line that holds no point has nothing to copy.
    const start = place?.route_geometry == null ? firstPointOf(waypoints) : parseRouteGeometry(place.route_geometry)[0];
    if (!row || !provenance || !place || !start) throw new NotFoundException('Tour not found');
    if (!how.sameTrip) await this.assertTourTypeEnabled(row.tour_type);
    const id = await this.placesRepo.insertTourPlace({
      trip_id: target.tid,
      name: target.name,
      lat: start[0],
      lng: start[1],
      route_geometry: place.route_geometry ?? null,
      description: place.description ?? null,
      website: place.website ?? null,
    });
    await this.toursRepo.insertTour({
      place_id: id,
      tour_type: row.tour_type,
      distance: row.distance,
      elevation_gain: row.elevation_gain,
      elevation_loss: row.elevation_loss,
      duration: row.duration,
      planned_duration_minutes: row.planned_duration_minutes,
      break_additional_minutes: row.break_additional_minutes,
      match_confidence: row.match_confidence,
      max_hiking_difficulty: row.max_hiking_difficulty,
      bike_profile: row.bike_profile as BikeProfile | null,
      winter_activity: row.winter_activity as WinterActivity | null,
      run_profile: row.run_profile as RunProfile | null,
      run_pace_seconds_per_km: row.run_pace_seconds_per_km,
      ski_discipline: row.ski_discipline as SkiDiscipline | null,
      ski_technique: row.ski_technique as SkiTechnique | null,
      boat_type: row.boat_type as PaddleBoatType | null,
      water_context: row.water_context as PaddleWaterContext | null,
      paddle_speed_kmh: row.paddle_speed_kmh,
      portage_speed_kmh: row.portage_speed_kmh,
      paddle_lake_style: row.paddle_lake_style as PaddleLakeStyle | null,
      track_marks: row.track_marks,
      hiking_preferences: row.hiking_preferences,
      wanderer_ref: row.wanderer_ref,
      difficulty: row.difficulty,
      derived_from_place_id: how.derivedFrom,
      origin: row.origin as TourOrigin,
      origin_file_name: provenance.origin_file_name,
      // A copy of a copy names where the first one came from.
      taken_over_from_trip_title: how.takenOverFrom?.tripTitle ?? provenance.taken_over_from_trip_title,
      taken_over_from_tour_name: how.takenOverFrom?.tourName ?? provenance.taken_over_from_tour_name,
      // A copy of a recording was recorded when it was; the assignments stay with the tours they joined.
      track_started_at: row.track_started_at,
      track_ended_at: row.track_ended_at,
    });
    // A stop standing for a place of the source trip stands for nothing in another trip.
    await this.waypointsRepo.insertForPlace(
      id,
      how.sameTrip ? waypoints : waypoints.map((point) => ({ ...point, linked_place_id: null })),
    );
    if (how.sameTrip) {
      // The copy keeps the decisions about its obstacles, bound to what they were decided on.
      await this.toursRepo.copyObstacleReviews(source.pid, id);
    } else {
      // The import record says where the line itself came from, whichever trip holds it.
      await this.toursRepo.copySource(source.pid, id);
    }
    return id;
  }

  /** After a copy committed: the trip's tours and places follow it live, and the copy is answered as the editor reads it. */
  private async announceCopy(tripId: string, copyId: number, socketId?: string): Promise<TourCreateResponse> {
    const result = await this.getTour(tripId, String(copyId));
    const created = await this.placesRepo.findWithTagsAndRatings(copyId);
    this.broadcastToursChanged(tripId, [copyId], socketId);
    try {
      if (created) this.places.broadcast(tripId, 'place:created', { place: created }, socketId);
    } catch {
      this.logger.warn(`Committed Tour copy ${copyId}: place notification failed`);
    }
    return result;
  }

  /** Replace a saved tour's derived route and routing controls as one write. */
  async updateTour(
    tripId: string,
    placeId: string,
    input: TourCreateRequest,
    socketId?: string,
  ): Promise<TourDetailResponse> {
    const tid = toRowId(tripId);
    const pid = toRowId(placeId);
    if (tid === null || pid === null) throw new NotFoundException('Tour not found');
    const write = await this.routeWrite(input);
    const dropped = await this.uow.transactional(() => this.replaceRoute(tid, pid, write));
    return await this.announceRouteUpdate(tripId, pid, dropped, socketId);
  }

  /**
   * A route write checked before its transaction opens: its type switched on,
   * its texts and times valid, where it starts and the tour fields it writes.
   * A city walk saved from a confirmed change (MCP-T03) may come without a
   * line, as a created one may (CW-11): it is then at its first point, and the
   * planner plans the way when it is opened.
   */
  async routeWrite(input: TourCreateCommand): Promise<TourRouteWrite> {
    await this.assertTourTypeEnabled(input.tour_type);
    this.validateInformationalMetadata(input);
    this.validateStageEnds(input);
    this.validatePlannedTimes(input);
    const start = input.route_geometry ? input.route_geometry[0] : firstPointOf(input.waypoints);
    if (!start) throw badRequest('A tour needs at least two points');
    return { input, start, fields: this.routeFields(input) };
  }

  /**
   * A saved tour's route, points and visits written inside the caller's transaction, so what else a
   * caller records of the change (MCP-T03) commits or rolls back with it. Answers the revision it
   * raised the tour to and the day assignments whose visits went with a station that is gone.
   */
  async replaceRoute(
    tripId: number,
    placeId: number,
    { input, start, fields }: TourRouteWrite,
  ): Promise<{ revision: number } & TourRouteDrops> {
    // The trip predicate is the cross-trip boundary. It runs inside the write
    // so an id from another accessible trip cannot be moved into the current
    // one, and a place deleted meanwhile answers 404 instead of failing a
    // waypoint insert on its foreign key.
    if (!(await this.toursRepo.findInTrip(tripId, placeId))) throw new NotFoundException('Tour not found');
    // P2C-03: refused here, before anything is written, while the draft's tour has moved on.
    const revision = await advanceTourRevision(this.toursRepo, placeId, input.expected_revision);
    // An import planned over for the first time keeps the track it was recorded with.
    await this.toursRepo.keepRecordedTrack(placeId);
    const placeUpdated = await this.placesRepo.updateTourRoute(placeId, tripId, {
      name: input.name,
      lat: start[0],
      lng: start[1],
      route_geometry: input.route_geometry ? JSON.stringify(input.route_geometry) : null,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
    });
    if (!placeUpdated) throw new NotFoundException('Tour not found');
    if (!(await this.toursRepo.updateInTrip(tripId, placeId, fields))) throw new NotFoundException('Tour not found');
    await this.waypointsRepo.deleteForPlace(placeId);
    const waypoints = keyedWaypoints(await this.linkedWaypoints(tripId, input.waypoints));
    await this.waypointsRepo.insertForPlace(placeId, waypoints);
    // CW-03: a station that is gone takes its visits with it; a tour that is no city walk keeps none.
    const stations = input.tour_type === 'walk' ? walkStationsOf(waypoints).map((point) => point.key) : [];
    return {
      revision,
      visitsDropped: await this.visitsRepo.dropStationsNotIn(placeId, stations),
      // MDT-02: a stage the change took away (its stage end gone, the tour a day tour again) leaves its day.
      stagesDropped: await this.assignments.dropStaleTourStages(placeId, tourStageKeysOf(waypoints)),
    };
  }

  /** After a route write committed: the tour read back, and the trip told of it and of the visits and stages it took along. */
  async announceRouteUpdate(
    tripId: string,
    placeId: number,
    { visitsDropped, stagesDropped }: TourRouteDrops,
    socketId?: string,
  ): Promise<TourDetailResponse> {
    const result = await this.getTour(tripId, String(placeId));
    const place = await this.placesRepo.findWithTagsAndRatings(placeId);
    if (!place) throw new Error('Updated tour could not be loaded');
    this.broadcastToursChanged(tripId, [placeId], socketId);
    try {
      this.places.broadcast(tripId, 'place:updated', { place }, socketId);
    } catch {
      this.logger.warn(`Committed Tour ${placeId}: place notification failed`);
    }
    await this.announceVisits(tripId, visitsDropped);
    await this.announceStagesDropped(tripId, stagesDropped);
    return result;
  }

  /**
   * MDT-02: the days that held a stage a change took away, told to every
   * client of the trip, the one that saved included, since its day plan still
   * shows them; the journey follows the days as after any unassign.
   */
  private async announceStagesDropped(
    tripId: string,
    dropped: ReadonlyArray<{ id: number; day_id: number }>,
  ): Promise<void> {
    if (dropped.length === 0) return;
    for (const { id, day_id } of dropped) {
      try {
        this.places.broadcast(tripId, 'assignment:deleted', { assignmentId: id, dayId: day_id }, undefined);
      } catch {
        this.logger.warn(`Committed Tour stage change: realtime notification of assignment ${id} failed`);
      }
    }
    await this.assignments.reconcile(tripId);
  }

  /**
   * CW-03: the days whose visits an edit took along, told to every client of
   * the trip, the one that saved included, so no day plan goes on counting a
   * station the walk no longer has.
   */
  private async announceVisits(tripId: string, assignmentIds: readonly number[]): Promise<void> {
    await Promise.all(
      assignmentIds.map(async (assignmentId) => {
        const visits = (await this.visitsRepo.listForAssignment(assignmentId)).map(toVisit);
        try {
          this.places.broadcast(tripId, 'tours:visits', { assignmentId, visits }, undefined);
        } catch {
          this.logger.warn(`Committed Tour visits of assignment ${assignmentId}: realtime notification failed`);
        }
      }),
    );
  }

  /** PR1-10: the names of the places the points stand for, for a reader that wants them spelled out. */
  async linkedPlaceNames(tripId: number, waypoints: readonly TourWaypoint[]): Promise<Map<number, string>> {
    return await this.waypointsRepo.placeNames(
      tripId,
      waypoints.flatMap((point) => (point.linked_place_id ? [point.linked_place_id] : [])),
    );
  }

  /**
   * PR1-10: the points of a write with their links checked, inside its
   * transaction. A point may stand for a place of the tour's trip that is not
   * a tour itself; naming a tour of the trip is refused. A place that is gone,
   * or one this trip does not have, leaves the point unlinked, the same either
   * way, so a draft or a queued write that outlived its place still saves and
   * no answer tells another trip's ids apart.
   */
  private async linkedWaypoints(tripId: number, waypoints: TourWaypoint[]): Promise<TourWaypoint[]> {
    const ids = waypoints.flatMap((point) => (point.linked_place_id ? [point.linked_place_id] : []));
    if (ids.length === 0) return waypoints;
    const linkable = await this.waypointsRepo.linkablePlaceIds(tripId, ids);
    // A place that cannot be linked may be a tour of this trip, which a stop never stands for.
    const tours = await Promise.all(
      ids.filter((id) => !linkable.has(id)).map((id) => this.toursRepo.findInTrip(tripId, id)),
    );
    if (tours.some(Boolean)) {
      throw new DomainError(400, 'A waypoint cannot stand for a tour', {
        code: 'waypoint_links_a_tour',
        details: { code: 'waypoint_links_a_tour' },
      });
    }
    return waypoints.map((point) =>
      point.linked_place_id && !linkable.has(point.linked_place_id) ? { ...point, linked_place_id: null } : point,
    );
  }

  /** Tells the trip's other clients to reload these tours; a failed notice never fails the committed write. */
  broadcastToursChanged(tripId: string, placeIds: number[], socketId?: string): void {
    try {
      this.places.broadcast(tripId, 'tours:changed', { placeIds }, socketId);
    } catch {
      this.logger.warn(`Committed Tours change for trip ${tripId}: realtime invalidation failed`);
    }
  }

  /**
   * The tours-mode GPX import reads rows through PlaceImportService.readGpx
   * with waypoints excluded. PlacesService.importPreparedGpx persists the places
   * in the same transaction as their `tours` facet rows, whose metrics are
   * derived from route_geometry.
   *
   * Missing or implausible metrics do not block import:
   * a track without elevation still imports, just flagged with a low
   * match_confidence so the client can surface a "with caution" toast.
   */
  async importGpxAsTour(
    tripId: string,
    fileBuffer: Buffer,
    fileName?: string,
    socketId?: string,
    fields: TourGpxImportFields = HIKE_IMPORT,
  ): Promise<ImportGpxAsTourResult | null> {
    const rows = this.readGpxTracks(fileBuffer, fileName);
    if (rows.length === 0) return null;
    await this.assertTourTypeEnabled(fields.tour_type);
    // What the type adds to each imported tour: a bike tour and a run their profile, a paddle tour its boat and water,
    // a ski track its discipline and technique (SKI-02). A run comes in without a pace and a ski track without a
    // time: neither is worked out for them, so they stay unknown.
    const typeFields = {
      bike_profile: fields.bike_profile ?? null,
      run_profile: fields.run_profile ?? null,
      run_pace_seconds_per_km: null,
      ski_discipline: fields.ski_discipline ?? null,
      ski_technique: fields.ski_technique ?? null,
      boat_type: fields.boat_type ?? null,
      water_context: fields.water_context ?? null,
      paddle_speed_kmh: null,
    };

    const tours: TourListItem[] = [];
    const result = await this.uow.transactional(async () => {
      // A nested transactional, so the places and their facets commit together.
      const imported = await this.places.importPreparedGpx(tripId, rows);
      const times = trackTimesFor(rows, imported.places);
      for (const place of imported.places) {
        const recorded = times.get(place.id);
        const metrics = computeTourMetrics(parseRouteGeometry(place.route_geometry));
        const matchConfidence = metrics.hasElevation ? 1 : 0.3;
        await this.toursRepo.insertTour({
          place_id: place.id,
          tour_type: fields.tour_type,
          ...typeFields,
          distance: metrics.distanceKm,
          elevation_gain: metrics.elevationGainM,
          elevation_loss: metrics.elevationLossM,
          duration: null,
          planned_duration_minutes: null,
          break_additional_minutes: null,
          match_confidence: matchConfidence,
          max_hiking_difficulty: null,
          origin: 'gpx',
          origin_file_name: gpxFileName(fileName),
          track_started_at: recorded?.started ?? null,
          track_ended_at: recorded?.ended ?? null,
        });
        tours.push(
          this.toItem({
            place_id: place.id,
            name: place.name,
            description: place.description ?? null,
            website: place.website ?? null,
            tour_type: fields.tour_type,
            ...typeFields,
            distance: metrics.distanceKm,
            elevation_gain: metrics.elevationGainM,
            elevation_loss: metrics.elevationLossM,
            duration: null,
            planned_duration_minutes: null,
            break_additional_minutes: null,
            difficulty: null,
            wanderer_ref: null,
            match_confidence: matchConfidence,
            max_hiking_difficulty: null,
            derived_from_place_id: null,
            origin: 'gpx',
            portage_speed_kmh: null,
            paddle_lake_style: null,
            track_marks: null,
            has_recorded_track: 0,
            planned: 0,
            has_waypoints: 0,
            route_missing: 0,
            revision: 1,
            hiking_preferences: null,
            winter_activity: null,
            track_started_at: recorded?.started ?? null,
            track_ended_at: recorded?.ended ?? null,
          }),
        );
      }
      return imported;
    });

    if (result.places.length === 0) return { tours: [], caution: false, skipped: result.skipped };
    this.broadcastToursChanged(
      tripId,
      result.places.map((place) => place.id),
      socketId,
    );
    for (const place of result.places) {
      try {
        this.places.broadcast(tripId, 'place:created', { place }, socketId);
      } catch {
        this.logger.warn(`Committed GPX place ${place.id}: realtime notification failed`);
      }
    }
    return { tours, caution: tours.some((t) => t.caution), skipped: result.skipped };
  }

  /**
   * PAD-02: what a GPX file would import, read with the import's own parser
   * and duplicate rule and written nowhere. Null when the file holds no track
   * or route, the import's own refusal.
   */
  async previewGpx(tripId: string, fileBuffer: Buffer, fileName?: string): Promise<TourGpxPreviewResponse | null> {
    const rows = this.readGpxTracks(fileBuffer, fileName);
    if (rows.length === 0) return null;
    const duplicates = await this.places.gpxDuplicates(tripId, rows);
    return {
      tracks: rows.map((row, index) => {
        const geometry = parseRouteGeometry(row.routeGeometry);
        const metrics = computeTourMetrics(geometry);
        return {
          name: row.name,
          geometry,
          point_count: geometry.length,
          distance_km: metrics.distanceKm,
          elevation_gain_m: metrics.elevationGainM,
          elevation_loss_m: metrics.elevationLossM,
          started_at: row.trackTimes?.startedAt ?? null,
          ended_at: row.trackTimes?.endedAt ?? null,
          duplicate: duplicates[index] ?? false,
        };
      }),
    };
  }

  /** The tracks and routes of a GPX file, never its loose waypoints: the reading every Tours import shares. */
  private readGpxTracks(fileBuffer: Buffer, fileName?: string) {
    return this.placeImport.readGpx(fileBuffer, {
      importWaypoints: false,
      importRoutes: true,
      importTracks: true,
      defaultName: fileName,
    });
  }
}

/** Where a tour without a line starts (CW-11): at its first point. */
function firstPointOf(points: readonly { lat: number; lng: number }[]): [number, number] | undefined {
  const point = points[0];
  return point ? [point.lat, point.lng] : undefined;
}

/** The file name a GPX import keeps: the name as uploaded, without a path, cut to what the column shows. */
function gpxFileName(name: string | undefined): string | null {
  const base = name?.split('/').pop()?.trim();
  return base ? base.slice(0, 255) : null;
}

/** What the source of a tour carried, read from the tour's own record and its import's snapshot row. */
function provenanceSource(origin: TourOrigin, row: TourProvenanceRow): TourProvenanceSource {
  if (origin === 'gpx') return { kind: 'gpx', fileName: row.origin_file_name };
  if (origin === 'wanderer') {
    // The reference `instance#trail` is on the tour itself, so a snapshot whose row is missing still names its source.
    const [refInstance, refTrail] = splitWandererRef(row.wanderer_ref);
    return {
      kind: 'wanderer',
      instance: row.source_instance ?? refInstance,
      externalId: row.source_external_id ?? refTrail,
      externalUrl: row.source_external_url,
      externalUpdated: row.source_external_updated,
      importedAt: row.source_imported_at,
    };
  }
  return { kind: 'trek' };
}

function splitWandererRef(ref: string | null): [string, string] {
  const at = ref?.lastIndexOf('#') ?? -1;
  return ref && at > 0 ? [ref.slice(0, at), ref.slice(at + 1)] : ['', ''];
}
