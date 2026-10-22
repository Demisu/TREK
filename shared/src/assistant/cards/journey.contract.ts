import { journeyEntriesCardSchema } from './journey-entries.card';

export * from './journey-entries.card';

/**
 * What the travel journal brings to the assistant chat: the kinds of card it draws,
 * the verbs of its change cards and what an applied change of its
 * touches, beyond the core ones. cards/index.ts and assistant.schema.ts
 * spread these into the card union and the shared enums, so a new kind, verb
 * or entity is added here and nowhere else.
 */
export const JOURNEY_CARD_SCHEMAS = [journeyEntriesCardSchema] as const;
export const JOURNEY_VERB_KEYS = [] as const;
export const JOURNEY_APPLIED_ENTITIES = [] as const;
