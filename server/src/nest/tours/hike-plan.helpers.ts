import { addStretch, metresAlong } from './hike-routing.helpers';
import type { PlannedHike } from './hike-routing.service';
import type { TourCreateCommand } from './tours.service';
import {
  haversineMetres,
  HIKE_PROPOSAL_SAC_SEGMENTS,
  hikingPreferencesOf,
  TOUR_MAX_SNAP_M,
  type GeometryPoint,
  type HikeCreateRequest,
  type HikePlan,
  type HikePlanPoint,
  type HikeProposal,
  type HikeProposalSac,
  type HikeProposeRequest,
  type HikeRouteOutcome,
  type HikeSacSegment,
  type HikeTrailGrades,
  type TourWaypoint,
  type UnroutedHikePlan,
} from '@trek/shared';

/**
 * The pure halves of a hike an assistant plans over MCP (HikePlanService):
 * the points it is planned through, the proposal shown from a plan, the way
 * a saved hike keeps from a plan, and the write a created hike makes.
 */

/** The points a hike is planned through: as asked, and for a round trip back to its start. */
export function hikePointsOf(waypoints: readonly HikePlanPoint[], roundTrip: boolean | undefined): HikePlanPoint[] {
  const [start] = waypoints;
  return roundTrip === true && start ? [...waypoints, { ...start }] : [...waypoints];
}

/** Whether the way was planned, and why not, as the answers name it. */
export function routeOutcomeOf(plan: HikePlan): HikeRouteOutcome {
  return plan.kind === 'routed' ? { planned: true } : { planned: false, why: plan.why, position: plan.position };
}

/** The points as a tour keeps them: in order, the first the start and the last the end, with their names. */
export function hikeWaypointsOf(points: readonly HikePlanPoint[]): TourWaypoint[] {
  const last = points.length - 1;
  return points.map(({ lat, lng, name }, sequence) => ({
    lat,
    lng,
    ...(name ? { name } : {}),
    role: sequence === 0 ? 'start' : sequence === last ? 'end' : 'via',
    sequence,
  }));
}

/** The way a saved hike keeps from a plan: its whole line and walking time, or none, and how the planning went. */
export interface KeptWay {
  line: GeometryPoint[] | null;
  seconds: number | null;
  route: HikeRouteOutcome;
}

/**
 * The way a hike is saved with from its plan, as the planner saves one: the
 * whole line with the height of every point, and its walking time. A way
 * whose heights could not all be read is not kept: the planner saves no
 * hike without them, and the router that did not answer for them is asked
 * again when the hike is next planned, so it reads as `router_unavailable`.
 */
export function keptWayOf({ plan, line }: PlannedHike): KeptWay {
  if (plan.kind === 'routed' && plan.has_heights && line) {
    return { line, seconds: plan.duration_minutes * 60, route: { planned: true } };
  }
  const route: HikeRouteOutcome =
    plan.kind === 'routed' ? { planned: false, why: 'router_unavailable', position: null } : routeOutcomeOf(plan);
  return { line: null, seconds: null, route };
}

/**
 * The write of a hike created from its points, the way the planner's save
 * writes one: the way it keeps (the whole line with its heights and its
 * walking time) and its routing limit. Without a way it is saved with its
 * points only, and the planner plans the way when it is opened.
 */
export function hikeCreateCommandOf(
  request: HikeCreateRequest,
  points: readonly HikePlanPoint[],
  way: KeptWay,
  limit: number,
): TourCreateCommand {
  return {
    name: request.name,
    description: request.description,
    tour_type: 'hike',
    route_geometry: way.line,
    duration_seconds: way.seconds,
    max_hiking_difficulty: limit,
    hiking_preferences: hikingPreferencesOf(request.hiking_preferences),
    ...(request.planned_duration_minutes !== undefined
      ? { planned_duration_minutes: request.planned_duration_minutes }
      : {}),
    waypoints: hikeWaypointsOf(points),
  };
}

/** How near a new point of a hike stands to a saved one to be the same point, in metres. */
const SAME_POINT_M = 25;

