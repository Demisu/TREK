import {
  haversineMetres,
  type PaddleCheck,
  type PaddleCheckData,
  type TourObstacleCheck,
  type TourObstacleEntry,
  type TourOwnEntry,
} from '@trek/shared';
import { Ban, CircleDashed, ListChecks, type LucideIcon } from 'lucide-react';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * PAD-06 and PAD-09 on the client, without React: what the check bench of a
 * paddle tour says in one pill, how its dates read, where the camera goes for
 * an entry, and the order the checklist lists its rows in.
 */

/** The word for data that does not cover the whole route; null when it does. */
export function checkDataWord(data: PaddleCheckData, t: Translate): string | null {
  return data === 'covered' ? null : t(`tours.paddle.check.data.${data}`);
}

/**
 * The bench in one pill: the first rule that applies gives its value. Missing
 * data says so and never shows a count, open entries come before a partial
 * coverage, and a route without known obstacles says that, never "clear".
 */
export function paddleCheckFact(check: PaddleCheck, t: Translate): { icon: LucideIcon; value: string; label: string } {
  const pending = check.open + check.review;
  const word = checkDataWord(check.data, t);
  let value: string;
  if (check.data === 'unavailable' || check.data === 'none') value = word ?? '';
  else if (pending > 0) value = t('tours.paddle.check.open', { count: pending });
  else if (word) value = word;
  else if (check.entries === 0) value = t('tours.paddle.check.noneKnown');
  else value = t('tours.paddle.check.decided', { count: check.decided });
  const noData = check.data === 'unavailable' || check.data === 'none';
  const label = [
    word ? `${t('tours.paddle.check.dataLabel')}: ${word}` : null,
    check.open > 0 ? t('tours.paddle.check.open', { count: check.open }) : null,
    check.review > 0 ? t('tours.paddle.check.review', { count: check.review }) : null,
    check.decided > 0 ? t('tours.paddle.check.decided', { count: check.decided }) : null,
    check.bans > 0 ? t('tours.paddle.check.bans', { count: check.bans }) : null,
    check.bans > 0 ? t('tours.paddle.check.bansInfo') : null,
    t('tours.paddle.check.notClearance'),
  ]
    .filter((part): part is string => part !== null)
    .join('\n');
  return { icon: noData ? CircleDashed : check.bans > 0 ? Ban : ListChecks, value, label };
}

const MONTH = /^(\d{4})-(\d{2})$/;

/** A date of the checklist in the user's locale: a bare `YYYY-MM` (an OSM check date) reads as month and year. */
export function formatCheckDate(value: string, locale: string): string {
  const month = MONTH.exec(value);
  try {
    if (month) {
      const date = new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1));
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    // A bare day is a calendar day, not an instant in the user's zone.
    const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined;
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(date);
  } catch {
    return value;
  }
}

/** The widest an area may be for the camera to frame it whole; beyond, it goes to the entry's point. */
const FRAME_MAX_M = 2000;

/** Where the camera goes for an entry or an own portage: its whole extent, or its point when that is too wide. */
export function focusPointsOf(item: Pick<TourObstacleEntry, 'at' | 'bounds'>): [number, number][] {
  const [south, north] = item.bounds;
  const at: [number, number] = [Number(item.at[0]), Number(item.at[1])];
  const corners: [number, number][] = [
    [Number(south[0]), Number(south[1])],
    [Number(north[0]), Number(north[1])],
  ];
  const diagonal = haversineMetres(corners[0][0], corners[0][1], corners[1][0], corners[1][1]);
  return diagonal <= FRAME_MAX_M ? corners : [at];
}

export type ChecklistRow = { type: 'obstacle'; entry: TourObstacleEntry } | { type: 'own'; own: TourOwnEntry };

/**
 * The rows of a checklist in route order, the paddler's own portages and
 * locks among the obstacles at their metre, and apart from them the earlier
 * decisions the route or the data no longer carries.
 */
export function checklistRows(check: TourObstacleCheck): { rows: ChecklistRow[]; earlier: TourObstacleEntry[] } {
  const metreOf = (row: ChecklistRow) => (row.type === 'obstacle' ? (row.entry.along_m ?? 0) : row.own.from_m);
  const rows: ChecklistRow[] = [
    ...check.entries.filter((entry) => entry.relation !== null).map((entry) => ({ type: 'obstacle' as const, entry })),
    ...check.own.map((own) => ({ type: 'own' as const, own })),
  ].sort((a, b) => metreOf(a) - metreOf(b));
  return { rows, earlier: check.entries.filter((entry) => entry.relation === null) };
}

const PENDING = new Set(['open', 'todo', 'review']);

/** The next entry along the route still asking for a look; from an earlier decision, the first one. */
export function nextPendingEntry(check: TourObstacleCheck, entry: TourObstacleEntry): TourObstacleEntry | null {
  const from = entry.along_m ?? -1;
  return (
    check.entries
      .filter((candidate) => candidate.relation !== null && PENDING.has(candidate.status))
      .filter((candidate) => candidate.key !== entry.key && (candidate.along_m ?? 0) > from)
      .sort((a, b) => (a.along_m ?? 0) - (b.along_m ?? 0))[0] ?? null
  );
}
