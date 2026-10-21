/**
 * The change cards: names instead of ids, dates and amounts in the user's
 * locale, the value before a change, and the receipt of an applied change.
 */
import { buildTripCard } from '../../../../src/nest/assistant/assistant-context';
import { ASSISTANT_WRITE_TOOLS } from '../../../../src/nest/assistant/assistant-tools.constants';
import {
  appliedChange,
  dayLabel,
  describeToolCall,
  type PreviewContext,
} from '../../../../src/nest/assistant/tool-call-preview.helpers';
import { assistantChangePreviewSchema } from '@trek/shared';

import { describe, expect, it } from 'vitest';

const card = buildTripCard(
  1,
  {
    trip: { title: 'Kyoto', currency: 'EUR' },
    members: { owner: { id: 7, username: 'mia' }, collaborators: [{ id: 8, username: 'jon' }] },
    days: [
      {
        id: 31,
        day_number: 1,
        date: '2026-06-11',
        title: 'Arrival',
        assignments: [{ id: 301, place: { id: 12, name: 'Nishiki Market' } }],
        notes: [{ id: 41, text: 'Rail pass', time: '09:00' }],
      },
      { id: 32, day_number: 2, date: '2026-06-12', assignments: [], notes: [] },
      { id: 33, day_number: 3, date: null, title: 'Spare day', assignments: [], notes: [] },
    ],
    packing: { items: [{ id: 51, name: 'Umbrella', quantity: 1 }] },
  },
  {
    places: [
      {
        id: 12,
        name: 'Nishiki Market',
        address: 'Old street',
        lat: 35,
        lng: 135,
        price: 5,
        currency: 'EUR',
        category_id: 2,
      },
    ],
  },
  null,
);
const ctx: PreviewContext = {
  card,
  categories: new Map([
    [2, 'Food'],
    [3, 'Sights'],
  ]),
  locale: 'en-GB',
};

const describe_ = (name: string, args: Record<string, unknown>) => describeToolCall(name, 'tc-1', args, ctx);

describe('dayLabel', () => {
  it('ASTPRV-001: names a day by its date and title, its title, or its number', () => {
    expect(dayLabel(ctx, 31)).toBe('Thu 11 Jun, Arrival');
    expect(dayLabel(ctx, 32)).toBe('Fri 12 Jun');
    expect(dayLabel(ctx, 33)).toBe('Spare day');
    expect(dayLabel(ctx, 99)).toBe('#99');
    expect(dayLabel({ ...ctx, locale: 'de' }, 32)).toBe('Fr., 12. Juni');
    expect(dayLabel({ ...ctx, locale: 'not a locale!' }, 32)).toBe('Fri, Jun 12');
  });
});

