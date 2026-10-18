import type { JourneyEntriesRepository } from '../../../src/db/repositories/JourneyEntries.repository';
import { chronologicalSlot, makeRoomAtTime } from '../../../src/nest/journey/journey-entry-order';

import { describe, it, expect, vi } from 'vitest';

const at = (...times: (string | null)[]) => times.map((entry_time) => ({ entry_time }));

describe('chronologicalSlot (#2679)', () => {
  it('goes before the first entry that starts later', () => {
    expect(chronologicalSlot(at('02:00'), '01:00')).toBe(0);
    expect(chronologicalSlot(at('01:00', '03:00'), '02:00')).toBe(1);
    expect(chronologicalSlot(at('01:00', '02:00'), '05:00')).toBe(2);
  });

  it('keeps an equal time after the one already there', () => {
    expect(chronologicalSlot(at('09:00', '10:00'), '09:00')).toBe(1);
  });

  it('passes over entries without a time instead of anchoring on them', () => {
    expect(chronologicalSlot(at(null, '08:00', null), '07:00')).toBe(1);
    expect(chronologicalSlot(at(null, null), '07:00')).toBe(2);
  });

  it('reads seconds and single-digit hours, and puts an unreadable time last', () => {
    expect(chronologicalSlot(at('9:30:00', '10:00:00'), '09:45')).toBe(1);
    expect(chronologicalSlot(at('01:00'), 'soon')).toBe(1);
  });
});

describe('makeRoomAtTime (#2679)', () => {
  function repo(day: { id: number; entry_time: string | null; sort_order: number | null }[]) {
    const updateSortOrder = vi.fn(async () => {});
    const listDayOrder = vi.fn(async () => day);
    return { entries: { listDayOrder, updateSortOrder } as unknown as JourneyEntriesRepository, updateSortOrder };
  }

  it('moves only the entries after the slot, and returns the slot', async () => {
    const { entries, updateSortOrder } = repo([
      { id: 1, entry_time: '08:00', sort_order: 0 },
      { id: 2, entry_time: '12:00', sort_order: 1 },
      { id: 3, entry_time: '19:00', sort_order: 2 },
    ]);
    expect(await makeRoomAtTime(entries, 7, '2026-04-01', '10:00', 99)).toBe(1);
    expect(updateSortOrder.mock.calls).toEqual([
      [2, 2, 99],
      [3, 3, 99],
    ]);
  });

  it('leaves the moved entry itself out and closes the gap it leaves', async () => {
    const { entries, updateSortOrder } = repo([
      { id: 1, entry_time: '08:00', sort_order: 0 },
      { id: 2, entry_time: '12:00', sort_order: 1 },
      { id: 3, entry_time: '19:00', sort_order: 2 },
    ]);
    expect(await makeRoomAtTime(entries, 7, '2026-04-01', '07:00', 99, 3)).toBe(0);
    expect(updateSortOrder.mock.calls).toEqual([
      [1, 1, 99],
      [2, 2, 99],
    ]);
  });

  it('writes nothing when the entry goes last on an evenly numbered day', async () => {
    const { entries, updateSortOrder } = repo([{ id: 1, entry_time: '08:00', sort_order: 0 }]);
    expect(await makeRoomAtTime(entries, 7, '2026-04-01', '09:00', 99)).toBe(1);
    expect(updateSortOrder).not.toHaveBeenCalled();
  });
});
