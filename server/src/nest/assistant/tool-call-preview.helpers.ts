import type { CardPlace, TripCard } from './assistant-context';
import { noteOf } from './assistant-memory';
import {
  ASSISTANT_SERVER_WRITE_TOOLS,
  ASSISTANT_UNDO_MAP,
  ASSISTANT_WRITE_TOOLS,
  IMPORT_BOOKING_TOOL,
  REMEMBER_TOOL,
  writeToolOf,
} from './assistant-tools.constants';
import type { ToolHint } from './assistant-tools.service';
import { describeGeneric } from './tool-call-generic.helpers';
import type {
  AssistantApplied,
  AssistantChangeEffect,
  AssistantChangeLabelKey,
  AssistantChangePreview,
  AssistantChangeRow,
} from '@trek/shared';

/**
 * The change card of a held tool call: what it does and to what, in plain
 * words. Days, places, categories and people are named instead of numbered,
 * dates and amounts are written in the user's locale, and an update shows
 * what the field held before.
 */

type Args = Record<string, unknown>;

export interface PreviewContext {
  card: TripCard;
  categories: ReadonlyMap<number, string>;
  locale: string;
  /** What a tool without a card of its own says about itself, for the card built from its arguments. */
  hintOf?: (toolName: string) => ToolHint | null;
}

/** Longest value a row shows; URLs keep their start, so the host stays visible. */
const MAX_VALUE_CHARS = 160;
const MAX_ROWS = 12;

const CHECKED = '✓';
const UNCHECKED = '✗';

function clip(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > MAX_VALUE_CHARS ? `${line.slice(0, MAX_VALUE_CHARS - 1)}…` : line;
}