describe('describeToolCall', () => {
  it('ASTPRV-010: a place for a day names the day and the fields it carries', () => {
    const preview = describe_('create_and_assign_place', {
      dayId: 32,
      name: 'Kinkaku-ji',
      address: '1 Kinkakujicho',
      lat: 35.0394,
      lng: 135.7292,
      category_id: 3,
      price: 4,
      currency: 'JPY',
      website: 'https://www.shokoku-ji.jp/kinkakuji/',
    });
    expect(preview).toEqual({
      toolCallId: 'tc-1',
      verbKey: 'addPlaceToDay',
      subject: 'Kinkaku-ji',
      rows: [
        { op: 'add', labelKey: 'day', before: null, after: 'Fri 12 Jun' },
        { op: 'add', labelKey: 'address', before: null, after: '1 Kinkakujicho' },
        { op: 'add', labelKey: 'coordinates', before: null, after: '35.03940, 135.72920' },
        { op: 'add', labelKey: 'category', before: null, after: 'Sights' },
        { op: 'add', labelKey: 'website', before: null, after: 'https://www.shokoku-ji.jp/kinkakuji/' },
        { op: 'add', labelKey: 'price', before: null, after: 'JP¥4' },
      ],
      dayId: 32,
      placeIds: [],
      undoable: true,
      effect: {
        kind: 'add',
        dayId: 32,
        fromDayId: null,
        placeId: null,
        assignmentId: null,
        place: { name: 'Kinkaku-ji', lat: 35.0394, lng: 135.7292, categoryId: 3 },
      },
    });
    expect(assistantChangePreviewSchema.safeParse(preview).success).toBe(true);
  });

  it('ASTPRV-011: an update shows what each field held before', () => {
    const preview = describe_('update_place', { placeId: 12, name: 'Nishiki', category_id: 3, price: 6, lat: 35.5 });
    expect(preview.subject).toBe('Nishiki Market');
    expect(preview.placeIds).toEqual([12]);
    expect(preview.undoable).toBe(false);
    expect(preview.rows).toEqual([
      { op: 'change', labelKey: 'name', before: 'Nishiki Market', after: 'Nishiki' },
      { op: 'change', labelKey: 'coordinates', before: '35.00000, 135.00000', after: '35.50000, 135.00000' },
      { op: 'change', labelKey: 'category', before: 'Food', after: 'Sights' },
      { op: 'change', labelKey: 'price', before: '€5.00', after: '€6.00' },
    ]);
  });

  it('ASTPRV-012: a move names both days, a note its day, a cleared field reads empty', () => {
    expect(describe_('move_assignment', { assignmentId: 301, newDayId: 32 })).toMatchObject({
      subject: 'Nishiki Market',
      rows: [{ op: 'move', labelKey: 'day', before: 'Thu 11 Jun, Arrival', after: 'Fri 12 Jun' }],
      dayId: 32,
      placeIds: [12],
    });
    expect(describe_('unassign_place', { dayId: 31, assignmentId: 301 })).toMatchObject({
      verbKey: 'removeFromDay',
      subject: 'Nishiki Market',
      rows: [{ op: 'add', labelKey: 'day', before: null, after: 'Thu 11 Jun, Arrival' }],
      dayId: 31,
      placeIds: [12],
    });
    expect(describe_('update_day_note', { dayId: 31, noteId: 41, time: null })).toMatchObject({
      subject: 'Rail pass',
      rows: [{ op: 'change', labelKey: 'time', before: '09:00', after: '' }],
    });
    expect(describe_('create_day_note', { dayId: 33, text: 'Laundry', icon: '🧺' }).rows).toEqual([
      { op: 'add', labelKey: 'day', before: null, after: 'Spare day' },
      { op: 'add', labelKey: 'icon', before: null, after: '🧺' },
    ]);
  });

  it('ASTPRV-013: people are named, money is in the trip currency, booleans are marks', () => {
    expect(describe_('create_budget_item', { name: 'Taxi', total_price: 30, member_ids: [7, 8, 9] }).rows).toEqual([
      { op: 'add', labelKey: 'price', before: null, after: '€30.00' },
      { op: 'add', labelKey: 'members', before: null, after: 'mia, jon, #9' },
    ]);
    expect(
      describe_('create_todo', { name: 'Book', due_date: '2026-06-01', priority: 1, assigned_user_id: 8 }).rows,
    ).toEqual([
      { op: 'add', labelKey: 'dueDate', before: null, after: 'Mon 1 Jun' },
      { op: 'add', labelKey: 'priority', before: null, after: 'P1' },
      { op: 'add', labelKey: 'assignee', before: null, after: 'jon' },
    ]);
    expect(describe_('create_packing_item', { name: 'Socks', quantity: 3, checked: true }).rows).toEqual([
      { op: 'add', labelKey: 'quantity', before: null, after: '3' },
      { op: 'add', labelKey: 'packed', before: null, after: '✓' },
    ]);
    expect(describe_('update_packing_item', { itemId: 51, quantity: 2 }).rows).toEqual([
      { op: 'change', labelKey: 'quantity', before: '1', after: '2' },
    ]);
  });

  it('ASTPRV-014: a hotel booking names its stay, and long values are cut', () => {
    const preview = describe_('create_reservation', {
      title: 'Hotel Gion',
      type: 'hotel',
      place_id: 12,
      start_day_id: 31,
      end_day_id: 32,
      reservation_time: '2026-06-11T15:00',
      notes: 'x'.repeat(400),
    });
    expect(preview.rows).toContainEqual({
      op: 'add',
      labelKey: 'stay',
      before: null,
      after: 'Nishiki Market, Thu 11 Jun, Arrival → Fri 12 Jun',
    });
    expect(preview.rows).toContainEqual({ op: 'add', labelKey: 'time', before: null, after: 'Thu 11 Jun, 15:00' });
    expect(preview.rows.find((row) => row.labelKey === 'notes')?.after).toHaveLength(160);
    expect(preview.dayId).toBe(31);
  });

  it('ASTPRV-015: every writing tool has a card, and anything else has none', () => {
    for (const name of Object.keys(ASSISTANT_WRITE_TOOLS)) {
      const preview = describe_(name, {});
      expect(assistantChangePreviewSchema.safeParse(preview).success, name).toBe(true);
      expect(preview.verbKey).toBe(ASSISTANT_WRITE_TOOLS[name].verbKey);
    }
    expect(() => describe_('list_places', {})).toThrow(/No change card/);
  });

  it('ASTPRV-018: a change to the day plan says what it does to which day; anything else has no effect', () => {
    expect(describe_('assign_place_to_day', { dayId: 32, placeId: 12 }).effect).toEqual({
      kind: 'add',
      dayId: 32,
      fromDayId: null,
      placeId: 12,
      assignmentId: null,
      place: null,
    });
    expect(describe_('move_assignment', { assignmentId: 301, newDayId: 32 }).effect).toEqual({
      kind: 'move',
      dayId: 32,
      fromDayId: 31,
      placeId: 12,
      assignmentId: 301,
      place: null,
    });
    expect(describe_('unassign_place', { dayId: 31, assignmentId: 301 }).effect).toMatchObject({
      kind: 'remove',
      dayId: 31,
      placeId: 12,
      assignmentId: 301,
    });
    expect(describe_('unassign_place', { dayId: 33, assignmentId: 999 }).effect).toMatchObject({
      kind: 'remove',
      dayId: 33,
      placeId: null,
    });
    // A new place without a usable position has no ghost on the map, and a move without a day no effect.
    expect(describe_('create_and_assign_place', { dayId: 32, name: 'X', lat: 95, lng: 10 }).effect?.place).toBeNull();
    expect(describe_('create_and_assign_place', { dayId: 32, name: '', lat: 1, lng: 1 }).effect?.place).toBeNull();
    expect(describe_('move_assignment', { assignmentId: 301 }).effect).toBeNull();
    expect(describe_('create_place', { name: 'X', lat: 1, lng: 2 }).effect).toBeNull();
    expect(describe_('create_day_note', { dayId: 31, text: 'x' }).effect).toBeNull();
  });

  it('ASTPRV-019: a found place reads as the tool it runs through, verb, rows, undo and effect alike', () => {
    const created = describe_('add_found_place', {
      via: 'create_and_assign_place',
      dayId: 32,
      name: 'Ginkaku-ji',
      lat: 35.027,
      lng: 135.798,
    });
    expect(created).toMatchObject({ verbKey: 'addPlaceToDay', subject: 'Ginkaku-ji', dayId: 32, undoable: true });
    expect(created.effect?.place).toMatchObject({ name: 'Ginkaku-ji', lat: 35.027 });
    const assigned = describe_('add_found_place', { via: 'assign_place_to_day', dayId: 31, placeId: 12, name: 'x' });
    expect(assigned).toMatchObject({ verbKey: 'assignPlace', subject: 'Nishiki Market', placeIds: [12] });
    expect(assigned.effect).toMatchObject({ kind: 'add', dayId: 31, placeId: 12 });
    expect(() => describe_('add_found_place', { via: 'delete_trip', dayId: 31 })).toThrow(/No change card/);
    expect(
      appliedChange('add_found_place', 'tc', { via: 'assign_place_to_day' }, { assignment: { id: 4 } }, 31, null),
    ).toMatchObject({ entity: 'assignment', ids: [4], dayId: 31 });
  });

  it('ASTPRV-016: a booking from a file names its route, day, times, reference and price', () => {
    const preview = describe_('import_booking', {
      type: 'flight',
      title: 'LH 716 to Tokyo',
      reservation_time: '2026-06-11T13:30',
      reservation_end_time: '2026-06-12T08:05',
      confirmation_number: 'ABC123',
      endpoints: [
        { role: 'from', sequence: 0, name: 'Frankfurt', code: 'FRA' },
        { role: 'to', sequence: 1, name: 'Haneda', code: 'HND' },
      ],
      metadata: { price: 812.5, priceCurrency: 'EUR' },
      source: { fileName: 'lh.pdf', index: 0 },
    });
    expect(assistantChangePreviewSchema.safeParse(preview).success).toBe(true);
    expect(preview).toMatchObject({ verbKey: 'importBooking', subject: 'LH 716 to Tokyo', dayId: 31, undoable: false });
    const after = Object.fromEntries(preview.rows.map((row) => [row.labelKey, row.after]));
    expect(after).toEqual({
      type: 'flight',
      route: 'Frankfurt (FRA) → Haneda (HND)',
      day: 'Thu 11 Jun, Arrival',
      time: 'Thu 11 Jun, 13:30',
      endTime: 'Fri 12 Jun, 08:05',
      confirmation: 'ABC123',
      price: '€812.50',
    });
  });

  it('ASTPRV-017: a stay from a file names its nights and venue; a booking off the trip has no day', () => {
    const stay = describe_('import_booking', {
      type: 'hotel',
      title: 'Hotel Gion',
      _accommodation: { check_in: '2026-06-12', check_out: '2026-06-14', confirmation: 'H-9' },
      _venue: { name: 'Hotel Gion', address: 'Gion 1' },
      endpoints: [{ role: 'from', sequence: 0, name: 'Gion' }],
      source: { fileName: 'stay.eml', index: 0 },
    });
    expect(stay.dayId).toBe(32);
    const after = Object.fromEntries(stay.rows.map((row) => [row.labelKey, row.after]));
    expect(after).toMatchObject({ checkIn: 'Fri 12 Jun', checkOut: 'Sun 14 Jun', confirmation: 'H-9' });
    expect(after).toMatchObject({ location: 'Hotel Gion', address: 'Gion 1' });
    expect(after.route).toBeUndefined();
    const elsewhere = describe_('import_booking', {
      type: 'train',
      title: 'Shinkansen',
      reservation_time: '2027-01-01',
      endpoints: 'odd',
      metadata: { price: 'free' },
      source: { fileName: 't.pdf', index: 0 },
    });
    expect(elsewhere.dayId).toBeNull();
    expect(elsewhere.rows.map((row) => row.labelKey)).toEqual(['type', 'time']);
  });
});

