import type { TripCard } from './assistant-context';
import type { ToolHint } from './assistant-tools.service';
import type {
  AssistantChangeLabelKey,
  AssistantChangePreview,
  AssistantChangeRow,
  AssistantChangeVerbKey,
} from '@trek/shared';

/**
 * The change card of a writing tool without a card of its own, in the words
 * of the planner rather than of the tool: its subject is the place, day, note
 * or booking it works on, named from the trip card (an assignment reads as its
 * place), or the name or title it is given; its rows are the arguments under
 * the labels the other cards use (time, end, notes, day …), with ids named and
 * lists of ids read as the names in their order. The verb comes from what the
 * tool says it does; the client names the tool's action where it knows it. It
 * is never undoable: only the tools with a matching removal are.
 */

type Args = Record<string, unknown>;

const MAX_ROWS = 12;
const MAX_VALUE_CHARS = 160;
const NAME_KEYS = ['name', 'title', 'text', 'label', 'question', 'content', 'region', 'country_code'] as const;

/** Arguments that mean what a label of the other cards means. */
const LABEL_OF: Readonly<Record<string, AssistantChangeLabelKey>> = {
  name: 'name',
  title: 'name',
  description: 'description',
  address: 'address',
  category: 'category',
  category_id: 'category',
  time: 'time',
  place_time: 'time',
  start_time: 'time',
  assignment_time: 'time',
  reservation_time: 'time',
  end_time: 'endTime',
  assignment_end_time: 'endTime',
  reservation_end_time: 'endTime',
  notes: 'notes',
  note: 'notes',
  website: 'website',
  url: 'link',
  phone: 'phone',
  email: 'email',
  price: 'price',
  total_price: 'price',
  currency: 'currency',
  quantity: 'quantity',
  dayId: 'day',
  day_id: 'day',
  end_day_id: 'day',
  date: 'day',
  due_date: 'dueDate',
  priority: 'priority',
  assigned_user_id: 'assignee',
  location: 'location',
  confirmation_number: 'confirmation',
  check_in: 'checkIn',
  check_out: 'checkOut',
  member_ids: 'members',
  assignmentIds: 'order',
  assignment_ids: 'order',
  dayIds: 'order',
  day_ids: 'order',
  orderedIds: 'order',
  type: 'type',
};

/** Arguments the card never shows: positions on the map, looks, and switches only the tool needs. */
const HIDDEN_KEYS: ReadonlySet<string> = new Set(['lat', 'lng', 'color', 'icon', 'expected_revision', 'force']);

function clip(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > MAX_VALUE_CHARS ? `${line.slice(0, MAX_VALUE_CHARS - 1)}…` : line;
}

/** "update_vacay_plan" reads as "update vacay plan"; only shown where nothing better is known. */
function humanToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

function verbOf(hint: ToolHint | null, name: string): AssistantChangeVerbKey {
  if (hint?.destructive || /^(delete|remove|unassign|unmark|clear|dissolve|unlink|unshare)_/.test(name)) {
    return 'genericRemove';
  }
  if (hint?.creates || /^(create|add|import|save|mark|copy|take_over|link)_/.test(name)) return 'genericCreate';
  return 'genericUpdate';
}

function dayName(card: TripCard, dayId: number): string | null {
  const day = card.days.find((d) => d.id === dayId);
  if (!day) return null;
  return day.title ?? day.date ?? `#${day.number}`;
}

/** What one id argument names in the trip: a place, a day, a note, a booking, an item, a person. */
function nameOf(card: TripCard, key: string, value: number, toolName: string): string | null {
  const k = key.toLowerCase().replace(/_/g, '');
  if (k === 'assignmentid') {
    const assignment = card.assignments.get(value);
    return assignment ? (card.places.get(assignment.placeId)?.name ?? null) : null;
  }
  if (k === 'placeid' || k === 'sourceplaceid') return card.places.get(value)?.name ?? null;
  if (k === 'dayid' || k === 'enddayid' || k === 'startdayid') return dayName(card, value);
  if (k === 'noteid') return card.notes.get(value)?.text ?? null;
  if (k === 'reservationid' || k === 'accommodationid') return card.reservations.get(value)?.title ?? null;
  if (k === 'itemid' && toolName.includes('packing')) return card.packing.get(value)?.name ?? null;
  if (k === 'userid' || k === 'memberid' || k === 'assigneduserid') return card.members.get(value) ?? null;
  return null;
}

