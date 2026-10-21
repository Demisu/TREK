import type { TripCard } from './assistant-context';
import type { ToolHint } from './assistant-tools.service';
import type { AssistantChangePreview, AssistantChangeRow, AssistantChangeVerbKey } from '@trek/shared';

/**
 * The change card of a writing tool without a card of its own: a verb read
 * from what the tool says it does (removes, creates, changes), a subject from
 * the name or title it is given, and one row per argument, with the trip's
 * days, places and people named where an argument holds their id. It is never
 * undoable: only the tools with a matching removal are.
 */

type Args = Record<string, unknown>;

const MAX_ROWS = 12;
const MAX_VALUE_CHARS = 160;
const SUBJECT_KEYS = ['name', 'title', 'text', 'label', 'content', 'region', 'country_code', 'date'] as const;

function clip(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > MAX_VALUE_CHARS ? `${line.slice(0, MAX_VALUE_CHARS - 1)}…` : line;
}

/** "update_vacay_plan" reads as "update vacay plan". */
export function humanToolName(name: string): string {
  return name.replace(/_/g, ' ');
}

function verbOf(hint: ToolHint | null, name: string): AssistantChangeVerbKey {
  if (hint?.destructive || /^(delete|remove|unassign|unmark|clear|dissolve|unlink|unshare)_/.test(name)) {
    return 'genericRemove';
  }
  if (hint?.creates || /^(create|add|import|save|mark|copy|take_over|link)_/.test(name)) return 'genericCreate';
  return 'genericUpdate';
}

/** An argument holding the id of a day, place or member, named as the trip names it. */
function named(card: TripCard, key: string, value: unknown): string | null {
  if (typeof value !== 'number') return null;
  if (/^day_?id$/i.test(key)) {
    const day = card.days.find((d) => d.id === value);
    return day ? (day.title ?? day.date ?? `#${day.number}`) : null;
  }
  if (/^place_?id$/i.test(key)) return card.places.get(value)?.name ?? null;
  if (/^(user_?id|member_?id|assigned_user_id)$/i.test(key)) return card.members.get(value) ?? null;
  return null;
}

function valueText(card: TripCard, key: string, value: unknown): string {
  const name = named(card, key, value);
  if (name) return clip(name);
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value)) {
    const items = value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)));
    return clip(items.join(', '));
  }
  if (value && typeof value === 'object') return clip(JSON.stringify(value));
  return clip(String(value));
}

export function describeGeneric(
  toolName: string,
  toolCallId: string,
  args: Args,
  card: TripCard,
  hint: ToolHint | null,
): AssistantChangePreview {
  const subjectKey = SUBJECT_KEYS.find((key) => typeof args[key] === 'string' && (args[key] as string).trim());
  const rows: AssistantChangeRow[] = Object.entries(args)
    .filter(([key, value]) => key !== subjectKey && value !== undefined && value !== null && value !== '')
    .slice(0, MAX_ROWS)
    .map(([key, value]) => ({
      op: 'add',
      labelKey: 'field',
      field: key.slice(0, 60),
      before: null,
      after: valueText(card, key, value),
    }));
  const dayId = typeof args.dayId === 'number' ? args.dayId : typeof args.day_id === 'number' ? args.day_id : null;
  const placeId = typeof args.placeId === 'number' ? args.placeId : null;
  return {
    toolCallId,
    verbKey: verbOf(hint, toolName),
    subject: clip(subjectKey ? String(args[subjectKey]) : humanToolName(toolName)),
    rows,
    dayId: dayId && card.days.some((d) => d.id === dayId) ? dayId : null,
    placeIds: placeId && card.places.has(placeId) ? [placeId] : [],
    undoable: false,
    effect: null,
    tool: toolName,
    ...(hint?.group ? { domain: hint.group } : {}),
  };
}
