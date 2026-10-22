import { badRequest, DomainError } from '../common/domain-error';
import { UnitOfWork } from '../database/unit-of-work';
import {
  hikeCreateCommandOf,
  hikePointsOf,
  hikeProposalOf,
  keptWayOf,
  repointedWaypoints,
  unplannedChangeMessage,
  unplannedCreateMessage,
  type KeptWay,
} from './hike-plan.helpers';
import { HikeRoutingService, type PlannedHike } from './hike-routing.service';
import { noTrackFound } from './tour-file-import.helpers';
import { tourRevisionConflict } from './tour-revision';
import { ToursService, type ImportGpxAsTourResult, type TourCreateCommand } from './tours.service';
import { Injectable } from '@nestjs/common';
import {
  HIKE_PLAN_MAX_WAYPOINTS,
  hikingPreferencesOf,
  tourGpxImportFieldsSchema,
  TOURS_MAX_HIKING_DIFFICULTY,
  type HikeCreateRequest,
  type HikePlanPoint,
  type HikeProposal,
  type HikeProposeRequest,
  type HikingPreferences,
  type TourCreateResponse,
  type TourDetailResponse,
  type TourGpxImportRequest,
  type HikeRouteOutcome,
  type TourUpdateRequest,
  type TourWaypoint,
} from '@trek/shared';

/** What a hike created over MCP answers: the tour as the planner's save answers it, and whether its way was planned. */
export type HikeCreated = TourCreateResponse & { route: HikeRouteOutcome };

/** What a change answers: the tour as now saved, whether its way was planned anew, and how that went. */
export type HikeChanged = TourDetailResponse & { route: HikeRouteOutcome; replanned: boolean };

/** The name an import keeps when the request gives none, and the ending that has the text read as GPX. */
const GPX_NAME = 'import.gpx';

function gpxFileName(name: string | undefined): string {
  if (!name) return GPX_NAME;
  return name.toLowerCase().endsWith('.gpx') ? name : `${name}.gpx`;
}

