import type {
  BikeProfile,
  HikingPreferences,
  PaddleBoatType,
  PaddleLakeStyle,
  PlannableTourType,
  RunProfile,
  TourMaxHikingDifficulty,
} from '@trek/shared';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { randomId } from '../../../utils/randomId';
import { planPaddleStep, type PaddleTourRoute } from './paddleRouting';
import {
  normalizePlannerWaypoints,
  routeInputsKey,
  tourWaypointKey,
  type TourPlannerWaypoint,
} from './tourPlannerWaypoints';
import { isTourRoute, type TourRouteUnreachable } from './tourRouteOutcome';
import {
  enrichTourElevations,
  rideTour,
  routeBikeTour,
  routeCityWalk,
  routeRun,
  routeWalkingTour,
  type TourElevationPoint,
  type TourRoutePart,
} from './tourRouting';
import type { TourPlannerStatus } from './useTourPlanner';

const ROUTE_DEBOUNCE_MS = 450;

/** What the route of a draft is planned from: its points, its type and the choices the router is asked for. */
export interface TourRouteInputs {
  tripId: number | string;
  waypoints: TourPlannerWaypoint[];
  tourType: PlannableTourType;
  maxHikingDifficulty: TourMaxHikingDifficulty;
  hikingPreferences: HikingPreferences | null;
  bikeProfile: BikeProfile;
  /** RUN-01: the profile a run is routed for. */
  runProfile: RunProfile;
  paddleBoat: PaddleBoatType | null;
  paddleLakeStyle: PaddleLakeStyle;
  /** Raised to plan the same points again. */
  retryToken: number;
  /** The planner's error, so a point found unreachable is only named while that is the error. */
  error: string | null;
  setStatus: Dispatch<SetStateAction<TourPlannerStatus>>;
  setError: (error: string | null) => void;
  onCleared: () => void;
  /** Points the router set itself (a paddle tour's), laid in without a step of the history. */
  patchWaypoints: (next: TourPlannerWaypoint[]) => void;
}

/** A route as planned, and what it was planned for (`forKey`). */
interface PlannedRoute {
  route: [number, number][] | null;
  routeParts: TourRoutePart[] | null;
  paddleRoute: PaddleTourRoute | null;
  enrichedGeometry: TourElevationPoint[] | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  forKey: string | null;
  /** The run it was planned in: its points with what was planned along them, its choices and the retry. */
  forRun: string | null;
}

const NO_ROUTE: PlannedRoute = {
  route: null,
  routeParts: null,
  paddleRoute: null,
  enrichedGeometry: null,
  distanceMeters: null,
  durationSeconds: null,
  forKey: null,
  forRun: null,
};

/** A route planned whole: a paddle route without a failed leg, a route on land with its heights. */
function routeComplete(planned: PlannedRoute): boolean {
  return planned.paddleRoute
    ? planned.paddleRoute.failures.length === 0
    : hasCompleteElevation(planned.enrichedGeometry);
}

/** One planning run: what it plans from, whether it went stale, and where it writes. */
interface RouteRun {
  inputs: Omit<TourRouteInputs, 'retryToken' | 'error' | 'onCleared'>;
  plannedKey: string;
  runKey: string;
  signal: AbortSignal;
  stale: () => boolean;
  setPlanned: (next: PlannedRoute | ((current: PlannedRoute) => PlannedRoute)) => void;
  setUnreachable: (unreachable: TourRouteUnreachable | null) => void;
}

