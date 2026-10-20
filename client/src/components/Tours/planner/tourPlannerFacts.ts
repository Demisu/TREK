import {
  MAX_PLANNED_TOUR_DURATION_MINUTES,
  plannableTourTypeSchema,
  tourWebsiteSchema,
  type BikeProfile,
  type HikingPreferences,
  type PaddleBoatType,
  type PaddleLakeStyle,
  type PaddleWaterContext,
  type PlannableTourType,
  type TourListItem,
  type TourMaxHikingDifficulty,
} from '@trek/shared';
import type { RouteGeometryAnalysis } from '../../../utils/routeGeometry';
import { hikingTimeMinutes } from '../hikingTime';
import { walkTimesOf, type WalkTimes } from './stationModel';

/** The editable fields of a saved tour as the planner opens them, each with its empty value. */
export function openedTourFields(tour: TourListItem) {
  return {
    name: tour.name,
    description: tour.description ?? '',
    website: tour.website ?? '',
    plannedDurationMinutes: tour.planned_duration_minutes ?? null,
    breakAdditionalMinutes: tour.break_additional_minutes ?? null,
    difficulty: tour.max_hiking_difficulty ?? 2,
    preferences: tour.hiking_preferences ?? null,
    // A type nobody can plan (an import of another kind) opens as a hike, as it always has.
    tourType: plannableTourTypeSchema.catch('hike').parse(tour.tour_type) as PlannableTourType,
    bikeProfile: (tour.bike_profile ?? 'touring') as BikeProfile,
  };
}

/** What the planner's facts are read from: the draft's fields and the route as last computed. */
export interface TourPlannerFactsInput {
  tourType: PlannableTourType;
  maxHikingDifficulty: TourMaxHikingDifficulty;
  /** MF-08: what the hike asks the router for besides its limit. */
  hikingPreferences: HikingPreferences | null;
  /** BIK-01: the profile a bike tour is routed for. */
  bikeProfile: BikeProfile;
  website: string;
  plannedDurationMinutes: number | null;
  breakAdditionalMinutes: number | null;
  paddle: {
    boatType: PaddleBoatType | null;
    waterContext: PaddleWaterContext | null;
    speedKmh: number | null;
    portageSpeedKmh: number | null;
    lakeStyle: PaddleLakeStyle | null;
  };
  paddleSpeedInvalid: boolean;
  /** A paddle tour's estimate on the water; null for a hike. */
  paddleEstimate: { waterMinutes: number | null; estimateMinutes: number | null } | null;
  routeAnalysis: RouteGeometryAnalysis | null;
  /**
   * CW-02: a city walk's stays as far as known, and of how many stations; null
   * for any other type, which takes its breaks.
   */
  stays?: Pick<WalkTimes, 'stayMinutes' | 'unknownStays' | 'stations'> | null;
  /** The router's own time, seconds: a bike tour's riding time; stands in for a hike until the heights are in. */
  durationSeconds: number | null;
}

function invalidMinutes(value: number | null): boolean {
  return value !== null && (!Number.isInteger(value) || value < 0 || value > MAX_PLANNED_TOUR_DURATION_MINUTES);
}

/**
 * The time on the move: a paddle tour on the water at its speed, a bike tour
 * by the router, which rides the profile at its speed and weighs the climbs, a
 * hike by the signposts' rule over distance, climb and descent once the route
 * has its heights, and by the router's own time before that.
 */
function movingMinutes(input: TourPlannerFactsInput, routerMinutes: number | null): number | null {
  const { paddleEstimate, routeAnalysis } = input;
  if (paddleEstimate) return paddleEstimate.waterMinutes === null ? null : paddleEstimate.estimateMinutes;
  // A bike tour is timed by the router for its profile, a city walk by the router on foot.
  if (input.tourType === 'bike' || input.tourType === 'walk') return routerMinutes;
  return routeAnalysis?.gain != null && routeAnalysis.loss != null
    ? hikingTimeMinutes(routeAnalysis.distanceKm, routeAnalysis.gain, routeAnalysis.loss)
    : routerMinutes;
}

