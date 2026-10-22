import { packingListCardSchema } from './packing-list.card';
import { todoListCardSchema } from './todo-list.card';

export * from './packing-list.card';
export * from './todo-list.card';

/**
 * What the packing and to-do lists bring to the assistant chat: the kinds of card they draw,
 * the verbs of their change cards and what an applied change of theirs
 * touches, beyond the core ones. cards/index.ts and assistant.schema.ts
 * spread these into the card union and the shared enums, so a new kind, verb
 * or entity is added here and nowhere else.
 */
export const PACKING_CARD_SCHEMAS = [packingListCardSchema, todoListCardSchema] as const;
export const PACKING_VERB_KEYS = [] as const;
export const PACKING_APPLIED_ENTITIES = [] as const;
