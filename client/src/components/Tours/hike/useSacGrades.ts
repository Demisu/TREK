import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTourRouteHighlightStore } from '../../../store/tourRouteHighlightStore';
import type { ClassShare, RouteWayEdge, RouteWays } from '../bike/routeWays';
import { useRouteWays, type RouteWaysState } from '../bike/useRouteWays';
import { straysFrom } from './routeMatch';
import {
  highestStep,
  isSacStep,
  sacClassifier,
  sacOverlay,
  sacShares,
  sacTagOf,
  unclearTags,
  type SacClass,
} from './sacGrades';

type SacGradesStatus = 'off' | 'loading' | 'offline' | 'failed' | 'ready';

export interface SacGradeRow extends ClassShare<SacClass> {
  /** What OpenStreetMap wrote in `sac_scale` for this class's ways: the step's value, or the unclear ones. */
  tags: string[];
}

export interface SacGrades {
  /** Whether the card has a line to describe at all. */
  available: boolean;
  /** Whether the grades are switched on: only then are they asked for and drawn on the map. */
  shown: boolean;
  toggle: () => void;
  status: SacGradesStatus;
  rows: SacGradeRow[];
  /** Of the whole line, 0 to 1, the share whose step is known. */
  knownShare: number;
  /** The highest step known along the line, or null. */
  highest: number | null;
  /** The class drawn alone on the map, or null while every class is. */
  focus: SacClass | null;
  focusOn: (key: SacClass) => void;
  retry: () => void;
}

const NO_STRAYS: ReadonlySet<RouteWayEdge> = new Set();

function statusOf(state: RouteWaysState, nothingAnswered: boolean): SacGradesStatus {
  if (state.status === 'idle') return 'off';
  if (state.status !== 'ready') return state.status;
  const grades = state.grades?.status ?? 'failed';
  if (grades === 'ready') return nothingAnswered ? 'failed' : 'ready';
  return grades;
}

function rowsOf(
  ways: RouteWays,
  grades: NonNullable<RouteWaysState['grades']>,
  classOf: (edge: RouteWayEdge) => SacClass
): SacGradeRow[] {
  return sacShares(ways, classOf).map((row) => ({
    ...row,
    tags: isSacStep(row.key) ? [sacTagOf(row.key)] : unclearTags(ways, grades, (edge) => classOf(edge) === row.key),
  }));
}

/**
 * MAP-03: the SAC grades along a hike, switched on by the traveller. Only
 * then are the ways under the line asked of the router and their grades of
 * OpenStreetMap, and the grades are drawn along the line on the planner map:
 * every class at once, or the one picked alone. Nothing here changes the
 * tour, its places or its days; switched off, the map is as it was.
 */
export function useSacGrades(input: {
  tripId: number | string;
  /** The tour's own line, or null while there is none. */
  route: [number, number][] | null;
  /** False while the line is being planned anew: the card stays, and waits for the new one. */
  current?: boolean;
}): SacGrades {
  const { tripId, route, current = true } = input;
  const available = !!route && route.length >= 2;
  const [shown, setShown] = useState(false);
  const [picked, setPicked] = useState<SacClass | null>(null);
  const on = available && shown;
  const line = current ? route : null;
  const state = useRouteWays({ tripId, active: on, route: line, matching: 'foot', withGrades: true });
  const { ways, grades } = state;
  const strays = useMemo(() => (ways && line ? straysFrom(ways, line) : NO_STRAYS), [ways, line]);
  const classOf = useMemo(() => (grades ? sacClassifier(grades, strays) : null), [grades, strays]);
  const rows = useMemo(
    () => (ways && grades?.status === 'ready' && classOf ? rowsOf(ways, grades, classOf) : []),
    [ways, grades, classOf]
  );
  // Not a single way could be asked about: said once with a way to ask again, not as a row covering the whole hike.
  const nothingAnswered = rows.length > 0 && rows.every((row) => row.key === 'unasked');
  const status = !on ? 'off' : current ? statusOf(state, nothingAnswered) : 'loading';
  const focus = rows.some((row) => row.key === picked) ? picked : null;

  useEffect(() => {
    if (status !== 'ready' || !ways || !classOf) return;
    const overlay = sacOverlay(ways, rows, classOf, focus);
    const highlight = useTourRouteHighlightStore.getState();
    const id = focus ? `sac-${focus}` : 'sac';
    highlight.show({ id, lines: overlay.lines, paint: 'unknown', paints: overlay.paints });
    return () => highlight.clear();
  }, [status, ways, rows, classOf, focus]);

  const toggle = useCallback(() => {
    setShown((value) => !value);
    setPicked(null);
  }, []);
  const focusOn = useCallback((key: SacClass) => setPicked((current) => (current === key ? null : key)), []);

  const shownRows = status === 'ready' ? rows : [];
  return {
    available,
    shown: on,
    toggle,
    status,
    rows: shownRows,
    knownShare: shownRows.filter((row) => isSacStep(row.key)).reduce((sum, row) => sum + row.share, 0),
    highest: highestStep(shownRows),
    focus,
    focusOn,
    retry: state.retry,
  };
}
