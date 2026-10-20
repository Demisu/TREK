import {
  bikeProfileSchema,
  hikingPreferencesSchema,
  MAX_PLANNED_TOUR_DURATION_MINUTES,
  paddleLockSchema,
  plannableTourTypeSchema,
  runProfileSchema,
  winterActivitySchema,
  type BikeProfile,
  type HikingPreferences,
  type PlannableTourType,
  type RunProfile,
  type TourMaxHikingDifficulty,
  type WinterActivity,
} from '@trek/shared';
import type { TourPlannerWaypoint } from './tourPlannerWaypoints';
import type { PaddleFieldValues } from './usePaddleFields';

/** CW-07: where a draft's points were read from outside the trip, said in the planner until it is saved. */
export type DraftSource = 'google_maps';

/**
 * The tour planner's draft as it is kept in local storage between visits, and
 * the check a stored draft has to pass before the planner takes it back: a
 * draft from an older version, or one edited by hand, is dropped rather than
 * half read.
 */
export interface DraftPayload {
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  name: string;
  description?: string;
  website?: string;
  plannedDurationMinutes?: number | null;
  breakAdditionalMinutes?: number | null;
  waypoints: TourPlannerWaypoint[];
  maxHikingDifficulty?: TourMaxHikingDifficulty;
  editingPlaceId?: number | null;
  /** The import a new tour is being planned from; carried until it is saved. */
  derivedFromPlaceId?: number | null;
  /** CW-07: a draft loaded from a Google Maps walk keeps saying so across a reload. */
  draftSource?: DraftSource | null;
  tourType?: PlannableTourType;
  paddle?: PaddleFieldValues;
  /** P2C-03: the revision of the tour the draft edits, as it was loaded. */
  baseRevision?: number | null;
  /** MF-08: what the hike asks the router for besides its limit. */
  hikingPreferences?: HikingPreferences | null;
  /** BIK-01: the profile a bike tour is routed for. */
  bikeProfile?: BikeProfile;
  /** HIK-01: the hike's winter label; absent in a draft older than it. */
  winterActivity?: WinterActivity | null;
  /** RUN-01: the profile a run is routed for, and its pace in seconds per km; absent in a draft older than them. */
  runProfile?: RunProfile;
  runPaceSecondsPerKm?: number | null;
}

const DRAFT_VERSIONS: ReadonlyArray<DraftPayload['version']> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalMinutes(value: number | null | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    (Number.isInteger(value) && value >= 0 && value <= MAX_PLANNED_TOUR_DURATION_MINUTES)
  );
}

function optionalPlaceId(value: number | null | undefined): boolean {
  return value == null || (Number.isInteger(value) && value > 0);
}

function optionalSource(value: unknown): boolean {
  return value == null || value === 'google_maps';
}

function optionalDifficulty(value: number | null | undefined): boolean {
  return value == null || (Number.isInteger(value) && value >= 1 && value <= 6);
}

function validDraftWaypoint(point: TourPlannerWaypoint): boolean {
  return (
    !!point &&
    typeof point.id === 'string' &&
    Number.isFinite(point.lat) &&
    Math.abs(point.lat) <= 90 &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lng) <= 180 &&
    (point.lock == null || paddleLockSchema.safeParse(point.lock).success) &&
    (point.stageEnd === undefined || typeof point.stageEnd === 'boolean')
  );
}

/**
 * RUN-01: a run's pace as a draft keeps it, whole seconds. Text that was no
 * pace yet (NaN in the planner) is written as JSON null and comes back as none.
 */
function optionalPace(value: number | null | undefined): boolean {
  return value == null || (Number.isInteger(value) && value > 0);
}

/** The type of a draft, what its route is planned by and its winter label, each one absent in a draft older than it. */
function validRouteChoices(draft: Partial<DraftPayload>): boolean {
  return (
    (draft.tourType === undefined || plannableTourTypeSchema.safeParse(draft.tourType).success) &&
    (draft.bikeProfile === undefined || bikeProfileSchema.safeParse(draft.bikeProfile).success) &&
    (draft.runProfile === undefined || runProfileSchema.safeParse(draft.runProfile).success) &&
    optionalPace(draft.runPaceSecondsPerKm) &&
    (draft.hikingPreferences == null || hikingPreferencesSchema.safeParse(draft.hikingPreferences).success) &&
    (draft.winterActivity == null || winterActivitySchema.safeParse(draft.winterActivity).success) &&
    optionalDifficulty(draft.maxHikingDifficulty)
  );
}

export function validDraft(value: unknown): value is DraftPayload {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<DraftPayload>;
  return (
    draft.version !== undefined &&
    DRAFT_VERSIONS.includes(draft.version) &&
    typeof draft.name === 'string' &&
    optionalString(draft.description) &&
    optionalString(draft.website) &&
    optionalMinutes(draft.plannedDurationMinutes) &&
    optionalMinutes(draft.breakAdditionalMinutes) &&
    optionalPlaceId(draft.editingPlaceId) &&
    optionalPlaceId(draft.derivedFromPlaceId) &&
    optionalSource(draft.draftSource) &&
    optionalPlaceId(draft.baseRevision) &&
    validRouteChoices(draft) &&
    Array.isArray(draft.waypoints) &&
    draft.waypoints.every(validDraftWaypoint)
  );
}
