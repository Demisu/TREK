import { haversineKm } from '../../../utils/geo';
import { valhallaRun } from '../../Map/valhallaRoute';
import { figuresOf } from './legVariants';
import { loopSpots, retracedShare, sharedShare, STRAIGHT_PER_RADIUS_M } from './roundHikeGeometry';
import { fitsWish, ROUND_KEYS, type RoundCandidate, type RoundRequest } from './roundHikes';
import { MAX_TOUR_SNAP_M } from './tourRouteOutcome';
import { enrichTourElevations } from './tourRouting';

type Spot = { lat: number; lng: number };

/**
 * The directions a search sends its loops in, in turn: three a third of a
 * turn apart first, so the first rounds found lie on different sides of the
 * start, then the three between them.
 */
const BEARINGS = [0, 120, 240, 60, 180, 300] as const;
/**
 * The most questions one search puts to the router. The public instance
 * answers one a second, so a search ends within about a quarter of a minute,
 * with the heights of what it found.
 */
export const MAX_ROUND_ASKS = 12;
/** How much longer the paths are than the straight lines between the corners, until the router said. */
const FIRST_DETOUR = 1.3;
/** A loop walking more than this share of its ground twice is an out and back, not a round. */
const MAX_RETRACED_SHARE = 0.4;
/** Two rounds sharing more than this share of their ground are one round, walked a little apart. */
const MAX_SHARED_SHARE = 0.6;
/** A loop that missed the length is asked again once, its circle scaled within these bounds. */
const RESCALE = { min: 0.5, max: 2 } as const;

/** Where a search stands: still asking, done with what it found, or without one answer from the router. */
export interface RoundSearchReport {
  phase: 'searching' | 'done' | 'failed';
  candidates: RoundCandidate[];
  /** The questions put so far, of `MAX_ROUND_ASKS`. */
  asked: number;
}

/** A loop the router planned: its line, where it met the steering spots, and how far it is. */
interface Loop {
  coordinates: [number, number][];
  via: Spot[];
  distanceM: number;
  /** The same loop in straight lines from corner to corner. */
  straightM: number;
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

/** The circle a loop of `targetM` is steered round, for paths `detour` times longer than straight lines. */
const radiusFor = (targetM: number, detour: number) => targetM / (detour * STRAIGHT_PER_RADIUS_M);

function straightLength(spots: readonly Spot[]): number {
  let km = 0;
  for (let i = 1; i < spots.length; i += 1) km += haversineKm(spots[i - 1], spots[i]);
  return km * 1000;
}

/**
 * One loop out of the start and back, asked on foot under the hike's rules:
 * the same question the planner asks for a hike through these points, so the
 * round taken is the round shown. `undefined` when the router gave no answer,
 * null when a spot lies too far from any path to steer through.
 */
async function askLoop(request: RoundRequest, spots: Spot[], signal: AbortSignal): Promise<Loop | null | undefined> {
  const points = [request.start, ...spots, request.start];
  const run = await valhallaRun(points, 'walking', [], signal, request.costing);
  if (!run) return undefined;
  if (run.snapped.some((snap) => snap.meters > MAX_TOUR_SNAP_M)) return null;
  const coordinates = run.total.coordinates;
  return {
    coordinates,
    via: run.snapped.slice(1, -1).map(({ at }) => ({ lat: at[0], lng: at[1] })),
    distanceM: figuresOf(coordinates).distanceM,
    straightM: straightLength(points),
  };
}

/**
 * What a planned loop is worth: a round to offer, a loop to ask again larger
 * or smaller, or nothing (an out and back, or a round already found).
 */
function judge(loop: Loop, request: RoundRequest, found: readonly RoundCandidate[]): 'round' | 'rescale' | 'drop' {
  if (!fitsWish(loop.distanceM, request.targetM)) return 'rescale';
  if (retracedShare(loop.coordinates) > MAX_RETRACED_SHARE) return 'drop';
  const known = found.some(
    (round) =>
      Math.max(sharedShare(loop.coordinates, round.coordinates), sharedShare(round.coordinates, loop.coordinates)) >
      MAX_SHARED_SHARE
  );
  return known ? 'drop' : 'round';
}

function candidateOf(loop: Loop, index: number): RoundCandidate {
  return {
    key: ROUND_KEYS[index],
    current: false,
    coordinates: loop.coordinates,
    ...figuresOf(loop.coordinates),
    heights: 'pending',
    via: loop.via,
  };
}

/** What one search has learned so far, carried from one question to the next. */
interface SearchState {
  found: RoundCandidate[];
  asked: number;
  answered: number;
  detour: number;
}

/**
 * The loops in one direction: asked once at the size the detour so far
 * suggests, and once more scaled by how far the first missed the length.
 */
async function searchBearing(request: RoundRequest, bearing: number, state: SearchState, signal: AbortSignal) {
  let radius = radiusFor(request.targetM, state.detour);
  for (let attempt = 0; attempt < 2 && state.asked < MAX_ROUND_ASKS; attempt += 1) {
    const loop = await askLoop(request, loopSpots(request.start, bearing, radius), signal);
    state.asked += 1;
    if (signal.aborted || loop === undefined) return;
    state.answered += 1;
    if (!loop) return;
    // The paths here are this much longer than the straight lines: the next circle is drawn for them.
    if (loop.straightM > 0) state.detour = clamp(loop.distanceM / loop.straightM, { min: 1, max: 3 });
    const verdict = judge(loop, request, state.found);
    if (verdict === 'round') state.found.push(candidateOf(loop, state.found.length));
    if (verdict !== 'rescale') return;
    radius *= clamp(request.targetM / loop.distanceM, RESCALE);
  }
}

/**
 * RTE-03: up to three different round hikes out of the start, each within a
 * fifth of the wished length. The router plans loops steered round circles
 * in several directions; a loop that misses the length is asked once more at
 * a corrected size, one that walks its ground twice or repeats a round found
 * is left out. Then the heights of each round, one after the other. `report`
 * hears every step, so the rounds and their figures fill in as they come;
 * nothing is reported once `signal` aborts.
 */
export async function findRoundHikes(
  request: RoundRequest,
  signal: AbortSignal,
  report: (answer: RoundSearchReport) => void
): Promise<void> {
  const state: SearchState = { found: [], asked: 0, answered: 0, detour: FIRST_DETOUR };
  for (const bearing of BEARINGS) {
    if (state.found.length >= ROUND_KEYS.length || state.asked >= MAX_ROUND_ASKS) break;
    await searchBearing(request, bearing, state, signal);
    if (signal.aborted) return;
    report({ phase: 'searching', candidates: [...state.found], asked: state.asked });
  }
  if (state.answered === 0) {
    report({ phase: 'failed', candidates: [], asked: state.asked });
    return;
  }
  let candidates = [...state.found];
  report({ phase: 'done', candidates, asked: state.asked });
  for (const round of state.found) {
    const heights = await enrichTourElevations(round.coordinates, signal);
    if (signal.aborted) return;
    // A round without heights keeps its length; its climb, descent and time stay unknown.
    candidates = candidates.map((known) =>
      known.key === round.key ? { ...known, ...figuresOf(heights ?? known.coordinates) } : known
    );
    report({ phase: 'done', candidates, asked: state.asked });
  }
}
