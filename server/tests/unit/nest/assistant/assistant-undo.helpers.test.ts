/**
 * The undo guard: an applied change is taken back only while what it created
 * is as it left it, and, for a place, still only where the change put it.
 */
import { ASSISTANT_UNDO_MAP } from '../../../../src/nest/assistant/assistant-tools.constants';
import { unchangedSinceApplied, type TripSnapshot } from '../../../../src/nest/assistant/assistant-undo.helpers';

import { describe, expect, it } from 'vitest';

const PLACE = { id: 9, name: 'Kinkaku-ji', updated_at: '2026-10-21 10:00:00', lat: 35, lng: 135 };

function snapshot(
  overrides: { places?: unknown[]; days?: unknown[]; summary?: Record<string, unknown> } = {},
): TripSnapshot {
  return {
    places: { places: overrides.places ?? [{ ...PLACE, category: { id: 1 } }] },
    summary: {
      days: overrides.days ?? [
        { id: 31, assignments: [{ id: 301, place_id: 9, day_id: 31 }], notes: [{ id: 41, text: 'Pass' }] },
      ],
      reservations: [],
      accommodations: [],
      budget: { items: [{ id: 71, name: 'Taxi', total_price: 30 }] },
      packing: { items: [{ id: 51, name: 'Socks', updated_at: 'a' }] },
      todos: [{ id: 61, name: 'Book', checked: 0 }],
      ...overrides.summary,
    },
  };
}

describe('unchangedSinceApplied', () => {
  it('ASTUND-001: a place as it was, planned only where the change put it, can be taken back', () => {
    expect(
      unchangedSinceApplied('create_and_assign_place', { place: PLACE, assignment: { id: 301 } }, snapshot()),
    ).toBe(true);
    expect(unchangedSinceApplied('create_place', { place: PLACE }, snapshot({ days: [] }))).toBe(true);
  });

  it('ASTUND-002: an edited, re-planned, booked or deleted place cannot', () => {
    const result = { place: PLACE, assignment: { id: 301 } };
    expect(
      unchangedSinceApplied(
        'create_and_assign_place',
        result,
        snapshot({ places: [{ ...PLACE, updated_at: 'later' }] }),
      ),
    ).toBe(false);
    expect(
      unchangedSinceApplied(
        'create_and_assign_place',
        result,
        snapshot({
          days: [
            {
              id: 32,
              assignments: [
                { id: 301, place_id: 9 },
                { id: 302, place_id: 9 },
              ],
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      unchangedSinceApplied(
        'create_place',
        { place: PLACE },
        snapshot({ days: [], summary: { reservations: [{ place_id: 9 }] } }),
      ),
    ).toBe(false);
    expect(unchangedSinceApplied('create_place', { place: PLACE }, snapshot({ places: [] }))).toBe(false);
  });

  it('ASTUND-003: assignments, notes, packing items, to-dos and expenses are compared field by field', () => {
    expect(
      unchangedSinceApplied('assign_place_to_day', { assignment: { id: 301, day_id: 31, place_id: 9 } }, snapshot()),
    ).toBe(true);
    expect(unchangedSinceApplied('assign_place_to_day', { assignment: { id: 301, day_id: 30 } }, snapshot())).toBe(
      false,
    );
    expect(unchangedSinceApplied('create_day_note', { note: { id: 41, text: 'Pass' } }, snapshot())).toBe(true);
    expect(unchangedSinceApplied('create_day_note', { note: { id: 41, text: 'Passport' } }, snapshot())).toBe(false);
    expect(
      unchangedSinceApplied('create_packing_item', { item: { id: 51, name: 'Socks', updated_at: 'a' } }, snapshot()),
    ).toBe(true);
    expect(unchangedSinceApplied('create_todo', { item: { id: 61, name: 'Book', checked: 1 } }, snapshot())).toBe(
      false,
    );
    expect(
      unchangedSinceApplied('create_budget_item', { item: { id: 71, name: 'Taxi', total_price: 30 } }, snapshot()),
    ).toBe(true);
    expect(unchangedSinceApplied('create_budget_item', { item: { id: 72 } }, snapshot())).toBe(false);
  });

  it('ASTUND-004: every undoable tool has a guard, a tool without one never passes', () => {
    for (const name of Object.keys(ASSISTANT_UNDO_MAP)) {
      expect(unchangedSinceApplied(name, {}, snapshot()), name).toBe(false);
    }
    expect(unchangedSinceApplied('update_place', { place: PLACE }, snapshot())).toBe(false);
  });
});

describe('ASSISTANT_UNDO_MAP', () => {
  it('ASTUND-010: builds the counter-call from the change and its answer, or none', () => {
    expect(ASSISTANT_UNDO_MAP.create_place.args({}, { place: { id: 9 } })).toEqual({ placeId: 9 });
    expect(ASSISTANT_UNDO_MAP.create_and_assign_place.args({}, { place: { id: 9 } })).toEqual({ placeId: 9 });
    expect(ASSISTANT_UNDO_MAP.assign_place_to_day.args({ dayId: 31 }, { assignment: { id: 301 } })).toEqual({
      dayId: 31,
      assignmentId: 301,
    });
    expect(ASSISTANT_UNDO_MAP.create_day_note.args({ dayId: 31 }, { note: { id: 41 } })).toEqual({
      dayId: 31,
      noteId: 41,
    });
    expect(ASSISTANT_UNDO_MAP.create_packing_item.args({}, { item: { id: 51 } })).toEqual({ itemId: 51 });
    expect(ASSISTANT_UNDO_MAP.create_todo.args({}, { item: { id: 61 } })).toEqual({ itemId: 61 });
    expect(ASSISTANT_UNDO_MAP.create_budget_item.args({}, { item: { id: 71 } })).toEqual({ itemId: 71 });
    expect(ASSISTANT_UNDO_MAP.create_place.args({}, 'Place not found.')).toBeNull();
    expect(ASSISTANT_UNDO_MAP.assign_place_to_day.args({}, { assignment: { id: 301 } })).toBeNull();
    expect(ASSISTANT_UNDO_MAP.create_day_note.args({ dayId: 31 }, { note: { id: 0 } })).toBeNull();
  });
});