/**
 * CW-02: a city walk's times, the total its overview shows. Its stops are its
 * stays and it has no breaks on top, so nothing counts twice; the stays entered
 * count even while the walking time is not known. Null for any other type.
 */
function walkTimesFor(input: TourPlannerFactsInput, walkingMinutes: number | null): WalkTimes | null {
  if (input.tourType !== 'walk') return null;
  return walkTimesOf({ stayMinutes: 0, unknownStays: 0, stations: 0, ...input.stays, walkingMinutes });
}

/** What the type adds to a save: a hike its routing limit, a bike tour its profile, a paddle tour its boat, water and speed. */
function typeFieldsOf(input: TourPlannerFactsInput) {
  const isBike = input.tourType === 'bike';
  if (input.tourType === 'kayak') {
    const { boatType, waterContext, speedKmh, portageSpeedKmh, lakeStyle } = input.paddle;
    return {
      tour_type: input.tourType,
      max_hiking_difficulty: null,
      bike_profile: null,
      boat_type: boatType,
      water_context: waterContext,
      paddle_speed_kmh: speedKmh,
      portage_speed_kmh: portageSpeedKmh,
      paddle_lake_style: lakeStyle,
      hiking_preferences: null,
    };
  }
  const isHike = input.tourType === 'hike';
  return {
    tour_type: input.tourType,
    max_hiking_difficulty: isHike ? input.maxHikingDifficulty : null,
    bike_profile: isBike ? input.bikeProfile : null,
    boat_type: null,
    water_context: null,
    paddle_speed_kmh: null,
    portage_speed_kmh: null,
    paddle_lake_style: null,
    hiking_preferences: isHike ? input.hikingPreferences : null,
  };
}

/**
 * What the planner derives from its draft, worked out in one place: whether
 * the fields hold, the times, and the fields the tour type adds to a save.
 */
export function tourPlannerFacts(input: TourPlannerFactsInput) {
  const isPaddle = input.tourType === 'kayak';
  const { durationSeconds, breakAdditionalMinutes, plannedDurationMinutes } = input;
  const routerMinutes = durationSeconds === null ? null : Math.round(durationSeconds / 60);
  const walkingDurationMinutes = movingMinutes(input, routerMinutes);
  const walk = walkTimesFor(input, walkingDurationMinutes);
  const withBreaks = walkingDurationMinutes === null ? null : walkingDurationMinutes + (breakAdditionalMinutes ?? 0);
  const automaticPlannedTotalMinutes = walk ? walk.totalMinutes : withBreaks;
  const { boatType, waterContext } = input.paddle;
  return {
    isPaddle,
    websiteInvalid: input.website.trim().length > 0 && !tourWebsiteSchema.safeParse(input.website).success,
    plannedDurationInvalid: invalidMinutes(plannedDurationMinutes),
    // A city walk sends no breaks (CW-02), so one left from another type cannot hold its save up.
    breakAdditionalInvalid: input.tourType !== 'walk' && invalidMinutes(breakAdditionalMinutes),
    paddleIncomplete: isPaddle && (boatType === null || waterContext === null),
    walkingDurationMinutes,
    /** CW-02: a city walk's walking time, stays and total; null for any other type. */
    stationStays: walk,
    automaticPlannedTotalMinutes,
    plannedTotalMinutes: plannedDurationMinutes ?? automaticPlannedTotalMinutes,
    plannedTotalInvalid:
      plannedDurationMinutes === null &&
      automaticPlannedTotalMinutes !== null &&
      automaticPlannedTotalMinutes > MAX_PLANNED_TOUR_DURATION_MINUTES,
    // A city walk's stops are its stays: it saves no breaks, so a cafe never counts as a stay and a break at once.
    savedBreakAdditionalMinutes: input.tourType === 'walk' ? null : breakAdditionalMinutes,
    // The router's own time stands in for a hike without heights; a paddle tour has only its speed.
    savedDurationSeconds:
      walkingDurationMinutes === null ? (isPaddle ? null : durationSeconds) : walkingDurationMinutes * 60,
    typeFields: typeFieldsOf(input),
  };
}
