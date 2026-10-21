import type { AssistantMessage } from '@trek/shared';

/**
 * The next questions an answer suggests, as one tap each: read from what the
 * answer holds, not asked from the model, so they cost nothing and come at
 * once. Places found ask to narrow them, a plan asks to go on, a forecast asks
 * for the other weather. Three at most; the first kind the answer holds wins.
 */

export interface FollowUp {
  id: string;
  labelKey: string;
}

const PLACES: readonly FollowUp[] = [
  { id: 'cheaper', labelKey: 'assistant.followUp.cheaper' },
  { id: 'closer', labelKey: 'assistant.followUp.closer' },
  { id: 'openNow', labelKey: 'assistant.followUp.openNow' },
];

const PLAN: readonly FollowUp[] = [
  { id: 'nextDay', labelKey: 'assistant.followUp.nextDay' },
  { id: 'relaxed', labelKey: 'assistant.followUp.relaxed' },
  { id: 'dinners', labelKey: 'assistant.followUp.dinners' },
];

const WEATHER: readonly FollowUp[] = [
  { id: 'rain', labelKey: 'assistant.followUp.rain' },
  { id: 'sun', labelKey: 'assistant.followUp.sun' },
];

const GENERAL: readonly FollowUp[] = [
  { id: 'more', labelKey: 'assistant.followUp.more' },
  { id: 'next', labelKey: 'assistant.followUp.next' },
];

/** What an answer offers to ask next; changes are offered only to someone who may make them. */
export function followUpsFor(message: AssistantMessage, canEdit: boolean): readonly FollowUp[] {
  const types = new Set(message.parts.map((part) => part.type));
  if (canEdit && (types.has('data-trek-change') || types.has('data-trek-applied'))) return PLAN;
  if (types.has('data-trek-places')) return PLACES;
  if (types.has('data-trek-weather')) return WEATHER;
  return types.has('text') ? GENERAL : [];
}
