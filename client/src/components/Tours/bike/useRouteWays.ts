import { TOUR_TRAIL_GRADE_MAX_WAYS, type BikeProfile, type TourTrailGrade } from '@trek/shared';
import { useCallback, useEffect, useState } from 'react';
import { useNetworkMode } from '../../../hooks/useNetworkMode';
import { OnlineOnlyError } from '../../../repo/onlineOnly';
import { tourTrailGradeRepo } from '../../../repo/tourTrailGradeRepo';
import { useTourRouteHighlightStore } from '../../../store/tourRouteHighlightStore';
import { valhallaTraceAttributes } from '../../Map/valhallaRoute';
import { routeWaysFrom, wayIdsOf, type RouteWays } from './routeWays';

/** How long a route has to stay before its ways are asked about, so a route being shaped asks once. */
const SETTLE_MS = 600;

export type RouteWaysStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'offline';

export interface TrailGrades {
  status: 'loading' | 'ready' | 'failed' | 'offline';
  byWay: ReadonlyMap<number, TourTrailGrade>;
  /** Ways the data could not be asked about: their grade is unknown, not absent. */
  unasked: ReadonlySet<number>;
}

export interface RouteWaysState {
  status: RouteWaysStatus;
  ways: RouteWays | null;
  /** BIK-05, a mountain bike tour's only: the trail grades of its ways. */
  grades: TrailGrades | null;
}

interface Answer extends RouteWaysState {
  attempt: number;
  /** The route and the question it answers; another one makes it stale. */
  route: [number, number][];
  withGrades: boolean;
}

const IDLE: RouteWaysState = { status: 'idle', ways: null, grades: null };
const NO_GRADES = { byWay: new Map<number, TourTrailGrade>(), unasked: new Set<number>() };

/** The ways of a route, and for a mountain bike tour their grades; the grades' outcome as it came. */
async function askRouteWays(
  tripId: number | string,
  route: [number, number][],
  withGrades: boolean,
  signal: AbortSignal,
  onWays: (ways: RouteWays) => void
): Promise<RouteWaysState> {
  const ways = routeWaysFrom(await valhallaTraceAttributes(route, signal));
  if (!ways) return { status: 'failed', ways: null, grades: null };
  if (!withGrades) return { status: 'ready', ways, grades: null };
  onWays(ways);
  const ids = wayIdsOf(ways, TOUR_TRAIL_GRADE_MAX_WAYS);
  if (ids.length === 0) return { status: 'ready', ways, grades: { status: 'ready', ...NO_GRADES } };
  try {
    const answer = await tourTrailGradeRepo.grades(tripId, { way_ids: ids }, signal);
    const byWay = new Map(answer.ways.map((grade) => [grade.id, grade]));
    return { status: 'ready', ways, grades: { status: 'ready', byWay, unasked: new Set(answer.unanswered) } };
  } catch (failure) {
    const status = failure instanceof OnlineOnlyError ? 'offline' : 'failed';
    return { status: 'ready', ways, grades: { status, ...NO_GRADES } };
  }
}

/**
 * BIK-01 to BIK-05: what the bike tour being planned runs on, asked of the
 * router once its route has settled, and for a mountain bike tour the trail
 * grades of its ways. A new route makes the answer on its way stale and takes
 * the map's highlight down; nothing of it changes the tour.
 */
export function useRouteWays(input: {
  tripId: number | string;
  active: boolean;
  route: [number, number][] | null;
  profile: BikeProfile;
}): RouteWaysState & { retry: () => void } {
  const { tripId, active, route, profile } = input;
  const { offline } = useNetworkMode();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const withGrades = profile === 'mtb';
  const asking = active && !offline && !!route && route.length >= 2;

  useEffect(() => {
    useTourRouteHighlightStore.getState().clear();
    if (!asking || !route) return;
    const controller = new AbortController();
    const settle = (state: RouteWaysState) => {
      if (!controller.signal.aborted) setAnswer({ ...state, route, withGrades, attempt });
    };
    const timer = window.setTimeout(() => {
      askRouteWays(tripId, route, withGrades, controller.signal, (ways) =>
        settle({ status: 'ready', ways, grades: { status: 'loading', ...NO_GRADES } })
      )
        .then(settle)
        // Whatever went wrong, the card says it failed and offers to ask again rather than wait for ever.
        .catch(() => settle({ status: 'failed', ways: null, grades: null }));
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [asking, attempt, route, tripId, withGrades]);

  // The highlight belongs to the route it was drawn on.
  useEffect(() => () => useTourRouteHighlightStore.getState().clear(), []);

  if (!active || !route || route.length < 2) return { ...IDLE, retry };
  if (offline) return { status: 'offline', ways: null, grades: null, retry };
  const current = answer?.route === route && answer.withGrades === withGrades && answer.attempt === attempt;
  return current ? { ...answer, retry } : { status: 'loading', ways: null, grades: null, retry };
}