/** The saved point nearest to `point`, where one stands within SAME_POINT_M of it. */
function savedPointAt(point: { lat: number; lng: number }, saved: readonly TourWaypoint[]): TourWaypoint | undefined {
  let nearest: TourWaypoint | undefined;
  let nearestGap = Number.POSITIVE_INFINITY;
  for (const old of saved) {
    const gap = haversineMetres(point.lat, point.lng, old.lat, old.lng);
    if (gap <= SAME_POINT_M && gap < nearestGap) {
      nearest = old;
      nearestGap = gap;
    }
  }
  return nearest;
}

/**
 * New points as a hike keeps them, in order. A point that stands where a
 * saved one stood (within SAME_POINT_M, the nearest) is that point still: it
 * keeps its link to the trip's place it stands for, and its name where the
 * new one gives none. A saved point no new one stands on goes, with its link.
 */
export function repointedWaypoints(points: readonly HikePlanPoint[], saved: readonly TourWaypoint[]): TourWaypoint[] {
  return hikeWaypointsOf(points).map((point) => {
    const same = savedPointAt(point, saved);
    if (!same) return point;
    const name = point.name ?? same.name;
    return {
      ...point,
      ...(name ? { name } : {}),
      ...(same.linked_place_id ? { linked_place_id: same.linked_place_id } : {}),
    };
  });
}

/**
 * How much nearer than the nearest pass a later one may be and still lose to
 * an earlier one: a way that comes by a point twice (a summit walked up and
 * down the same path) places it on the first pass.
 */
const PASS_SLACK_M = 30;

/**
 * Where each point lies along the line, in metres: at the line's nearest
 * point at or after the one before it, so the points keep their order and a
 * round trip's end lies at the end of the way, not at its start.
 */
export function positionsAlong(line: readonly GeometryPoint[], points: readonly HikePlanPoint[]): number[] {
  const along = metresAlong(line);
  let from = 0;
  return points.map(({ lat, lng }) => {
    const gaps = line.slice(from).map(([pointLat, pointLng]) => haversineMetres(lat, lng, pointLat, pointLng));
    const nearest = gaps.reduce((low, gap) => Math.min(low, gap), Number.POSITIVE_INFINITY);
    from += Math.max(
      0,
      gaps.findIndex((gap) => gap <= nearest + PASS_SLACK_M),
    );
    return Math.round(along[from]);
  });
}

/** The lowest and highest point of a line with heights, in whole metres. */
export function heightRangeOf(line: readonly GeometryPoint[]): { min: number; max: number } | null {
  const heights = line.flatMap((point) => (point.length === 3 ? [point[2]] : []));
  if (heights.length === 0 || heights.length !== line.length) return null;
  return {
    min: Math.round(heights.reduce((low, height) => Math.min(low, height))),
    max: Math.round(heights.reduce((high, height) => Math.max(high, height))),
  };
}

/**
 * Neighbouring stretches joined in pairs, each pair taking the harder of its
 * grades, so a joined stretch never reads easier than a path in it. Only
 * stretches that touch are paired unless `acrossGaps`: a stretch of unknown
 * grade between two stays unknown, rather than read as either's grade.
 */
function pairedUp(segments: readonly HikeSacSegment[], acrossGaps: boolean): HikeSacSegment[] {
  const paired: HikeSacSegment[] = [];
  let held: HikeSacSegment | null = null;
  for (const segment of segments) {
    if (held && (acrossGaps || held.to_m === segment.from_m)) {
      addStretch(paired, { from_m: held.from_m, to_m: segment.to_m, sac: Math.max(held.sac, segment.sac) });
      held = null;
    } else {
      if (held) addStretch(paired, held);
      held = segment;
    }
  }
  if (held) addStretch(paired, held);
  return paired;
}

/**
 * The SAC grades a proposal shows: at most HIKE_PROPOSAL_SAC_SEGMENTS
 * stretches. Where a long way holds more, touching neighbours are joined in
 * pairs, the harder grade kept, until they fit; the stretches of unknown grade
 * between stay as they are. Only a way with more graded stretches than that,
 * each apart from the next, has them joined over the gaps as well. How much
 * of the line is unknown stays as measured.
 */
