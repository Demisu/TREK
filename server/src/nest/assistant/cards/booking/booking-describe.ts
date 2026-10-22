import type { Described, PreviewContext, ToolArgs } from '../card-types';
import { argId, recordOf, type Row } from '../card-values';
import { clip, dayLabel, formatDateTime, memberNames, money, placeName, Rows, text } from '../preview-format';
import { rowsOf } from '../undo-snapshot';
import { bookingRowOf, stayRowOf } from './booking-trip';
import type { AssistantChangeRow } from '@trek/shared';

/**
 * The words of the curated booking changes: the row a receipt, a share text
 * or a thread stored before the cards still reads. The card draws the rest;
 * the booking reference is left out here as on the card.
 */

type Describer = (ctx: PreviewContext, args: ToolArgs) => Described;

/** A date and time as the card writes it; a bare clock as it came. */
function when(ctx: PreviewContext, value: unknown): string {
  if (typeof value !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? formatDateTime(ctx, value) : text(value);
}

/** "Frankfurt (FRA) → New York (JFK)" from endpoints, empty without both ends. */
function routeText(endpoints: unknown): string {
  const stops = rowsOf(endpoints);
  const end = (role: string) => {
    const found = stops.find((ep) => ep.role === role);
    const name = text(found?.name);
    const code = text(found?.code);
    if (!name) return code;
    return code && code !== name ? `${name} (${code})` : name;
  };
  const from = end('from');
  const to = end('to');
  return from && to ? clip(`${from} → ${to}`) : '';
}

/** A stay's nights in words: the place, check-in day to check-out day. */
function stayText(ctx: PreviewContext, placeId: number | null, start: number | null, end: number | null): string {
  if (start === null || end === null) return '';
  const place = placeName(ctx, placeId);
  const range = `${dayLabel(ctx, start)} → ${dayLabel(ctx, end)}`;
  return place ? `${place}, ${range}` : range;
}

function price(ctx: PreviewContext, amount: unknown, currency: unknown): string {
  if (typeof amount !== 'number' || amount <= 0) return '';
  return money(ctx, amount, typeof currency === 'string' ? currency : ctx.card.currency);
}

/** A status change, under the plain field name the generic card uses. */
function statusRow(rows: Rows, before: unknown, after: unknown): void {
  if (after === undefined) return;
  const row: AssistantChangeRow = {
    op: 'change',
    labelKey: 'field',
    field: 'status',
    before: text(before) || null,
    after: text(after),
  };
  rows.rows.push(row);
}

/** The changes an update makes to a booking, each against what the trip holds now. */
function bookingChangeRows(ctx: PreviewContext, current: Row, args: ToolArgs): Rows {
  const rows = new Rows();
  if (args.title !== undefined) rows.change('name', text(current.title), text(args.title));
  if (args.type !== undefined) rows.change('type', text(current.type), text(args.type));
  statusRow(rows, current.status, args.status);
  if (args.start_day_id !== undefined) {
    rows.change('day', dayLabel(ctx, argId(current, 'day_id')), dayLabel(ctx, argId(args, 'start_day_id')));
  }
  if (args.reservation_time !== undefined) {
    rows.change('time', when(ctx, current.reservation_time), when(ctx, args.reservation_time));
  }
  if (args.reservation_end_time !== undefined) {
    rows.change('endTime', when(ctx, current.reservation_end_time), when(ctx, args.reservation_end_time));
  }
  if (args.endpoints !== undefined) rows.change('route', routeText(current.endpoints), routeText(args.endpoints));
  if (args.location !== undefined) rows.change('location', text(current.location), text(args.location));
  if (args.notes !== undefined) rows.change('notes', text(current.notes), text(args.notes));
  return rows;
}

function updateBooking(tool: string): Describer {
  return (ctx, args) => {
    const current = recordOf(bookingRowOf(ctx.card, argId(args, 'reservationId')));
    return {
      subject: text(current.title) || text(args.title),
      rows: bookingChangeRows(ctx, current, args),
      dayId: argId(current, 'day_id'),
      placeIds: [],
      tool,
    };
  };
}

export const BOOKING_DESCRIBERS: Readonly<Record<string, Describer>> = {
  create_transport: (ctx, args) => {
    const dayId = argId(args, 'start_day_id');
    const rows = new Rows()
      .add('type', text(args.type))
      .add('route', routeText(args.endpoints))
      .add('day', dayLabel(ctx, dayId))
      .add('time', when(ctx, args.reservation_time))
      .add('endTime', when(ctx, args.reservation_end_time))
      .add('price', price(ctx, args.price, null))
      .add('notes', text(args.notes));
    return { subject: text(args.title), rows, dayId, placeIds: [], tool: 'create_transport' };
  },
  update_reservation: updateBooking('update_reservation'),
  update_transport: updateBooking('update_transport'),
  set_reservation_travelers: (ctx, args) => {
    const current = recordOf(bookingRowOf(ctx.card, argId(args, 'reservationId')));
    const before = rowsOf(current.travelers).map((traveler) => traveler.user_id);
    const rows = new Rows().change('members', memberNames(ctx, before), memberNames(ctx, args.user_ids));
    return {
      subject: text(current.title),
      rows,
      dayId: argId(current, 'day_id'),
      placeIds: [],
      tool: 'set_reservation_travelers',
    };
  },
  link_hotel_accommodation: (ctx, args) => {
    const current = recordOf(bookingRowOf(ctx.card, argId(args, 'reservationId')));
    const placeId = argId(args, 'place_id');
    const start = argId(args, 'start_day_id');
    const rows = new Rows()
      .add('stay', stayText(ctx, placeId, start, argId(args, 'end_day_id')))
      .add('checkIn', text(args.check_in))
      .add('checkOut', text(args.check_out));
    return {
      subject: text(current.title),
      rows,
      dayId: start,
      placeIds: placeId ? [placeId] : [],
      tool: 'link_hotel_accommodation',
    };
  },
  create_accommodation: (ctx, args) => {
    const placeId = argId(args, 'place_id');
    const start = argId(args, 'start_day_id');
    const rows = new Rows()
      .add('stay', stayText(ctx, null, start, argId(args, 'end_day_id')))
      .add('checkIn', text(args.check_in))
      .add('checkOut', text(args.check_out))
      .add('notes', text(args.notes));
    return {
      subject: placeName(ctx, placeId),
      rows,
      dayId: start,
      placeIds: placeId ? [placeId] : [],
      tool: 'create_accommodation',
    };
  },
  create_place_accommodation: (ctx, args) => {
    const start = argId(args, 'start_day_id');
    const rows = new Rows()
      .add('address', text(args.address))
      .add('stay', stayText(ctx, null, start, argId(args, 'end_day_id')))
      .add('checkIn', text(args.check_in))
      .add('checkOut', text(args.check_out))
      .add('price', price(ctx, args.price, args.currency))
      .add('notes', text(args.accommodation_notes));
    return { subject: text(args.name), rows, dayId: start, placeIds: [] };
  },
  update_accommodation: (ctx, args) => {
    const current = recordOf(stayRowOf(ctx.card, argId(args, 'accommodationId')));
    const placeId = argId(args, 'place_id') ?? argId(current, 'place_id');
    const rows = new Rows();
    if (args.place_id !== undefined) {
      rows.change('stay', placeName(ctx, argId(current, 'place_id')), placeName(ctx, argId(args, 'place_id')));
    }
    if (args.start_day_id !== undefined || args.end_day_id !== undefined) {
      const before = stayText(ctx, null, argId(current, 'start_day_id'), argId(current, 'end_day_id'));
      const start = argId(args, 'start_day_id') ?? argId(current, 'start_day_id');
      rows.change('day', before, stayText(ctx, null, start, argId(args, 'end_day_id') ?? argId(current, 'end_day_id')));
    }
    if (args.check_in !== undefined) rows.change('checkIn', text(current.check_in), text(args.check_in));
    if (args.check_out !== undefined) rows.change('checkOut', text(current.check_out), text(args.check_out));
    if (args.notes !== undefined) rows.change('notes', text(current.notes), text(args.notes));
    return {
      subject: text(current.place_name) || placeName(ctx, placeId),
      rows,
      dayId: argId(args, 'start_day_id') ?? argId(current, 'start_day_id'),
      placeIds: placeId ? [placeId] : [],
    };
  },
};
