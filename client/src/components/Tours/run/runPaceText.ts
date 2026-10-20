import type { TourListItem } from '@trek/shared';
import { formatRunPace, runPaceInvalid } from './runPace';

/**
 * RUN-01: a saved run's pace as its facts say it, "6:00 min/km", or null for
 * another type and for a run without one (an import, a run whose runner has
 * not entered one yet): unknown stays unknown.
 */
export function runPaceText(
  tour: Pick<TourListItem, 'tour_type'> & Partial<Pick<TourListItem, 'run_pace_seconds_per_km'>>
): string | null {
  const pace = tour.tour_type === 'run' ? (tour.run_pace_seconds_per_km ?? null) : null;
  return pace === null || runPaceInvalid(pace) ? null : `${formatRunPace(pace)} min/km`;
}