/** An id list in its order, named where the card knows the ids (a new order of a day's places). */
function namesOf(card: TripCard, key: string, values: unknown[], toolName: string): string | null {
  const singular = key.replace(/(Ids|_ids)$/, (m) => (m === 'Ids' ? 'Id' : '_id'));
  const names = values.map((v) => (typeof v === 'number' ? nameOf(card, singular, v, toolName) : null));
  return names.some((n) => n === null) ? null : names.join(', ');
}

function valueText(card: TripCard, key: string, value: unknown, toolName: string): string {
  if (typeof value === 'number') {
    const name = nameOf(card, key, value, toolName);
    if (name) return clip(name);
  }
  if (Array.isArray(value)) {
    const names = namesOf(card, key, value, toolName);
    if (names) return clip(names);
    return clip(value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', '));
  }
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (value && typeof value === 'object') return clip(JSON.stringify(value));
  return clip(String(value));
}

/** The subject: what the tool is given a name for, else the first thing of the trip it works on. */
function subjectOf(card: TripCard, args: Args, toolName: string): { text: string; key: string | null } {
  const named = NAME_KEYS.find((key) => typeof args[key] === 'string' && (args[key] as string).trim());
  if (named) return { text: String(args[named]), key: named };
  const order = ['assignmentId', 'placeId', 'noteId', 'reservationId', 'itemId', 'dayId', 'day_id'];
  for (const key of order) {
    const value = args[key];
    const name = typeof value === 'number' ? nameOf(card, key, value, toolName) : null;
    if (name) return { text: name, key };
  }
  const list = Object.entries(args).find(([key, value]) => /(Ids|_ids)$/.test(key) && Array.isArray(value));
  if (list) {
    const names = namesOf(card, list[0], list[1] as unknown[], toolName);
    if (names) return { text: names, key: list[0] };
  }
  return { text: humanToolName(toolName), key: null };
}

function rowOf(card: TripCard, key: string, value: unknown, toolName: string): AssistantChangeRow {
  const labelKey = LABEL_OF[key] ?? 'field';
  return {
    op: 'add',
    labelKey,
    ...(labelKey === 'field' ? { field: key.slice(0, 60) } : {}),
    before: null,
    after: valueText(card, key, value, toolName),
  };
}

export function describeGeneric(
  toolName: string,
  toolCallId: string,
  args: Args,
  card: TripCard,
  hint: ToolHint | null,
): AssistantChangePreview {
  const subject = subjectOf(card, args, toolName);
  const rows = Object.entries(args)
    .filter(([key]) => key !== subject.key && !HIDDEN_KEYS.has(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, MAX_ROWS)
    .map(([key, value]) => rowOf(card, key, value, toolName));
  const dayArg = args.dayId ?? args.day_id;
  const assignment = typeof args.assignmentId === 'number' ? card.assignments.get(args.assignmentId) : undefined;
  const dayId = typeof dayArg === 'number' ? dayArg : (assignment?.dayId ?? null);
  const placeId = typeof args.placeId === 'number' ? args.placeId : (assignment?.placeId ?? null);
  return {
    toolCallId,
    verbKey: verbOf(hint, toolName),
    subject: clip(subject.text),
    rows,
    dayId: dayId !== null && card.days.some((d) => d.id === dayId) ? dayId : null,
    placeIds: placeId !== null && card.places.has(placeId) ? [placeId] : [],
    undoable: false,
    effect: null,
    tool: toolName,
    ...(hint?.group ? { domain: hint.group } : {}),
  };
}
