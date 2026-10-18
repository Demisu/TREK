import type { JourneyEntriesRepository } from '../../db/repositories/JourneyEntries.repository';

/** "HH:MM" (seconds ignored) as minutes past midnight, or null for anything else. */
function minutesOf(time: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time?.trim() ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Where an entry at `time` belongs among its day's entries, given in their
 * current order: right before the first one that starts later. Entries
 * without a time are no anchor either way, and an unreadable `time` goes last.
 */
export function chronologicalSlot(day: readonly { entry_time: string | null }[], time: string): number {
  const at = minutesOf(time);
  if (at == null) return day.length;
  const later = day.findIndex((e) => {
    const other = minutesOf(e.entry_time);
    return other != null && other > at;
  });
  return later === -1 ? day.length : later;
}

/**
 * Makes room for a timed entry in its day and returns the sort_order it takes.
 *
 * A new entry used to go to the end of its day whatever its time, so writing
 * up the morning after the evening left the morning last (#2679). It now lands
 * before the first entry that starts later; the order of everything else,
 * dragged by hand or not, stays as it was. Run it inside the write's
 * transaction, so the room and the entry that takes it land together.
 */
export async function makeRoomAtTime(
  entries: JourneyEntriesRepository,
  journeyId: number,
  date: string,
  time: string,
  now: number,
  exceptId?: number,
): Promise<number> {
  const day = (await entries.listDayOrder(journeyId, date)).filter((e) => e.id !== exceptId);
  const slot = chronologicalSlot(day, time);
  const moves = day
    .map((e, index) => ({ id: e.id, from: e.sort_order, to: index < slot ? index : index + 1 }))
    .filter((m) => m.from !== m.to);
  await Promise.all(moves.map((m) => entries.updateSortOrder(m.id, m.to, now)));
  return slot;
}
