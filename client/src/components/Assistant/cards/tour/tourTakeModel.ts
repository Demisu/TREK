import type { AssistantMessage, TourRouteCard } from '@trek/shared';

/**
 * Whether a proposal was already taken ("Plan this"), read from the thread
 * rather than from the card, so a card drawn again (the chat reopened, the
 * thread loaded anew, a long answer scrolled away and back) does not offer
 * the same tour twice. The change the server holds names the way it creates,
 * not the card it came from, so it is matched by its way.
 */

/** The tool a change held by "Plan this" runs under, as the server names it. */
const TAKE_TOOL = 'take_proposal';

/** Whether two routes are one way: one activity, as many points, the same ends. */
function sameWay(a: TourRouteCard, b: TourRouteCard): boolean {
  if (a.activity !== b.activity || a.line.length !== b.line.length || a.stops.length !== b.stops.length) return false;
  const ends = (card: TourRouteCard) => [card.line[0], card.line.at(-1)].map((point) => point?.slice(0, 2).join(','));
  const [aStart, aEnd] = ends(a);
  const [bStart, bEnd] = ends(b);
  return aStart === bStart && aEnd === bEnd;
}

/** The index of the answer that drew the proposal's card; -1 when the thread no longer holds it. */
function proposalIndex(messages: readonly AssistantMessage[], toolCallId: string): number {
  return messages.findIndex((message) =>
    message.parts.some((part) => part.type === 'data-trek-card' && part.data.toolCallId === toolCallId)
  );
}

/** Where a take of the proposal stands in the thread: waiting for a decision, applied, or none. */
type ThreadTake = 'waiting' | 'applied' | null;

/**
 * The take a later answer holds for the same way, still waiting or applied.
 * One discarded, cancelled or expired leaves the proposal free to be taken
 * again.
 */
export function takeInThread(
  messages: readonly AssistantMessage[],
  toolCallId: string,
  card: TourRouteCard
): ThreadTake {
  const from = proposalIndex(messages, toolCallId);
  if (from < 0) return null;
  for (const message of messages.slice(from + 1)) {
    const open = new Map<string, ThreadTake>();
    for (const part of message.parts) {
      if (part.type !== 'tool-call' || part.toolName !== TAKE_TOOL || part.approval?.resolution) continue;
      if (part.approval?.approved !== false) open.set(part.toolCallId, part.approval?.approved ? 'applied' : 'waiting');
    }
    for (const part of message.parts) {
      if (part.type !== 'data-trek-change' || part.data.card?.kind !== 'tourRoute') continue;
      const take = open.get(part.data.toolCallId);
      if (take && sameWay(part.data.card, card)) return take;
    }
  }
  return null;
}
