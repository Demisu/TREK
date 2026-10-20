/**
 * STA-02: the pure half of the user's activity sums. The rows are every tour
 * of the trips the user can open, once per day it is on, and the recordings
 * assigned to them; what comes out is the list of the user's done (or still
 * upcoming) tours the shared summary adds up, see `tour-activity-stats.schema`
 * in @trek/shared for the rules this follows.
 */
import type { TourStatsExecutionRow, TourStatsTrackRow } from '../../db/repositories/TourActivities.repository';
import { computeTourMetrics, parseRouteGeometry } from './tours.helpers';
import type { TourActivityStatsEntry, TourActivityStatsResponse, TourTypeKey } from '@trek/shared';

/** One tour with its executions, as the rows give it. */
interface TourOfStats {
  row: TourStatsExecutionRow;
  executions: TourStatsExecutionRow[];
}

/** One execution of a tour that is the user's and on a day with a date. */
interface DatedExecution {
  assignmentId: number;
  date: string;
}

interface ActivityStatsInput {
  userId: number;
  executions: readonly TourStatsExecutionRow[];
  tracks: readonly TourStatsTrackRow[];
  /** The tours the user left out of their own sums. */
  excluded: ReadonlySet<number>;
}

/**
 * Whether an execution is the user's own: it names the user among those taking
 * part, or names nobody on a trip that is the user's. Being able to open
 * someone else's trip alone makes none of its tours the user's.
 */
export function isOwnExecution(row: TourStatsExecutionRow, userId: number): boolean {
  if (row.joined === 1) return true;
  return row.participant_count === 0 && row.trip_owner_id === userId;
}