/** Whether two sets of preferences ask the router for the same, each as a hike keeps it. */
function samePreferences(a: HikingPreferences | null, b: HikingPreferences | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A hike whose way cannot be planned: refused with why, as a 422 the tools answer with its text. */
function notRouted(message: string): DomainError {
  return new DomainError(422, message, { code: 'hike_not_routed' });
}

/** A section of the hike's way drawn by hand, which the planner alone plans around. */
const HAND_DRAWN =
  'This hike has a section drawn by hand (a via ferrata, a free line or a ferry) that only the planner plans around: change its way there. A new name, description or planned time is changed here.';

/**
 * Why new points are refused for a saved hike: a section drawn by hand or the
 * ends of its stages would go with the points they belong to, and a stage
 * that goes would leave its day. Null where new points take nothing away.
 */
function repointingRefusal(saved: readonly TourWaypoint[]): string | null {
  if (saved.some((point) => point.fixed_leg)) return HAND_DRAWN;
  if (saved.some((point) => point.stage_end)) {
    return 'This hike is split into stages over several days, which new points would end: change its points in the planner. A new limit or new preferences plan it anew here, its stages kept.';
  }
  return null;
}

/**
 * A hike planned with the traveller over MCP, end to end on the server: the
 * proposal reads only and may be asked for as often as ways are compared;
 * the hike is created once the traveller said yes, through the creation the
 * planner's save uses (one write, the trip told); a saved hike is changed
 * through the route write the planner's edit uses, against the revision it
 * was read at; a GPX file's text is taken in through the tours' file import.
 * The way is planned by HikeRoutingService under the hike's limit and
 * preferences. Refusals are DomainErrors, which REST and the MCP registry
 * answer with their text.
 */
@Injectable()
export class HikePlanService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly routing: HikeRoutingService,
    private readonly tours: ToursService,
  ) {}

  /** The way through the points; `grades` for a proposal only, which shows them. */
  private async plan(
    userId: number,
    tripId: number,
    points: HikePlanPoint[],
    limit: number | undefined,
    preferences: HikingPreferences | null | undefined,
    grades: boolean,
  ): Promise<PlannedHike> {
    return await this.routing.plan(
      userId,
      tripId,
      { waypoints: points, max_hiking_difficulty: limit, hiking_preferences: preferences },
      { grades },
    );
  }

  async propose(userId: number, tripId: number, request: HikeProposeRequest): Promise<HikeProposal> {
    const points = hikePointsOf(request.waypoints, request.round_trip);
    const { max_hiking_difficulty: limit, hiking_preferences: preferences } = request;
    const planned = await this.plan(userId, tripId, points, limit, preferences, true);
    return hikeProposalOf(request, points, planned);
  }

  /**
   * The hike created from its points with the way planned on the server and
   * kept whole with its heights. Where the router did not answer, for the way
   * or for its heights, it is saved with its points only (route_pending), and
   * the planner plans the way when it is opened. Any other reason stands in
   * the planner as well (no Valhalla, no way within the limit, a point off
   * every way, a way too long), so the hike is refused and nothing is saved.
   */
  async create(userId: number, tripId: number, request: HikeCreateRequest): Promise<HikeCreated> {
    const points = hikePointsOf(request.waypoints, request.round_trip);
    const { max_hiking_difficulty: limit, hiking_preferences: preferences } = request;
    const planned = await this.plan(userId, tripId, points, limit, preferences, false);
    const way = keptWayOf(planned);
    if ('why' in way.route && way.route.why !== 'router_unavailable') {
      throw notRouted(unplannedCreateMessage(way.route));
    }
    const command = hikeCreateCommandOf(request, points, way, planned.plan.max_hiking_difficulty);
    const created = await this.tours.createTour(String(tripId), command);
    return { ...created, route: way.route };
  }

  /**
   * A saved hike changed against the revision it was read at; a change based
   * on an older one is refused before the router is asked (the write checks it
   * again). New points, a new limit or new preferences plan the way anew, and
   * so does a hike still waiting for its way; a name, a description or a
   * planned time alone keep the way it has. A new way that cannot be planned,
   * or not with its heights, refuses the change rather than drop the way the
   * hike has; a hike still waiting for its way keeps waiting. New points keep
   * the links of the saved points they stand on, and are refused for a hike
   * with a section drawn by hand or with stages, which they would take away.
   * Only a hike planned in TREK takes it: a recorded track without points of
   * its own is planned over only with points given, and every other type is
   * changed in the planner (a city walk through prepare_tour_change and
   * save_tour_change).
   */
  async update(userId: number, tripId: number, request: TourUpdateRequest): Promise<HikeChanged> {
    const { placeId } = request;
    const saved = await this.tours.getTour(String(tripId), String(placeId));
    const { tour } = saved;
    if (tour.tour_type !== 'hike') {
      throw badRequest(
        'Only a hike is changed here. A city walk is changed with prepare_tour_change and save_tour_change, any other tour in the planner.',
      );
    }
    if (tour.revision !== undefined && tour.revision !== request.expected_revision) {
      throw tourRevisionConflict(tour.revision);
    }
    if (tour.has_waypoints !== true && request.waypoints === undefined) {
      throw badRequest(
        'This hike is a recorded track without points of its own: give waypoints to plan it over (the recorded track is kept), or rename it with update_place.',
      );
    }
    const repointing = request.waypoints ? repointingRefusal(saved.waypoints) : null;
    if (repointing) throw badRequest(repointing);
    const kept = hikingPreferencesOf(tour.hiking_preferences);
    // A recorded track keeps no limit of its own; planned over, it takes the planner's.
    const keptLimit = tour.max_hiking_difficulty ?? TOURS_MAX_HIKING_DIFFICULTY;
    const limit = request.max_hiking_difficulty ?? keptLimit;
    const preferences =
      request.hiking_preferences === undefined ? kept : hikingPreferencesOf(request.hiking_preferences);
    const line = await this.tours.savedLine(tripId, placeId);
    const replan =
      request.waypoints !== undefined ||
      line.length === 0 ||
      limit !== keptLimit ||
      !samePreferences(preferences, kept);

    let way: KeptWay;
    if (replan) {
      // New points were refused above for such a hike; a new limit or new preferences are refused here.
      if (saved.waypoints.some((point) => point.fixed_leg)) throw badRequest(HAND_DRAWN);
      if (!request.waypoints && saved.waypoints.length > HIKE_PLAN_MAX_WAYPOINTS) {
        throw badRequest(
          `This hike has more than ${HIKE_PLAN_MAX_WAYPOINTS} points, more than its way is planned through here: change it in the planner, or give new waypoints.`,
        );
      }
      const points = request.waypoints ?? saved.waypoints.map(({ lat, lng }) => ({ lat, lng }));
      way = keptWayOf(await this.plan(userId, tripId, points, limit, preferences, false));
      if ('why' in way.route && line.length > 0) throw notRouted(unplannedChangeMessage(way.route));
    } else {
      way = { line, seconds: tour.duration == null ? null : tour.duration * 60, route: { planned: true } };
    }

    const command: TourCreateCommand = {
      name: request.name ?? tour.name,
      ...(request.description !== undefined ? { description: request.description } : {}),
      tour_type: 'hike',
      route_geometry: way.line,
      duration_seconds: way.seconds,
      max_hiking_difficulty: limit,
      hiking_preferences: preferences,
      ...(request.planned_duration_minutes !== undefined
        ? { planned_duration_minutes: request.planned_duration_minutes }
        : {}),
      waypoints: request.waypoints ? repointedWaypoints(request.waypoints, saved.waypoints) : saved.waypoints,
      expected_revision: request.expected_revision,
    };
    const write = await this.tours.routeWrite(command);
    const drops = await this.uow.transactional(() => this.tours.replaceRoute(tripId, placeId, write));
    const detail = await this.tours.announceRouteUpdate(String(tripId), placeId, drops);
    return { ...detail, route: way.route, replanned: replan };
  }

  /**
   * A GPX file's text taken in as tours, one for each of its tracks and
   * routes, through the tours' file import, with the fields the multipart
   * import takes beside the file and the same refusals.
   */
  async importGpx(tripId: number, { gpx, file_name, ...fields }: TourGpxImportRequest): Promise<ImportGpxAsTourResult> {
    const checked = tourGpxImportFieldsSchema.safeParse(fields);
    if (!checked.success) throw badRequest(checked.error.issues.map((issue) => issue.message).join('; '));
    const fileName = gpxFileName(file_name);
    const imported = await this.tours.importGpxAsTour(
      String(tripId),
      Buffer.from(gpx, 'utf8'),
      fileName,
      undefined,
      checked.data,
    );
    if (!imported) throw noTrackFound(fileName);
    return imported;
  }
}
