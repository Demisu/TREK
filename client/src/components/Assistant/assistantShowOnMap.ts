import type { AssistantApplied } from '@trek/shared';

interface ShowOnMapTarget {
  /** The place the change made or changed. */
  placeId: number | null;
  /** The day it lives on, for a note or a stop. */
  dayId: number | null;
}

/** Where "Show on map" takes an applied change: the place when it is one, else its day; nothing for the rest. */
export function showOnMapTarget(applied: AssistantApplied): ShowOnMapTarget {
  const placeId = applied.entity === 'place' ? (applied.ids[0] ?? null) : null;
  return { placeId, dayId: placeId === null ? applied.dayId : null };
}

/** The planner's query for it: `?place=` opens the place, `?day=` selects the day. */
export function showOnMapSearch(applied: AssistantApplied): string {
  const { placeId, dayId } = showOnMapTarget(applied);
  if (placeId !== null) return `?place=${placeId}`;
  if (dayId !== null) return `?day=${dayId}`;
  return '';
}