export function proposalSacOf(grades: HikeTrailGrades | null): HikeProposalSac | null {
  if (!grades) return null;
  let segments = grades.segments.reduce<HikeSacSegment[]>(addStretch, []);
  while (segments.length > HIKE_PROPOSAL_SAC_SEGMENTS) {
    const touching = pairedUp(segments, false);
    segments = touching.length < segments.length ? touching : pairedUp(segments, true);
  }
  return { highest: grades.highest, segments, unknown_share: grades.unknown_share };
}

/** Where a point lies further from any way than a tour allows: which one, and how far the router had to move it. */
function unreachableOf(plan: HikePlan): HikeProposal['unreachable'] {
  if (plan.kind !== 'unrouted' || plan.position === null || plan.snapped_m === null) return null;
  return { position: plan.position, snapped_m: plan.snapped_m };
}

/**
 * The proposal of a hike as a plan gives it: the way and its measures, its
 * profile and grades, each point with where it lies along the way, and the
 * request's own words given back. Without a way the points are still shown,
 * with why there is none.
 */
export function hikeProposalOf(
  request: HikeProposeRequest,
  points: readonly HikePlanPoint[],
  { plan, line }: PlannedHike,
): HikeProposal {
  const routed = plan.kind === 'routed' ? plan : null;
  const positions = routed && line ? positionsAlong(line, points) : null;
  const heights = routed?.has_heights && line ? heightRangeOf(line) : null;
  return {
    name: request.name ?? null,
    variant_label: request.variant_label ?? null,
    route: routeOutcomeOf(plan),
    unreachable: unreachableOf(plan),
    distance_m: routed?.distance_m ?? null,
    ascent_m: routed?.ascent_m ?? null,
    descent_m: routed?.descent_m ?? null,
    duration_minutes: routed?.duration_minutes ?? null,
    duration_basis: routed?.duration_basis ?? null,
    heights_known: heights !== null,
    min_ele_m: heights?.min ?? null,
    max_ele_m: heights?.max ?? null,
    line: routed?.line ?? [],
    profile: routed?.profile ?? [],
    sac: proposalSacOf(routed?.grades ?? null),
    waypoints: points.map(({ lat, lng, name }, index) => ({
      lat,
      lng,
      name: name || null,
      at_m: positions?.[index] ?? null,
    })),
    max_hiking_difficulty: plan.max_hiking_difficulty,
    hiking_preferences: routed ? routed.hiking_preferences : hikingPreferencesOf(request.hiking_preferences),
    round_trip: request.round_trip === true,
    date: request.date ?? null,
    start_time: request.start_time ?? null,
  };
}

/** Why no way was planned, in words that say what to do about it. */
const UNPLANNED: Readonly<Record<UnroutedHikePlan['why'], (position: number | null) => string>> = {
  no_valhalla: () =>
    'TREK has no Valhalla router here to plan a hike with (a routing server of its own knows no hiking limit).',
  router_unavailable: () => 'The router did not answer, for the way or for its heights; try again in a moment.',
  no_way: () => 'No way within the hiking limit joins these points: raise the limit or move the points.',
  point_off_the_way: (position) =>
    `Point ${position ?? ''} is further than ${TOUR_MAX_SNAP_M} m from any way: move it onto a path.`,
  too_long: () => 'The way is too long to plan as one hike: split it into shorter hikes.',
};

type Unplanned = Pick<UnroutedHikePlan, 'why' | 'position'>;

/** The refusal of a hike whose way could not be planned for a reason the planner would meet too: nothing is saved. */
export function unplannedCreateMessage({ why, position }: Unplanned): string {
  return `${UNPLANNED[why](position)} Nothing was saved.`;
}

/** The refusal of a change whose new way could not be planned: the hike keeps the way it has. */
export function unplannedChangeMessage({ why, position }: Unplanned): string {
  return `${UNPLANNED[why](position)} Nothing was saved and the hike keeps its way.`;
}
