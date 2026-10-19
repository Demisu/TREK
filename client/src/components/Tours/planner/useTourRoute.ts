import type {
  BikeProfile,
  HikingPreferences,
  PaddleBoatType,
  PaddleLakeStyle,
  PlannableTourType,
  TourMaxHikingDifficulty,
} from '@trek/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { randomId } from '../../../utils/randomId';
import { planPaddleStep, type PaddleTourRoute } from './paddleRouting';
import { normalizePlannerWaypoints, tourWaypointKey, type TourPlannerWaypoint } from './tourPlannerWaypoints';
import { isTourRoute, type TourRouteUnreachable } from './tourRouteOutcome';
import {
  enrichTourElevations,
  routeBikeTour,
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
  paddleBoat: PaddleBoatType | null;
  paddleLakeStyle: PaddleLakeStyle;
  /** Raised to plan the same points again. */
  retryToken: number;
  /** The planner's error, so a point found unreachable is only named while that is the error. */
  error: string | null;
  setStatus: (status: TourPlannerStatus) => void;
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
}

const NO_ROUTE: PlannedRoute = {
  route: null,
  routeParts: null,
  paddleRoute: null,
  enrichedGeometry: null,
  distanceMeters: null,
  durationSeconds: null,
  forKey: null,
};

/** One planning run: what it plans from, whether it went stale, and where it writes. */
interface RouteRun {
  inputs: Omit<TourRouteInputs, 'retryToken' | 'error' | 'onCleared'>;
  plannedKey: string;
  signal: AbortSignal;
  stale: () => boolean;
  setPlanned: (next: PlannedRoute | ((current: PlannedRoute) => PlannedRoute)) => void;
  setUnreachable: (unreachable: TourRouteUnreachable | null) => void;
}

// PAD-11: a paddle tour is planned on the water by the server's router; its heights are no concern.
async function routePaddle({ inputs, plannedKey, signal, stale, setPlanned }: RouteRun) {
  const { waypoints, tripId, paddleBoat, paddleLakeStyle, setStatus, setError } = inputs;
  setStatus('routing');
  const profile = { boat: paddleBoat ?? 'kayak', lakeStyle: paddleLakeStyle } as const;
  const step = await planPaddleStep(waypoints, tripId, profile, signal, randomId);
  if (stale()) return;
  if ('points' in step) return inputs.patchWaypoints(normalizePlannerWaypoints(step.points, true));
  const planned = step.route;
  setPlanned({
    route: planned.coordinates,
    routeParts: planned.parts,
    paddleRoute: planned,
    enrichedGeometry: planned.coordinates.map(([lat, lng]): [number, number, number] => [lat, lng, 0]),
    distanceMeters: planned.distanceMeters,
    durationSeconds: null,
    forKey: plannedKey,
  });
  const failed = planned.failures.length > 0;
  setStatus(failed ? 'routing-failed' : 'ready');
  setError(failed ? 'paddle-route' : null);
}

// A hike or a bike tour on land, then the heights along it.
async function routeOnLand({ inputs, plannedKey, signal, stale, setPlanned, setUnreachable }: RouteRun) {
  const { waypoints, tourType, bikeProfile, maxHikingDifficulty, hikingPreferences, setStatus, setError } = inputs;
  setStatus('routing');
  const routed =
    tourType === 'bike'
      ? await routeBikeTour(waypoints, bikeProfile, signal)
      : await routeWalkingTour(waypoints, signal, maxHikingDifficulty, hikingPreferences);
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
 * The route of the planner's draft, planned again a moment after its points
 * or its choices change: a hike on foot within its limit, a bike tour for its
 * profile (BIK-01), a paddle tour on the water by the server's router. A hike
 * and a bike tour then get their heights; a later change makes an answer
 * still on its way stale, and a failure keeps the last route that was planned.
 */
export function useTourRoute(inputs: TourRouteInputs) {
  const {
    tripId,
    waypoints,
    tourType,
    maxHikingDifficulty,
    hikingPreferences,
    bikeProfile,
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
  const choices = [tourType, bikeProfile, maxHikingDifficulty, hikingPreferences, paddleBoat, paddleLakeStyle];
  const plannedKey = `${waypointKey}#${JSON.stringify(choices)}`;

  useEffect(() => {
    if (waypoints.length < 2) {
      interruptRouting();
      setStatus(waypoints.length === 0 ? 'empty' : 'dirty');
      clearRoute();
      onCleared();
      setError(null);
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
        waypoints,
        tourType,
        maxHikingDifficulty,
        hikingPreferences,
        bikeProfile,
        paddleBoat,
        paddleLakeStyle,
        setStatus,
        setError,
        patchWaypoints,
      },
      plannedKey,
      signal: controller.signal,
      stale,
      setPlanned,
      setUnreachable,
    };

    const timer = window.setTimeout(() => {
      (tourType === 'kayak' ? routePaddle(run) : routeOnLand(run)).catch(() => {
        if (stale()) return;
        setStatus('routing-failed');
        setError('routing');
      });
    }, ROUTE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
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
    setError,
    setStatus,
    tourType,
    tripId,
    waypoints,
  ]);

  const { forKey, ...shown } = planned;
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
