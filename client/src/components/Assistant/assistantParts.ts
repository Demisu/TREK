import type {
  AssistantApplied,
  AssistantChangeEffect,
  AssistantChangeLabelKey,
  AssistantChangePreview,
  AssistantFoundPlace,
  AssistantMessage,
  AssistantMessagePart,
  AssistantPlaces,
  AssistantWeatherDay,
} from '@trek/shared';

/**
 * How an answer is laid out: its stored parts read as blocks. Text stays
 * text; the reading tools of a run sit together as one row of steps; the
 * changes the model proposes in one go sit together as one card, each with
 * its preview and, once applied, its receipt. The places a search found sit
 * as one strip, the newest search's, and the weather the steps looked up as
 * one row of days. Pure, so the window and the phone screen lay an answer out
 * the same way and a test can pin it.
 */

/** Where the settings card for the user's own AI connection lives. */
export const AI_SETTINGS_PATH = '/settings?tab=integrations';

type ToolCallPart = Extract<AssistantMessagePart, { type: 'tool-call' }>;

/** One reading tool the assistant ran or runs. */
export interface ToolStep {
  toolCallId: string;
  toolName: string;
  /** Still waiting for its result while the answer is being written. */
  running: boolean;
}

/**
 * Where a proposed change stands: waiting for the user, being applied,
 * applied, failed, discarded, or closed without a decision (expired, or the
 * turn was stopped).
 */
export type ChangeState = 'pending' | 'applying' | 'applied' | 'failed' | 'discarded' | 'expired';

export interface ChangeItem {
  toolCallId: string;
  /** What the card says about it; null until the preview arrived. */
  preview: AssistantChangePreview | null;
  /** The receipt of an applied change. */
  applied: AssistantApplied | null;
  state: ChangeState;
}

type MessageBlock =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'steps'; key: string; steps: ToolStep[] }
  | { kind: 'change'; key: string; items: ChangeItem[] }
  | { kind: 'places'; key: string; found: AssistantPlaces }
  | { kind: 'weather'; key: string; days: AssistantWeatherDay[] };

/** The change "+ Day 3" on a found place makes; the server holds it without a model turn. */
const FOUND_PLACE_TOOL = 'add_found_place';

/** Two points this close (about ten metres) are the same place. */
const SAME_SPOT_DEG = 1e-4;

/** A found place one of the answer's own changes already proposes, so its card would say the same twice. */
function proposed(place: AssistantFoundPlace, effects: readonly AssistantChangeEffect[]): boolean {
  return effects.some((effect) => {
    if (effect.placeId !== null && effect.placeId === place.inTripPlaceId) return true;
    const spot = effect.place;
    return (
      spot !== null && Math.abs(spot.lat - place.lat) < SAME_SPOT_DEG && Math.abs(spot.lng - place.lng) < SAME_SPOT_DEG
    );
  });
}

