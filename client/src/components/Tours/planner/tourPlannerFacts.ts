import {
  MAX_PLANNED_TOUR_DURATION_MINUTES,
  tourWebsiteSchema,
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
    tourType: (tour.tour_type === 'kayak' ? 'kayak' : 'hike') as PlannableTourType,
  };
}

/** What the planner's facts are read from: the draft's fields and the route as last computed. */
export interface TourPlannerFactsInput {
  tourType: PlannableTourType;
  maxHikingDifficulty: TourMaxHikingDifficulty;
  /** MF-08: what the hike asks the router for besides its limit. */
  hikingPreferences: HikingPreferences | null;
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
  /** The router's own time, seconds; stands in for a hike until the heights are in. */
  durationSeconds: number | null;
}

function invalidMinutes(value: number | null): boolean {
  return value !== null && (!Number.isInteger(value) || value < 0 || value > MAX_PLANNED_TOUR_DURATION_MINUTES);
}

/**
 * What the planner derives from its draft, worked out in one place: whether
 * the fields hold, the times, and the fields the tour type adds to a save.
 * A paddle tour is timed on the water at its speed; a hike by the signposts'
 * rule over distance, climb and descent once the route has its heights, and
 * by the router's own time before that.
 */
export function tourPlannerFacts(input: TourPlannerFactsInput) {
  const isPaddle = input.tourType === 'kayak';
  const { paddleEstimate, routeAnalysis, durationSeconds, breakAdditionalMinutes, plannedDurationMinutes } = input;
  const walkingDurationMinutes = paddleEstimate
    ? paddleEstimate.waterMinutes === null
      ? null
      : paddleEstimate.estimateMinutes
    : routeAnalysis?.gain != null && routeAnalysis.loss != null
      ? hikingTimeMinutes(routeAnalysis.distanceKm, routeAnalysis.gain, routeAnalysis.loss)
      : durationSeconds === null
        ? null
        : Math.round(durationSeconds / 60);
  const automaticPlannedTotalMinutes =
    walkingDurationMinutes === null ? null : walkingDurationMinutes + (breakAdditionalMinutes ?? 0);
  const { boatType, waterContext, speedKmh, portageSpeedKmh, lakeStyle } = input.paddle;
  return {
    isPaddle,
    websiteInvalid: input.website.trim().length > 0 && !tourWebsiteSchema.safeParse(input.website).success,
    plannedDurationInvalid: invalidMinutes(plannedDurationMinutes),
    breakAdditionalInvalid: invalidMinutes(breakAdditionalMinutes),
    paddleIncomplete: isPaddle && (boatType === null || waterContext === null),
    walkingDurationMinutes,
    automaticPlannedTotalMinutes,
    plannedTotalMinutes: plannedDurationMinutes ?? automaticPlannedTotalMinutes,
    plannedTotalInvalid:
      plannedDurationMinutes === null &&
      automaticPlannedTotalMinutes !== null &&
      automaticPlannedTotalMinutes > MAX_PLANNED_TOUR_DURATION_MINUTES,
    // The router's own time stands in for a hike without heights; a paddle tour has only its speed.
    savedDurationSeconds:
      walkingDurationMinutes === null ? (isPaddle ? null : durationSeconds) : walkingDurationMinutes * 60,
    // What the type adds to a save: a hike its routing limit, a paddle tour its boat, water and speed.
    typeFields: isPaddle
      ? {
          tour_type: input.tourType,
          max_hiking_difficulty: null,
          boat_type: boatType,
          water_context: waterContext,
          paddle_speed_kmh: speedKmh,
          portage_speed_kmh: portageSpeedKmh,
          paddle_lake_style: lakeStyle,
          hiking_preferences: null,
        }
      : {
          tour_type: input.tourType,
          max_hiking_difficulty: input.maxHikingDifficulty,
          boat_type: null,
          water_context: null,
          paddle_speed_kmh: null,
          portage_speed_kmh: null,
          paddle_lake_style: null,
          hiking_preferences: input.hikingPreferences,
        },
  };
}

export type TourPlannerFacts = ReturnType<typeof tourPlannerFacts>;
