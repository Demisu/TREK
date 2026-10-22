import { logWarn } from '../audit/audit-log.logger';
import { badRequest } from '../common/domain-error';
import { RoadtripRouterService, RouteRefusal, type RoadtripRoute } from '../roadtrip/roadtrip-router.service';
import { gradableWayIds, gradesAlong, heightsOrNone, joinedLine, profileOf } from './hike-routing.helpers';
import { TourTrailGradeService } from './tour-trail-grade.service';
import { thinnedLine } from './tours.helpers';
import { Injectable } from '@nestjs/common';
import {
  computeTourMetrics,
  HIKE_MAX_LINE_POINTS,
  HIKE_PLAN_LINE_POINTS,
  HIKE_PLAN_PROFILE_SAMPLES,
  hikePlanRequestSchema,
  hikingCosting,
  hikingPreferencesOf,
  hikingTimeMinutes,
  sacStepOf,
  TOUR_MAX_SNAP_M,
  TOUR_TRAIL_GRADE_MAX_WAYS,
  TOURS_MAX_HIKING_DIFFICULTY,
  type GeometryPoint,
  type HikePlan,
  type HikePlanRequest,
  type HikeTrailGrades,
  type SacStep,
  type UnroutedHikePlan,
} from '@trek/shared';

/**
 * The day the router is asked for. A hike's way does not depend on the day:
 * the router only keys its cache by one and hands it to a routing plugin,
 * which a hike never asks.
 */
const ANY_DAY = 0;

/** A hike as planned: what the plan shows, and the whole line a tour created from it keeps. */
export interface PlannedHike {
  plan: HikePlan;
  /**
   * Every point of the routed line, each with its height or none with one;
   * null where no way was planned.
   */
  line: GeometryPoint[] | null;
}

/** What a plan asks for besides the way and its heights. */
export interface HikePlanOptions {
  /**
   * Whether the SAC grades are read (one more question to the router and the
   * trail grades): a proposal shows them, a hike being saved keeps none.
   */
  grades: boolean;
}

/** What went wrong, for the log. */
function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Why a router that gave no way gave none, in the plan's words. */
function whyNot(err: unknown): UnroutedHikePlan['why'] {
  return err instanceof RouteRefusal ? err.why : 'router_unavailable';
}

/**
 * A hike planned on the server the way the tour planner plans one in the
 * browser: the way on foot through its points under its hiking limit and
 * preferences (Valhalla only, through the router the road trip and the city
 * walks use, so its one paced queue and its choice of Valhalla hold), a point
 * the router had to move further onto a way than a tour allows named instead
 * of taken, the heights along the line, its length, climb, descent and the
 * walking time by the signposts' rule, and the SAC grades OpenStreetMap
 * records for the ways under it. Heights and grades are best effort: without
 * heights the line stays flat and its climb unknown, without grades the plan
 * says they could not be read. A way of more points than HIKE_MAX_LINE_POINTS
 * is not measured: its heights alone would hold the router's queue up for
 * every user. Writes nothing.
 */
@Injectable()
export class HikeRoutingService {
  constructor(
    private readonly router: RoadtripRouterService,
    private readonly trailGrades: TourTrailGradeService,
  ) {}

  async plan(
    userId: number,
    tripId: number,
    request: HikePlanRequest,
    { grades: withGrades }: HikePlanOptions = { grades: true },
  ): Promise<PlannedHike> {
    // The tools check their own requests; a change plans through the points a hike has saved, held here to the same.
    const checked = hikePlanRequestSchema.safeParse(request);
    if (!checked.success) throw badRequest(checked.error.issues.map((issue) => issue.message).join('; '));
    const limit = request.max_hiking_difficulty ?? TOURS_MAX_HIKING_DIFFICULTY;
    const preferences = hikingPreferencesOf(request.hiking_preferences);
    const unrouted = (why: UnroutedHikePlan['why'], position: number | null = null, snapped: number | null = null) => ({
      plan: { kind: 'unrouted' as const, max_hiking_difficulty: limit, why, position, snapped_m: snapped },
      line: null,
    });
    let route: RoadtripRoute;
    try {
      const points = request.waypoints.map(({ lat, lng }) => ({ lat, lng }));
      const costingOptions = hikingCosting(limit, preferences);
      route = await this.router.route(userId, tripId, ANY_DAY, points, 'walking', [], { costingOptions });
    } catch (err: unknown) {
      if (!(err instanceof RouteRefusal)) logWarn(`[Hike] no way for trip ${tripId}: ${reasonOf(err)}`);
      return unrouted(whyNot(err));
    }
    const snapped = route.snapped ?? [];
    const off = snapped.findIndex((point) => point.meters > TOUR_MAX_SNAP_M);
    if (off >= 0) return unrouted('point_off_the_way', off + 1, Math.round(snapped[off].meters));

    const flat = joinedLine(route.leg.line);
    if (flat.length > HIKE_MAX_LINE_POINTS) return unrouted('too_long');
    const lengthM = computeTourMetrics(flat).distanceKm * 1000;
    const [line, grades] = await Promise.all([
      this.withHeights(userId, flat),
      withGrades ? this.gradesOf(userId, flat, lengthM) : null,
    ]);
    const metrics = computeTourMetrics(line);
    const ascent = metrics.elevationGainM;
    const descent = metrics.elevationLossM;
    const heights = ascent !== null && descent !== null;
    return {
      plan: {
        kind: 'routed',
        max_hiking_difficulty: limit,
        hiking_preferences: preferences,
        distance_m: Math.round(lengthM),
        ascent_m: heights ? Math.round(ascent) : null,
        descent_m: heights ? Math.round(descent) : null,
        duration_minutes: heights
          ? hikingTimeMinutes(metrics.distanceKm, ascent, descent)
          : Math.round(route.leg.seg.duration / 60),
        duration_basis: heights ? 'din33466' : 'router',
        has_heights: heights,
        line: thinnedLine(line, HIKE_PLAN_LINE_POINTS),
        profile: profileOf(line, HIKE_PLAN_PROFILE_SAMPLES),
        grades,
      },
      line,
    };
  }

  /** The line with the height of every point, or as it was where the heights could not all be read. */
  private async withHeights(userId: number, flat: Array<[number, number]>): Promise<GeometryPoint[]> {
    try {
      return heightsOrNone(flat, await this.router.heights(userId, flat));
    } catch (err: unknown) {
      logWarn(`[Hike] no heights: ${reasonOf(err)}`);
      return heightsOrNone(flat, null);
    }
  }

  /**
   * The SAC grades along the line: the ways under it from the router, their
   * grades from OpenStreetMap. Null where either could not be read at all.
   */
  private async gradesOf(
    userId: number,
    flat: Array<[number, number]>,
    lengthM: number,
  ): Promise<HikeTrailGrades | null> {
    try {
      const ways = await this.router.wayIds(userId, flat);
      if (ways.length === 0) return null;
      const ids = gradableWayIds(ways, TOUR_TRAIL_GRADE_MAX_WAYS);
      const steps = new Map<number, SacStep>();
      if (ids.length > 0) {
        const answer = await this.trailGrades.grades({ way_ids: ids });
        if (answer.unanswered.length === ids.length) return null;
        for (const way of answer.ways) if (way.sac_scale) steps.set(way.id, sacStepOf(way.sac_scale));
      }
      return gradesAlong(ways, steps, lengthM);
    } catch (err: unknown) {
      logWarn(`[Hike] no trail grades: ${reasonOf(err)}`);
      return null;
    }
  }
}