// PAD-11: a paddle tour is planned on the water by the server's router; its heights are no concern.
async function routePaddle({ inputs, plannedKey, runKey, signal, stale, setPlanned }: RouteRun) {
  const { waypoints, tripId, paddleBoat, paddleLakeStyle, setStatus, setError } = inputs;
  setStatus('routing');
  const profile = { boat: paddleBoat ?? 'kayak', lakeStyle: paddleLakeStyle } as const;
  const step = await planPaddleStep(waypoints, tripId, profile, signal, randomId);
  if (stale()) return;
  if ('points' in step) return inputs.patchWaypoints(normalizePlannerWaypoints(step.points, 'kayak'));
  const planned = step.route;
  setPlanned({
    route: planned.coordinates,
    routeParts: planned.parts,
    paddleRoute: planned,
    enrichedGeometry: planned.coordinates.map(([lat, lng]): [number, number, number] => [lat, lng, 0]),
    distanceMeters: planned.distanceMeters,
    durationSeconds: null,
    forKey: plannedKey,
    forRun: runKey,
  });
  const failed = planned.failures.length > 0;
  setStatus(failed ? 'routing-failed' : 'ready');
  setError(failed ? 'paddle-route' : null);
}

/**
 * A route on land for the type of the draft: a bike tour and a run for their
 * profile, a city walk, a hike within its limit, and a ride (HOR-01) put
 * together from its sections, never routed.
 */
async function routeLand(inputs: RouteRun['inputs'], signal: AbortSignal) {
  const { waypoints, tourType, bikeProfile, runProfile, maxHikingDifficulty, hikingPreferences } = inputs;
  if (tourType === 'horse') return rideTour(waypoints);
  if (tourType === 'bike') return await routeBikeTour(waypoints, bikeProfile, signal);
  if (tourType === 'run') return await routeRun(waypoints, runProfile, signal);
  if (tourType === 'walk') return await routeCityWalk(waypoints, signal);
  return await routeWalkingTour(waypoints, signal, maxHikingDifficulty, hikingPreferences);
}

// A hike, a run, a city walk, a bike tour or a ride on land, then the heights along it.
async function routeOnLand({ inputs, plannedKey, runKey, signal, stale, setPlanned, setUnreachable }: RouteRun) {
  const { setStatus, setError } = inputs;
  setStatus('routing');
  const routed = await routeLand(inputs, signal);
  if (stale()) return;
  if (!isTourRoute(routed)) {
    setUnreachable(routed);
    setStatus('routing-failed');
    setError(routed ? 'unreachable' : 'routing');
    return;
  }
  setUnreachable(null);
  setPlanned({
    route: routed.coordinates,
    routeParts: routed.parts,
    paddleRoute: null,
    enrichedGeometry: null,
    distanceMeters: routed.distanceMeters,
    durationSeconds: routed.durationSeconds,
    forKey: plannedKey,
    forRun: runKey,
  });
  setStatus('enriching-elevation');

  const enriched = await enrichTourElevations(routed.coordinates, signal);
  if (stale()) return;
  if (enriched) setPlanned((current) => ({ ...current, enrichedGeometry: enriched }));
  if (!hasCompleteElevation(enriched)) {
    setStatus('elevation-failed');
    setError('elevation');
    return;
  }
  setStatus('ready');
  setError(null);
}

/**
 * Plans a run a moment from now, on the water or on land; a failure that is
 * still the current run says the route could not be planned. Returns the way
 * to call it off before it starts.
 */
function scheduleRoute(run: RouteRun): () => void {
  const timer = window.setTimeout(() => {
    (run.inputs.tourType === 'kayak' ? routePaddle(run) : routeOnLand(run)).catch(() => {
      if (run.stale()) return;
      run.inputs.setStatus('routing-failed');
      run.inputs.setError('routing');
    });
  }, ROUTE_DEBOUNCE_MS);
  return () => window.clearTimeout(timer);
}

/**
 * The route of the planner's draft, planned again a moment after its points
 * or its choices change: a hike on foot within its limit, a bike tour and a
 * run for their profile (BIK-01, RUN-01), a paddle tour on the water by the
 * server's router, a ride put together from its horse route sections and
 * manual legs (HOR-01). Every tour on land then gets its heights; a later
 * change makes an answer still on its way stale, and a failure keeps the last
 * route that was planned.
 */