describe('appliedChange', () => {
  it('ASTPRV-020: names what was created from the answer, what was changed from the arguments', () => {
    expect(appliedChange('create_place', 'tc', {}, { place: { id: 9 } }, null, '2026-06-11T10:15:00Z')).toEqual({
      toolCallId: 'tc',
      entity: 'place',
      ids: [9],
      dayId: null,
      undoUntil: '2026-06-11T10:15:00Z',
    });
    expect(appliedChange('update_day_note', 'tc', { noteId: 41 }, { note: {} }, 31, null)).toMatchObject({
      entity: 'day_note',
      ids: [41],
      dayId: 31,
    });
    expect(appliedChange('create_todo', 'tc', {}, 'odd', null, null)).toMatchObject({ entity: 'todo', ids: [] });
    expect(appliedChange('list_places', 'tc', {}, {}, null, null)).toBeNull();
  });

  it('ASTPRV-021: a booking from a file is a reservation, on the day its card named or it landed on', () => {
    const result = { reservation: { id: 5, day_id: 32 } };
    expect(appliedChange('import_booking', 'tc', {}, result, null, null)).toEqual({
      toolCallId: 'tc',
      entity: 'reservation',
      ids: [5],
      dayId: 32,
      undoUntil: null,
    });
    expect(appliedChange('import_booking', 'tc', {}, result, 31, null)).toMatchObject({ dayId: 31 });
    expect(appliedChange('import_booking', 'tc', {}, { reservation: { id: 5 } }, null, null)).toMatchObject({
      dayId: null,
    });
  });
});