/** A trip day's date as a calendar day, null when the day has none. */
function calendarDay(date: string | null): string | null {
  const day = date?.slice(0, 10) ?? null;
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function groupByTour(rows: readonly TourStatsExecutionRow[]): TourOfStats[] {
  const tours = new Map<number, TourOfStats>();
  for (const row of rows) {
    const tour = tours.get(row.place_id) ?? { row, executions: [] };
    if (row.assignment_id !== null) tour.executions.push(row);
    tours.set(row.place_id, tour);
  }
  return [...tours.values()];
}

/** The user's executions of a tour, and of those the ones on a dated day, the earliest first. */
function ownExecutions(tour: TourOfStats, userId: number): { own: number; dated: DatedExecution[] } {
  const own = tour.executions.filter((row) => isOwnExecution(row, userId));
  const dated: DatedExecution[] = [];
  for (const row of own) {
    const date = calendarDay(row.date);
    if (date !== null && row.assignment_id !== null) dated.push({ assignmentId: row.assignment_id, date });
  }
  dated.sort((a, b) => a.date.localeCompare(b.date) || a.assignmentId - b.assignmentId);
  return { own: own.length, dated };
}

/** A measure as the contract carries it: unknown stays null, never a negative. */
function measure(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

/** On the water a climb says nothing, so a paddle tour carries no heights, planned or recorded. */
function heights(type: string, gain: number | null, loss: number | null) {
  return type === 'kayak' ? { ascent_m: null, descent_m: null } : { ascent_m: measure(gain), descent_m: measure(loss) };
}

function baseEntry(tour: TourOfStats, excluded: ReadonlySet<number>) {
  const { row } = tour;
  return {
    place_id: row.place_id,
    name: row.name,
    tour_type: row.tour_type as TourTypeKey,
    trip: { id: row.trip_id, title: row.trip_title },
    excluded: excluded.has(row.place_id),
  };
}

/** The plan standing in for the tour: once, on the first of its days, however many there are. */
function planEntry(
  tour: TourOfStats,
  first: DatedExecution,
  dayCount: number,
  excluded: ReadonlySet<number>,
): TourActivityStatsEntry {
  const { row } = tour;
  return {
    ...baseEntry(tour, excluded),
    date: first.date,
    basis: 'plan',
    track: null,
    day_count: dayCount,
    distance_km: measure(row.distance),
    ...heights(row.tour_type, row.elevation_gain, row.elevation_loss),
  };
}

/** A recording in the plan's place, measured on its own line: the line it kept if it was planned over since. */
function trackEntry(
  tour: TourOfStats,
  track: TourStatsTrackRow,
  date: string,
  excluded: ReadonlySet<number>,
): TourActivityStatsEntry {
  const line = parseRouteGeometry(track.track_recorded_route_geometry ?? track.track_route_geometry);
  const metrics = computeTourMetrics(line);
  return {
    ...baseEntry(tour, excluded),
    date,
    basis: 'track',
    track: { place_id: track.track_place_id, name: track.track_name },
    day_count: 1,
    distance_km: line.length >= 2 ? metrics.distanceKm : null,
    ...heights(tour.row.tour_type, metrics.elevationGainM, metrics.elevationLossM),
  };
}

/**
 * A tour's entries: one per recording of one of the user's executions (a
 * recording on no day counts with the first of them), or else the plan once.
 * A recording of someone else's execution is theirs, not the user's.
 */
function entriesOfTour(
  tour: TourOfStats,
  [first, ...rest]: [DatedExecution, ...DatedExecution[]],
  tracks: readonly TourStatsTrackRow[],
  excluded: ReadonlySet<number>,
): TourActivityStatsEntry[] {
  const dateOf = new Map([first, ...rest].map((execution) => [execution.assignmentId, execution.date]));
  const recorded = tracks
    .filter((track) => track.place_id === tour.row.place_id)
    .map((track) => ({ track, date: track.assignment_id === null ? first.date : dateOf.get(track.assignment_id) }))
    .filter((item): item is { track: TourStatsTrackRow; date: string } => item.date !== undefined);
  if (recorded.length === 0) return [planEntry(tour, first, rest.length + 1, excluded)];
  return recorded.map(({ track, date }) => trackEntry(tour, track, date, excluded));
}

/** What became of one tour: its entries, or why a tour of the user's own trip cannot count. */
type TourOutcome = TourActivityStatsEntry[] | 'unassigned' | 'undated' | null;

function outcomeOf(tour: TourOfStats, input: ActivityStatsInput): TourOutcome {
  const { own, dated } = ownExecutions(tour, input.userId);
  const [first, ...rest] = dated;
  if (first) return entriesOfTour(tour, [first, ...rest], input.tracks, input.excluded);
  if (tour.row.trip_owner_id !== input.userId) return null;
  if (tour.executions.length === 0) return 'unassigned';
  return own > 0 ? 'undated' : null;
}

/**
 * The user's activity entries and what of their own trips cannot count. A
 * recording is never a tour of its own here, and an import other tours were
 * planned from (a whole route and its stages) is left out while one of those
 * tours counts, so nothing is added up twice.
 */
export function buildActivityStats(input: ActivityStatsInput): TourActivityStatsResponse {
  const recordings = new Set(input.tracks.map((track) => track.track_place_id));
  const tours = groupByTour(input.executions).filter((tour) => !recordings.has(tour.row.place_id));
  const outcomes = tours.map((tour) => ({ tour, outcome: outcomeOf(tour, input) }));
  const stagesCounted = new Set(
    outcomes.filter(({ outcome }) => Array.isArray(outcome)).map(({ tour }) => tour.row.derived_from_place_id),
  );
  const uncounted = { unassigned: 0, undated: 0 };
  const entries: TourActivityStatsEntry[] = [];
  for (const { tour, outcome } of outcomes) {
    if (outcome === null || stagesCounted.has(tour.row.place_id)) continue;
    if (Array.isArray(outcome)) entries.push(...outcome);
    else uncounted[outcome] += 1;
  }
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.place_id - b.place_id);
  return { entries, uncounted };
}
