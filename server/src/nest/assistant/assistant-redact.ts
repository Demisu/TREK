import { MAX_TOOL_OUTPUT_CHARS } from './assistant-tools.constants';

/**
 * What a tool answer may carry to the provider. The model plans the trip; it
 * has no use for anyone's e-mail address, a booking's confirmation code or a
 * phone number, so those are hidden, and the bulky fields (pictures inlined as
 * data URLs, route geometry) are dropped before the answer is cut to size.
 */

const HIDDEN = '[hidden]';

/** Keys whose value is personal or a booking secret. */
const SECRET_KEYS = new Set(['email', 'confirmation_number', 'confirmation', 'phone', 'feed_token', 'password']);

/** Keys that cost a lot and tell the model nothing it plans with. */
const DROPPED_KEY = /^(image_url|cover_image|avatar|avatar_url|metadata)$|geometry/;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** Longest string kept whole; a longer one keeps its start. */
const MAX_STRING_CHARS = 4_000;

/** Array lengths tried, longest first, until the answer fits. */
const ARRAY_CAPS = [100, 50, 20, 10, 5, 2, 1];

type Json = unknown;

function isRecord(value: Json): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The value with secrets hidden, bulky fields dropped and e-mail addresses in free text masked. */
export function redactForProvider(value: Json): Json {
  if (typeof value === 'string') return value.replace(EMAIL, HIDDEN);
  if (Array.isArray(value)) return value.map(redactForProvider);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (DROPPED_KEY.test(key)) continue;
    out[key] = SECRET_KEYS.has(key) && inner !== null && inner !== '' ? HIDDEN : redactForProvider(inner);
  }
  return out;
}

function pick(row: Json, keys: readonly string[]): Record<string, unknown> | null {
  if (!isRecord(row)) return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) if (row[key] !== undefined) out[key] = row[key];
  return out;
}

function pickAll(rows: Json, keys: readonly string[]): Record<string, unknown>[] {
  return Array.isArray(rows) ? rows.map((row) => pick(row, keys)).filter((row) => row !== null) : [];
}

const ASSIGNMENT_KEYS = ['id', 'place_id', 'order_index', 'assignment_time', 'assignment_end_time', 'notes'] as const;
const PLACE_KEYS = ['name', 'address', 'lat', 'lng', 'category_id', 'place_time', 'end_time'] as const;

function projectDay(day: Json): Record<string, unknown> | null {
  if (!isRecord(day)) return null;
  return {
    ...pick(day, ['id', 'day_number', 'date', 'title']),
    assignments: (Array.isArray(day.assignments) ? day.assignments : [])
      .filter(isRecord)
      .map((assignment) => ({ ...pick(assignment, ASSIGNMENT_KEYS), place: pick(assignment.place, PLACE_KEYS) })),
    notes: pickAll(day.notes, ['id', 'text', 'time', 'icon']),
  };
}

/**
 * `get_trip_summary` as the model gets it: the plan (days with their places
 * and notes, stays, bookings, the packing and to-do lists), without the
 * members' contact details, the shared notes or the budget rows, which have
 * tools of their own.
 */
function projectTripSummary(summary: Json): Json {
  if (!isRecord(summary)) return summary;
  const members = isRecord(summary.members) ? summary.members : {};
  const people = [members.owner, ...(Array.isArray(members.collaborators) ? members.collaborators : [])];
  const packing = isRecord(summary.packing) ? summary.packing : {};
  return {
    trip: pick(summary.trip, ['id', 'title', 'description', 'start_date', 'end_date', 'currency']),
    members: pickAll(people, ['id', 'username']),
    days: (Array.isArray(summary.days) ? summary.days : []).map(projectDay).filter((day) => day !== null),
    accommodations: pickAll(summary.accommodations, [
      'id',
      'place_id',
      'start_day_id',
      'end_day_id',
      'check_in',
      'check_out',
    ]),
    reservations: pickAll(summary.reservations, [
      'id',
      'title',
      'type',
      'status',
      'reservation_time',
      'reservation_end_time',
      'location',
      'day_id',
      'end_day_id',
      'place_id',
      'assignment_id',
    ]),
    packing: pickAll(packing.items, ['id', 'name', 'category', 'checked', 'quantity', 'packed_quantity']),
    todos: pickAll(summary.todos, ['id', 'name', 'category', 'checked', 'due_date', 'priority', 'assigned_user_id']),
  };
}

/**
 * `suggest_atlas_countries` as the model gets it: each country with its
 * cities and the minutes spent in them, without when the user was last seen
 * in each city. The model offers countries to mark; a time per city would
 * hand the provider a dated trail of the user's whereabouts for nothing it
 * plans with.
 */
function projectAtlasSuggestions(value: Json): Json {
  if (!isRecord(value) || !Array.isArray(value.countries)) return value;
  return {
    ...value,
    countries: value.countries.map((country) =>
      isRecord(country) ? { ...country, cities: pickAll(country.cities, ['name', 'minutes']) } : country,
    ),
  };
}

const PROJECTIONS: Readonly<Record<string, (value: Json) => Json>> = {
  get_trip_summary: projectTripSummary,
  suggest_atlas_countries: projectAtlasSuggestions,
};

function shrink(value: Json, cap: number, cut: { done: boolean }): Json {
  if (typeof value === 'string' && value.length > MAX_STRING_CHARS) {
    cut.done = true;
    return `${value.slice(0, MAX_STRING_CHARS)}…`;
  }
  if (Array.isArray(value)) {
    if (value.length > cap) cut.done = true;
    return value.slice(0, cap).map((item) => shrink(item, cap, cut));
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shrink(inner, cap, cut)]));
}

/**
 * The value cut down until its JSON fits `maxChars`: long strings keep their
 * start, arrays their first entries, and the answer says it was cut
 * (`truncated: true`), so the model knows to narrow its question rather than
 * read a list as complete. Never a cut through the middle of the JSON.
 */
export function fitToSize(value: Json, maxChars = MAX_TOOL_OUTPUT_CHARS): Json {
  if (JSON.stringify(value).length <= maxChars) return value;
  for (const cap of ARRAY_CAPS) {
    const cut = { done: false };
    const shrunk = shrink(value, cap, cut);
    const marked = isRecord(shrunk) ? { ...shrunk, truncated: true } : { items: shrunk, truncated: true };
    if (JSON.stringify(marked).length <= maxChars) return marked;
  }
  return { truncated: true, note: 'The answer was too large. Ask for less at once.' };
}

/** A tool's answer as the provider and the client see it: projected, redacted and cut to size. */
export function toolOutputForProvider(toolName: string, value: Json, maxChars = MAX_TOOL_OUTPUT_CHARS): Json {
  const project = PROJECTIONS[toolName];
  return fitToSize(redactForProvider(project ? project(value) : value), maxChars);
}
