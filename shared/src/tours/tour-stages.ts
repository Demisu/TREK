/**
 * MDT-01: a multi-day tour is one tour, planned whole, whose stops mark where
 * each day's stage ends. The stages are read off the route in its order: the
 * first runs from the start to the first stage end, the next from there on,
 * the last to the end of the tour. Nothing about a stage is stored besides the
 * mark on its last stop, so the whole route and its stages cannot drift apart.
 * A tour without a mark is a day tour, as every tour saved before was.
 */

/** A day in minutes: the most one stage, and a day tour, is planned for. */
export const TOUR_DAY_MINUTES = 24 * 60;

/** The most stages a tour is split into, two months of days. */
export const MAX_TOUR_STAGES = 60;

/** A point as a stage end is read from: where it sits on the tour, and whether it steers only. */
interface StagePoint {
  role: 'start' | 'via' | 'end';
  shaping?: boolean;
  stage_end?: boolean;
}

/** Where a request's stage ends do not hold, and why. */
interface StageIssue {
  path: Array<string | number>;
  message: string;
}

/** How many stages the points make: one more than their stage ends, one for a day tour. */
export function tourStageCountOf(points: ReadonlyArray<{ stage_end?: boolean }>): number {
  return 1 + points.filter((point) => point.stage_end === true).length;
}

/** The longest moving time plus breaks a tour of so many stages is planned for: a day each. */
export function maxTourMinutesFor(stageCount: number): number {
  return Math.max(1, stageCount) * TOUR_DAY_MINUTES;
}

/**
 * Where a stage end may not sit: at the start or the end of the tour, which
 * begin and finish the first and the last stage anyway, and on a shaping
 * point, which is no stop to spend a night at. Beyond {@link MAX_TOUR_STAGES}
 * the tour is refused as a whole.
 */
export function tourStageIssues(points: readonly StagePoint[]): StageIssue[] {
  const issues: StageIssue[] = [];
  points.forEach((point, index) => {
    if (point.stage_end !== true) return;
    if (point.role !== 'via')
      issues.push({ path: ['waypoints', index, 'stage_end'], message: 'a stage ends at a stop between start and end' });
    else if (point.shaping === true)
      issues.push({ path: ['waypoints', index, 'stage_end'], message: 'a shaping point ends no stage' });
  });
  if (tourStageCountOf(points) > MAX_TOUR_STAGES)
    issues.push({ path: ['waypoints'], message: `a tour has at most ${MAX_TOUR_STAGES} stages` });
  return issues;
}