export function useTourRoute(inputs: TourRouteInputs) {
  const {
    tripId,
    waypoints,
    tourType,
    maxHikingDifficulty,
    hikingPreferences,
    bikeProfile,
    runProfile,
    paddleBoat,
    paddleLakeStyle,
    retryToken,
    error,
    setStatus,
    setError,
    onCleared,
    patchWaypoints,
  } = inputs;
  const [planned, setPlanned] = useState<PlannedRoute>(NO_ROUTE);
  // A point no way of the tour's type reaches, and how far off the router would have bound it.
  const [unreachable, setUnreachable] = useState<TourRouteUnreachable | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  /** Any answer still on its way is stale from here on. */
  const interruptRouting = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /** No route at all, as for an empty draft. */
  const clearRoute = useCallback(() => setPlanned(NO_ROUTE), []);

  const waypointKey = useMemo(() => tourWaypointKey(waypoints), [waypoints]);
  // What a route was planned for besides its points: a route of another type or profile is not this one's.
  const choices = [
    tourType,
    bikeProfile,
    runProfile,
    maxHikingDifficulty,
    hikingPreferences,
    paddleBoat,
    paddleLakeStyle,
  ];
  const plannedKey = `${waypointKey}#${JSON.stringify(choices)}`;
  // CW-02, CW-03: a station's own fields and the keys a save answered are no part of what a route is planned from,
  // so a change to them alone plans nothing again.
  const routeInputs = useMemo(() => routeInputsKey(waypoints), [waypoints]);
  const runKey = `${plannedKey}#${routeInputs}#${retryToken}`;
  // The points as they are when a run starts, their station fields included, read without making them a reason to run.
  const currentPoints = useEffectEvent(() => waypoints);
  // The route shown was planned whole for exactly this run, so a change that leaves it as it is plans nothing again.
  const routeStands = useEffectEvent(() => planned.forRun === runKey && routeComplete(planned));

  useEffect(() => {
    const points = currentPoints();
    if (points.length < 2) {
      interruptRouting();
      setStatus(points.length === 0 ? 'empty' : 'dirty');
      clearRoute();
      onCleared();
      setError(null);
      return;
    }
    if (routeStands()) {
      setStatus((current) => (current === 'dirty' ? 'ready' : current));
      return;
    }

    const generation = ++generationRef.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const stale = () => controller.signal.aborted || generation !== generationRef.current;
    const run: RouteRun = {
      inputs: {
        tripId,
        waypoints: points,
        tourType,
        maxHikingDifficulty,
        hikingPreferences,
        bikeProfile,
        runProfile,
        paddleBoat,
        paddleLakeStyle,
        setStatus,
        setError,
        patchWaypoints,
      },
      plannedKey,
      runKey,
      signal: controller.signal,
      stale,
      setPlanned,
      setUnreachable,
    };

    const cancelTimer = scheduleRoute(run);
    return () => {
      cancelTimer();
      controller.abort();
    };
  }, [
    bikeProfile,
    clearRoute,
    hikingPreferences,
    interruptRouting,
    maxHikingDifficulty,
    onCleared,
    paddleBoat,
    paddleLakeStyle,
    patchWaypoints,
    plannedKey,
    retryToken,
    routeInputs,
    runKey,
    runProfile,
    setError,
    setStatus,
    tourType,
    tripId,
  ]);

  const { forKey, forRun: _run, ...shown } = planned;
  return {
    ...shown,
    /** The route shown was planned for these points and these choices. */
    routeCurrent: forKey === plannedKey,
    unreachable: error === 'unreachable' ? unreachable : null,
    interruptRouting,
    clearRoute,
  };
}

export function hasCompleteElevation(points: TourElevationPoint[] | null): points is [number, number, number][] {
  return !!points && points.every((point) => point.length === 3 && Number.isFinite(point[2]));
}