function id(args: Args, key: string): number | null {
  const value = args[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function has(args: Args, key: string): boolean {
  return args[key] !== undefined;
}

/** A locale Intl accepts, the user's when it can. */
function localeOf(ctx: PreviewContext): string {
  try {
    return Intl.getCanonicalLocales(ctx.locale)[0] ?? 'en';
  } catch {
    return 'en';
  }
}

function formatDate(ctx: PreviewContext, isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(localeOf(ctx), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateTime(ctx: PreviewContext, value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${formatDate(ctx, match[1])}, ${match[2]}` : value;
}

/** A day as the planner names it: its date (and title), or its title, or its number. */
export function dayLabel(ctx: PreviewContext, dayId: number | null): string {
  if (dayId === null) return '';
  const day = ctx.card.days.find((d) => d.id === dayId);
  if (!day) return `#${dayId}`;
  if (day.date) return day.title ? `${formatDate(ctx, day.date)}, ${day.title}` : formatDate(ctx, day.date);
  return day.title ?? `#${day.number}`;
}

function placeName(ctx: PreviewContext, placeId: number | null): string {
  if (placeId === null) return '';
  return ctx.card.places.get(placeId)?.name ?? `#${placeId}`;
}

function money(ctx: PreviewContext, amount: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat(localeOf(ctx), { style: 'currency', currency }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }
  return new Intl.NumberFormat(localeOf(ctx)).format(amount);
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? CHECKED : UNCHECKED;
  return clip(String(value));
}

function openingHours(ctx: PreviewContext, value: unknown): string {
  if (!Array.isArray(value)) return '';
  const weekday = new Intl.DateTimeFormat(localeOf(ctx), { weekday: 'short', timeZone: 'UTC' });
  return clip(
    value
      .map((entry: unknown, index) => {
        const day = weekday.format(new Date(Date.UTC(2024, 0, 1 + index)));
        const hours = (entry ?? {}) as { closed?: unknown; open?: unknown; close?: unknown };
        return hours.closed === true ? `${day} ${UNCHECKED}` : `${day} ${text(hours.open)}-${text(hours.close)}`;
      })
      .join(', '),
  );
}

function memberNames(ctx: PreviewContext, ids: unknown): string {
  if (!Array.isArray(ids)) return '';
  return clip(ids.map((memberId) => ctx.card.members.get(Number(memberId)) ?? `#${String(memberId)}`).join(', '));
}

class Rows {
  readonly rows: AssistantChangeRow[] = [];

  add(labelKey: AssistantChangeLabelKey, after: string): this {
    if (after !== '') this.rows.push({ op: 'add', labelKey, before: null, after });
    return this;
  }

  change(labelKey: AssistantChangeLabelKey, before: string | null, after: string): this {
    this.rows.push({ op: 'change', labelKey, before: before || null, after });
    return this;
  }

  move(labelKey: AssistantChangeLabelKey, before: string, after: string): this {
    this.rows.push({ op: 'move', labelKey, before: before || null, after });
    return this;
  }
}

function coordinates(args: Args): string {
  const { lat, lng } = args;
  return typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '';
}

function categoryName(ctx: PreviewContext, categoryId: number | null): string {
  return categoryId === null ? '' : (ctx.categories.get(categoryId) ?? `#${categoryId}`);
}

/** The fields a new place carries, shared by both ways of creating one. */
function newPlaceRows(ctx: PreviewContext, args: Args, rows: Rows, notesKey: string): void {
  rows
    .add('address', text(args.address))
    .add('coordinates', coordinates(args))
    .add('category', categoryName(ctx, id(args, 'category_id')))
    .add('description', text(args.description))
    .add('notes', text(args[notesKey]))
    .add('website', text(args.website))
    .add('phone', text(args.phone))
    .add('email', text(args.email))
    .add('openingHours', openingHours(ctx, args.opening_hours))
    .add('price', typeof args.price === 'number' ? money(ctx, args.price, text(args.currency) || null) : '')
    .add('stopType', text(args.stop_type));
}

/** The plain fields of a place: the tool's argument, the row's label and the field the card knows it by. */
const PLACE_TEXT_FIELDS: ReadonlyArray<[string, AssistantChangeLabelKey, keyof CardPlace]> = [
  ['name', 'name', 'name'],
  ['address', 'address', 'address'],
  ['description', 'description', 'description'],
  ['notes', 'notes', 'notes'],
  ['website', 'website', 'website'],
  ['phone', 'phone', 'phone'],
  ['email', 'email', 'email'],
  ['place_time', 'time', 'placeTime'],
  ['end_time', 'endTime', 'endTime'],
  ['stop_type', 'stopType', 'stopType'],
];

function updatePlaceRows(ctx: PreviewContext, args: Args, rows: Rows): void {
  const current = ctx.card.places.get(id(args, 'placeId') ?? 0);
  for (const [argKey, labelKey, field] of PLACE_TEXT_FIELDS) {
    if (has(args, argKey)) rows.change(labelKey, current ? text(current[field]) : null, text(args[argKey]));
  }
  if (has(args, 'lat') || has(args, 'lng')) {
    const before = current ? coordinates({ lat: current.lat, lng: current.lng }) : null;
    rows.change('coordinates', before, coordinates({ lat: args.lat ?? current?.lat, lng: args.lng ?? current?.lng }));
  }
  if (has(args, 'category_id')) {
    rows.change('category', categoryName(ctx, current?.categoryId ?? null), categoryName(ctx, id(args, 'category_id')));
  }
  if (has(args, 'price')) {
    const currency = text(args.currency) || current?.currency || null;
    const before = current?.price != null ? money(ctx, current.price, current.currency) : null;
    rows.change('price', before, typeof args.price === 'number' ? money(ctx, args.price, currency) : '');
  }
  if (has(args, 'opening_hours')) rows.change('openingHours', null, openingHours(ctx, args.opening_hours));
}

/** A date, or a date and time, as the card writes it; anything else as it came. */
function when(ctx: PreviewContext, value: unknown): string {
  if (typeof value !== 'string') return '';
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? formatDateTime(ctx, value) : text(formatDate(ctx, value));
}

/** The trip day a booking falls on, by the date it starts. */
function dayOn(ctx: PreviewContext, value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const date = value.slice(0, 10);
  return ctx.card.days.find((day) => day.date === date)?.id ?? null;
}

/** "Frankfurt (FRA) → New York (JFK)" from a booking's endpoints, empty without both ends. */
function route(endpoints: unknown): string {
  if (!Array.isArray(endpoints)) return '';
  const end = (role: string) => {
    const found = endpoints.find((ep: unknown) => (ep as { role?: unknown } | null)?.role === role) as
      { name?: unknown; code?: unknown } | undefined;
    const name = text(found?.name);
    const code = text(found?.code);
    if (!name) return code;
    return code && code !== name ? `${name} (${code})` : name;
  };
  const from = end('from');
  const to = end('to');
  return from && to ? clip(`${from} → ${to}`) : '';
}

/**
 * A booking read from an attached file (a BookingImportPreviewItem): what it
 * is, where it goes, when, and the reference the provider gave it.
 */
function describeBooking(ctx: PreviewContext, args: Args): Described {
  const stay = (args._accommodation ?? {}) as Args;
  const venue = (args._venue ?? {}) as Args;
  const meta = (args.metadata ?? {}) as Args;
  const starts = args.reservation_time ?? stay.check_in;
  const price = typeof meta.price === 'number' ? meta.price : Number(meta.price);
  const currency = typeof meta.priceCurrency === 'string' ? meta.priceCurrency : ctx.card.currency;
  const dayId = dayOn(ctx, starts);
  const rows = new Rows()
    .add('type', text(args.type))
    .add('route', route(args.endpoints))
    .add('day', dayLabel(ctx, dayId))
    .add('time', when(ctx, args.reservation_time))
    .add('endTime', when(ctx, args.reservation_end_time))
    .add('checkIn', when(ctx, stay.check_in))
    .add('checkOut', when(ctx, stay.check_out))
    .add('location', text(args.location ?? venue.name))
    .add('address', text(venue.address))
    .add('confirmation', text(args.confirmation_number ?? stay.confirmation))
    .add('price', Number.isFinite(price) && price > 0 ? money(ctx, price, currency) : '');
  return { subject: text(args.title), rows, dayId, placeIds: [] };
}

interface Described {
  subject: string;
  rows: Rows;
  dayId: number | null;
  placeIds: number[];
}

type Describer = (ctx: PreviewContext, args: Args) => Described;

/** Who shares an expense: the uneven split's members, else the equal one's. */
function splitOf(args: Args): unknown {
  return Array.isArray(args.members)
    ? args.members.map((member: unknown) => (member as { user_id?: unknown } | null)?.user_id)
    : args.member_ids;
}

const DESCRIBERS: Readonly<Record<string, Describer>> = {
  create_place: (ctx, args) => {
    const rows = new Rows();
    newPlaceRows(ctx, args, rows, 'notes');
    return { subject: text(args.name), rows, dayId: null, placeIds: [] };
  },
  create_and_assign_place: (ctx, args) => {
    const dayId = id(args, 'dayId');
    const rows = new Rows().add('day', dayLabel(ctx, dayId));
    newPlaceRows(ctx, args, rows, 'place_notes');
    return { subject: text(args.name), rows, dayId, placeIds: [] };
  },
  update_place: (ctx, args) => {
    const placeId = id(args, 'placeId');
    const rows = new Rows();
    updatePlaceRows(ctx, args, rows);
    return { subject: placeName(ctx, placeId), rows, dayId: null, placeIds: placeId ? [placeId] : [] };
  },
  assign_place_to_day: (ctx, args) => {
    const dayId = id(args, 'dayId');
    const placeId = id(args, 'placeId');
    const rows = new Rows().add('day', dayLabel(ctx, dayId)).add('notes', text(args.notes));
    return { subject: placeName(ctx, placeId), rows, dayId, placeIds: placeId ? [placeId] : [] };
  },
  move_assignment: (ctx, args) => {
    const assignment = ctx.card.assignments.get(id(args, 'assignmentId') ?? 0);
    const dayId = id(args, 'newDayId');
    const rows = new Rows().move('day', dayLabel(ctx, assignment?.dayId ?? null), dayLabel(ctx, dayId));
    const placeId = assignment?.placeId ?? null;
    return { subject: placeName(ctx, placeId), rows, dayId, placeIds: placeId ? [placeId] : [] };
  },
  unassign_place: (ctx, args) => {
    const assignment = ctx.card.assignments.get(id(args, 'assignmentId') ?? 0);
    const dayId = assignment?.dayId ?? id(args, 'dayId');
    const placeId = assignment?.placeId ?? null;
    const rows = new Rows().add('day', dayLabel(ctx, dayId));
    return { subject: placeName(ctx, placeId), rows, dayId, placeIds: placeId ? [placeId] : [] };
  },
  create_day_note: (ctx, args) => {
    const dayId = id(args, 'dayId');
    const rows = new Rows()
      .add('day', dayLabel(ctx, dayId))
      .add('time', text(args.time))
      .add('icon', text(args.icon))
      .add('color', text(args.color));
    return { subject: text(args.text), rows, dayId, placeIds: [] };
  },
  update_day_note: (ctx, args) => {
    const note = ctx.card.notes.get(id(args, 'noteId') ?? 0);
    const rows = new Rows();
    if (has(args, 'text')) rows.change('text', note?.text ?? null, text(args.text));
    if (has(args, 'time')) rows.change('time', note?.time ?? null, text(args.time));
    if (has(args, 'icon')) rows.change('icon', note?.icon ?? null, text(args.icon));
    if (has(args, 'color')) rows.change('color', note?.color ?? null, text(args.color));
    return { subject: note?.text ?? text(args.text), rows, dayId: id(args, 'dayId'), placeIds: [] };
  },
  create_packing_item: (_ctx, args) => {
    const rows = new Rows()
      .add('category', text(args.category))
      .add('quantity', text(args.quantity))
      .add('weight', typeof args.weight_grams === 'number' ? `${args.weight_grams} g` : '')
      .add('packed', args.checked === undefined ? '' : text(!!args.checked));
    return { subject: text(args.name), rows, dayId: null, placeIds: [] };
  },
  update_packing_item: (ctx, args) => {
    const item = ctx.card.packing.get(id(args, 'itemId') ?? 0);
    const rows = new Rows();
    if (has(args, 'name')) rows.change('name', item?.name ?? null, text(args.name));
    if (has(args, 'category')) rows.change('category', item?.category ?? null, text(args.category));
    if (has(args, 'quantity')) rows.change('quantity', text(item?.quantity), text(args.quantity));
    if (has(args, 'packed_quantity')) rows.change('packed', text(item?.packedQuantity), text(args.packed_quantity));
    if (has(args, 'weight_grams')) {
      const grams = (value: unknown) => (typeof value === 'number' ? `${value} g` : '');
      rows.change('weight', grams(item?.weight), grams(args.weight_grams));
    }
    return { subject: item?.name ?? text(args.name), rows, dayId: null, placeIds: [] };
  },
  create_todo: (ctx, args) => {
    const priority = typeof args.priority === 'number' && args.priority > 0 ? `P${args.priority}` : '';
    const rows = new Rows()
      .add('category', text(args.category))
      .add('dueDate', typeof args.due_date === 'string' ? formatDate(ctx, args.due_date) : '')
      .add('priority', priority)
      .add('assignee', memberNames(ctx, has(args, 'assigned_user_id') ? [args.assigned_user_id] : null))
      .add('description', text(args.description));
    return { subject: text(args.name), rows, dayId: null, placeIds: [] };
  },
  create_budget_item: (ctx, args) => {
    const placeId = id(args, 'place_id');
    const rows = new Rows()
      .add(
        'price',
        typeof args.total_price === 'number'
          ? money(ctx, args.total_price, text(args.currency) || ctx.card.currency)
          : '',
      )
      .add('category', text(args.category))
      .add('members', memberNames(ctx, splitOf(args)))
      .add('location', placeName(ctx, placeId))
      .add('notes', text(args.note));
    return { subject: text(args.name), rows, dayId: null, placeIds: placeId ? [placeId] : [] };
  },
  update_budget_item: (ctx, args) => {
    const price =
      typeof args.total_price === 'number'
        ? money(ctx, args.total_price, text(args.currency) || ctx.card.currency)
        : '';
    const rows = new Rows()
      .add('name', text(args.name))
      .add('price', price)
      .add('category', text(args.category))
      .add('members', memberNames(ctx, splitOf(args)))
      .add('notes', text(args.note));
    return { subject: text(args.name) || `#${id(args, 'itemId') ?? ''}`, rows, dayId: null, placeIds: [] };
  },
  [REMEMBER_TOOL]: (_ctx, args) => ({ subject: noteOf(args) ?? '', rows: new Rows(), dayId: null, placeIds: [] }),
  create_reservation: (ctx, args) => {
    const placeId = id(args, 'place_id');
    const startDay = id(args, 'start_day_id');
    const endDay = id(args, 'end_day_id');
    const stay =
      placeId && startDay && endDay
        ? `${placeName(ctx, placeId)}, ${dayLabel(ctx, startDay)} → ${dayLabel(ctx, endDay)}`
        : '';
    const rows = new Rows()
      .add('type', text(args.type))
      .add('day', dayLabel(ctx, id(args, 'day_id')))
      .add('time', typeof args.reservation_time === 'string' ? formatDateTime(ctx, args.reservation_time) : '')
      .add(
        'endTime',
        typeof args.reservation_end_time === 'string' ? formatDateTime(ctx, args.reservation_end_time) : '',
      )
      .add('stay', stay)
      .add('checkIn', text(args.check_in))
      .add('checkOut', text(args.check_out))
      .add('location', text(args.location))
      .add('link', text(args.url))
      .add('confirmation', text(args.confirmation_number))
      .add('price', typeof args.price === 'number' ? money(ctx, args.price, ctx.card.currency) : '')
      .add('notes', text(args.notes));
    return {
      subject: text(args.title),
      rows,
      dayId: id(args, 'day_id') ?? startDay,
      placeIds: placeId ? [placeId] : [],
    };
  },
  [IMPORT_BOOKING_TOOL]: describeBooking,
};

/** A held write of the model's tools or of the server's own (a booking from a file). */
function writeTool(toolName: string) {
  return ASSISTANT_WRITE_TOOLS[toolName] ?? ASSISTANT_SERVER_WRITE_TOOLS[toolName];
}

function inRange(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

/** A change to the day plan, with nothing of what the kind does not name. */
function effect(
  kind: AssistantChangeEffect['kind'],
  dayId: number | null,
  fields: Partial<Omit<AssistantChangeEffect, 'kind' | 'dayId'>>,
): AssistantChangeEffect | null {
  if (dayId === null) return null;
  return { kind, dayId, fromDayId: null, placeId: null, assignmentId: null, place: null, ...fields };
}

/**
 * What a change does to the day plan, for the map and the day's timeline: the
 * day a place lands on or leaves, and for a place that does not exist yet its
 * name and position. Changes that do not touch the plan have none.
 */
const EFFECTS: Readonly<Record<string, (ctx: PreviewContext, args: Args) => AssistantChangeEffect | null>> = {
  create_and_assign_place: (_ctx, args) => {
    const { lat, lng } = args;
    const name = text(args.name);
    if (!inRange(lat, 90) || !inRange(lng, 180) || name === '') return effect('add', id(args, 'dayId'), {});
    return effect('add', id(args, 'dayId'), { place: { name, lat, lng, categoryId: id(args, 'category_id') } });
  },
  assign_place_to_day: (_ctx, args) => effect('add', id(args, 'dayId'), { placeId: id(args, 'placeId') }),
  move_assignment: (ctx, args) => {
    const assignmentId = id(args, 'assignmentId');
    const assignment = ctx.card.assignments.get(assignmentId ?? 0);
    return effect('move', id(args, 'newDayId'), {
      fromDayId: assignment?.dayId ?? null,
      placeId: assignment?.placeId ?? null,
      assignmentId,
    });
  },
  unassign_place: (ctx, args) => {
    const assignmentId = id(args, 'assignmentId');
    const assignment = ctx.card.assignments.get(assignmentId ?? 0);
    return effect('remove', assignment?.dayId ?? id(args, 'dayId'), {
      placeId: assignment?.placeId ?? null,
      assignmentId,
    });
  },
};

/**
 * The change card for a held call of one of the writing tools, or of a
 * change the server proposed itself (a booking from a file, a found place).
 * `args` are the arguments as stored (the trip id is not among them). A found
 * place reads as the tool it runs through.
 */
export function describeToolCall(
  toolName: string,
  toolCallId: string,
  args: Args,
  ctx: PreviewContext,
): AssistantChangePreview {
  const runs = writeToolOf(toolName, args);
  const tool = writeTool(runs);
  const describe = DESCRIBERS[runs];
  // The server's own steps all have a card; one without is a call that names no real tool.
  if (tool && !describe) throw new Error(`No change card for tool "${toolName}"`);
  if (!tool || !describe) return describeGeneric(runs, toolCallId, args, ctx.card, ctx.hintOf?.(runs) ?? null);
  const described = describe(ctx, args);
  return {
    toolCallId,
    verbKey: tool.verbKey,
    subject: clip(described.subject),
    rows: described.rows.rows.slice(0, MAX_ROWS),
    dayId: described.dayId,
    placeIds: described.placeIds,
    undoable: runs in ASSISTANT_UNDO_MAP,
    effect: EFFECTS[runs]?.(ctx, args) ?? null,
  };
}

/** Where a tool's answer names what it created or changed, and the argument that names it otherwise. */
const RESULT_KEYS = ['place', 'assignment', 'note', 'item', 'reservation'] as const;
const ARG_KEYS = ['placeId', 'assignmentId', 'noteId', 'itemId'] as const;

function createdId(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  for (const key of RESULT_KEYS) {
    const created = (result as Args)[key];
    const value = created && typeof created === 'object' ? id(created as Args, 'id') : null;
    if (value !== null) return value;
  }
  return null;
}

/** The day a created booking landed on, when its answer names one. */
function bookedDay(result: unknown): number | null {
  const reservation = result && typeof result === 'object' ? (result as Args).reservation : null;
  return reservation && typeof reservation === 'object' ? id(reservation as Args, 'day_id') : null;
}

/**
 * The receipt of an applied change: what it touched (the created row from its
 * answer, the changed one from its arguments), the day "Show on map" goes to
 * (the card's, else the one a created booking landed on), and until when it
 * can be undone.
 */
export function appliedChange(
  toolName: string,
  toolCallId: string,
  args: Args,
  result: unknown,
  dayId: number | null,
  undoUntil: string | null,
): AssistantApplied | null {
  // A tool without a card of its own touched something the client has no view for.
  const tool = writeTool(writeToolOf(toolName, args)) ?? { entity: 'other' as const };
  const touched = createdId(result) ?? ARG_KEYS.map((key) => id(args, key)).find((value) => value !== null) ?? null;
  return {
    toolCallId,
    entity: tool.entity,
    ids: touched === null ? [] : [touched],
    dayId: dayId ?? bookedDay(result),
    undoUntil,
  };
}