/** Every day the answer's weather steps looked up, one entry per date (the later look wins), by date. */
function weatherDays(parts: readonly AssistantMessagePart[]): AssistantWeatherDay[] {
  const byDate = new Map<string, AssistantWeatherDay>();
  for (const part of parts) {
    if (part.type === 'data-trek-weather') for (const day of part.data.days) byDate.set(day.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Adds a change to the change block before it, or starts one. A suggestion
 * from the strip is a block of its own, decided apart from the changes before
 * and after it, even where the answer joins them.
 */
function pushChange(blocks: MessageBlock[], item: ChangeItem, fromStrip: ReadonlySet<string>): void {
  const last = blocks[blocks.length - 1];
  const lastId = last?.kind === 'change' ? last.items[last.items.length - 1]?.toolCallId : undefined;
  const apart = fromStrip.has(item.toolCallId) || (lastId !== undefined && fromStrip.has(lastId));
  if (last?.kind === 'change' && !apart) last.items.push(item);
  else blocks.push({ kind: 'change', key: `change-${item.toolCallId}`, items: [item] });
}

/** The steps block a new step joins: the last one, past any strip shown after it. */
function openSteps(blocks: readonly MessageBlock[]): Extract<MessageBlock, { kind: 'steps' }> | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (block?.kind === 'steps') return block;
    if (block?.kind !== 'places' && block?.kind !== 'weather') return null;
  }
  return null;
}

function changeState(part: ToolCallPart, applied: AssistantApplied | null): ChangeState {
  const approval = part.approval;
  if (approval?.resolution) return 'expired';
  if (approval?.approved === false) return 'discarded';
  if (approval?.approved === true) {
    if (part.isError) return 'failed';
    return applied || part.result !== undefined ? 'applied' : 'applying';
  }
  return 'pending';
}

/**
 * The blocks of a message, in the order its parts came. `writing` says the
 * message is still being streamed, so a step without a result is running and
 * not merely unanswered.
 *
 * Only the newest search shows its places, without the ones a change the
 * model proposed in the answer already holds; the weather of all steps joins
 * into one row where the first look sat. A strip does not split the steps
 * around it: a step after it joins the row of steps before it.
 */
export function messageBlocks(message: AssistantMessage, writing: boolean): MessageBlock[] {
  const previews = new Map<string, AssistantChangePreview>();
  const receipts = new Map<string, AssistantApplied>();
  const effects: AssistantChangeEffect[] = [];
  // A place the user suggested from the strip stays on it, marked as suggested.
  const fromStrip = new Set(
    message.parts.flatMap((p) => (p.type === 'tool-call' && p.toolName === FOUND_PLACE_TOOL ? [p.toolCallId] : []))
  );
  let lastPlaces = -1;
  let firstWeather = -1;
  message.parts.forEach((part, index) => {
    if (part.type === 'data-trek-change') {
      previews.set(part.data.toolCallId, part.data);
      if (part.data.effect && !fromStrip.has(part.data.toolCallId)) effects.push(part.data.effect);
    } else if (part.type === 'data-trek-applied') receipts.set(part.data.toolCallId, part.data);
    else if (part.type === 'data-trek-places') lastPlaces = index;
    else if (part.type === 'data-trek-weather' && firstWeather < 0) firstWeather = index;
  });

  const blocks: MessageBlock[] = [];
  message.parts.forEach((part, index) => {
    if (part.type === 'text') {
      if (part.text.trim()) blocks.push({ kind: 'text', key: `text-${index}`, text: part.text });
      return;
    }
    if (part.type === 'data-trek-places' && index === lastPlaces) {
      const places = part.data.places.filter((place) => !proposed(place, effects));
      if (places.length > 0) blocks.push({ kind: 'places', key: `places-${index}`, found: { ...part.data, places } });
      return;
    }
    if (part.type === 'data-trek-weather' && index === firstWeather) {
      blocks.push({ kind: 'weather', key: `weather-${index}`, days: weatherDays(message.parts) });
      return;
    }
    if (part.type !== 'tool-call') return;
    const preview = previews.get(part.toolCallId) ?? null;
    if (part.approval || preview) {
      const applied = receipts.get(part.toolCallId) ?? null;
      const item: ChangeItem = { toolCallId: part.toolCallId, preview, applied, state: changeState(part, applied) };
      pushChange(blocks, item, fromStrip);
      return;
    }
    const step: ToolStep = {
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      running: writing && part.result === undefined,
    };
    const steps = openSteps(blocks);
    if (steps) steps.steps.push(step);
    else blocks.push({ kind: 'steps', key: `steps-${part.toolCallId}`, steps: [step] });
  });
  return blocks;
}

/**
 * Whether "+ Day" was already pressed on this found place in the answer: a
 * suggestion from the strip names the trip's place by its id, a new one by
 * the spot the search found it at.
 */
export function suggestedFromStrip(message: AssistantMessage, place: AssistantFoundPlace): boolean {
  return message.parts.some((part) => {
    if (part.type !== 'tool-call' || part.toolName !== FOUND_PLACE_TOOL) return false;
    const args = part.args as { placeId?: unknown; lat?: unknown; lng?: unknown };
    if (place.inTripPlaceId !== null && args.placeId === place.inTripPlaceId) return true;
    return (
      typeof args.lat === 'number' &&
      typeof args.lng === 'number' &&
      Math.abs(args.lat - place.lat) < SAME_SPOT_DEG &&
      Math.abs(args.lng - place.lng) < SAME_SPOT_DEG
    );
  });
}

/** Whether a change somewhere in the chat still waits for the user; nothing new can be suggested until then. */
export function hasUndecided(messages: readonly AssistantMessage[]): boolean {
  return messages.some((m) =>
    m.parts.some(
      (p) => p.type === 'tool-call' && !!p.approval && p.approval.approved === undefined && !p.approval.resolution
    )
  );
}

/** How long an applied change can still be undone, in ms; 0 once it cannot. */
export function undoLeftMs(applied: AssistantApplied | null, now: number): number {
  if (!applied?.undoUntil) return 0;
  return Math.max(0, Date.parse(applied.undoUntil) - now);
}

/** The label of each field a change row can show. A table, so every key is named where it is read. */
export const CHANGE_LABELS: Record<AssistantChangeLabelKey, { labelKey: string }> = {
  name: { labelKey: 'assistant.change.label.name' },
  description: { labelKey: 'assistant.change.label.description' },
  address: { labelKey: 'assistant.change.label.address' },
  coordinates: { labelKey: 'assistant.change.label.coordinates' },
  category: { labelKey: 'assistant.change.label.category' },
  day: { labelKey: 'assistant.change.label.day' },
  time: { labelKey: 'assistant.change.label.time' },
  endTime: { labelKey: 'assistant.change.label.endTime' },
  notes: { labelKey: 'assistant.change.label.notes' },
  website: { labelKey: 'assistant.change.label.website' },
  phone: { labelKey: 'assistant.change.label.phone' },
  email: { labelKey: 'assistant.change.label.email' },
  openingHours: { labelKey: 'assistant.change.label.openingHours' },
  price: { labelKey: 'assistant.change.label.price' },
  currency: { labelKey: 'assistant.change.label.currency' },
  stopType: { labelKey: 'assistant.change.label.stopType' },
  text: { labelKey: 'assistant.change.label.text' },
  icon: { labelKey: 'assistant.change.label.icon' },
  color: { labelKey: 'assistant.change.label.color' },
  position: { labelKey: 'assistant.change.label.position' },
  quantity: { labelKey: 'assistant.change.label.quantity' },
  weight: { labelKey: 'assistant.change.label.weight' },
  bag: { labelKey: 'assistant.change.label.bag' },
  packed: { labelKey: 'assistant.change.label.packed' },
  dueDate: { labelKey: 'assistant.change.label.dueDate' },
  priority: { labelKey: 'assistant.change.label.priority' },
  assignee: { labelKey: 'assistant.change.label.assignee' },
  type: { labelKey: 'assistant.change.label.type' },
  location: { labelKey: 'assistant.change.label.location' },
  link: { labelKey: 'assistant.change.label.link' },
  confirmation: { labelKey: 'assistant.change.label.confirmation' },
  checkIn: { labelKey: 'assistant.change.label.checkIn' },
  checkOut: { labelKey: 'assistant.change.label.checkOut' },
  stay: { labelKey: 'assistant.change.label.stay' },
  members: { labelKey: 'assistant.change.label.members' },
  route: { labelKey: 'assistant.change.label.route' },
};
