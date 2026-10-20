import { runPaceSecondsPerKmSchema } from '@trek/shared';

/** The longest text the pace field takes: "12:30" and a little room. */
export const RUN_PACE_INPUT_MAX_LENGTH = 6;

const CLOCK = /^(\d{1,2}):(\d{2})$/;
const MINUTES = /^(\d{1,2})(?:[.,](\d{1,2}))?$/;

/**
 * RUN-01: a pace as typed, read as whole seconds per kilometre. "5:30" is
 * minutes and seconds, "6" whole minutes and "5,5" or "5.5" minutes and a
 * part. An empty field is no pace (null); anything else, seconds of 60 or more
 * included, is NaN, so the planner marks it and holds Save back while the
 * text stays for the runner to fix. Whether the pace is in bounds is the
 * contract's to say, not this one's.
 */
export function parseRunPace(text: string): number | null {
  const value = text.trim();
  if (value === '') return null;
  const clock = CLOCK.exec(value);
  if (clock) {
    const seconds = Number(clock[2]);
    return seconds < 60 ? Number(clock[1]) * 60 + seconds : Number.NaN;
  }
  const minutes = MINUTES.exec(value);
  if (!minutes) return Number.NaN;
  return Math.round(Number(`${minutes[1]}.${minutes[2] ?? '0'}`) * 60);
}

/** A pace as the runner reads it, minutes and seconds per kilometre: 360 is "6:00". */
export function formatRunPace(secondsPerKm: number): string {
  const whole = Math.round(secondsPerKm);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Whether a pace held by the planner is one a run can be saved with: unset, or in the contract's bounds. */
export function runPaceInvalid(secondsPerKm: number | null): boolean {
  return secondsPerKm !== null && !runPaceSecondsPerKmSchema.safeParse(secondsPerKm).success;
}
