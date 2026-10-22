import { chargingCardSchema } from './charging.card';
import { corridorCardSchema } from './corridor.card';
import { dayRouteCardSchema } from './day-route.card';
import { roadtripCardSchema } from './roadtrip.card';
import { transitCardSchema } from './transit.card';

export * from './charging.card';
export * from './corridor.card';
export * from './day-route.card';
export * from './roadtrip.card';
export * from './transit.card';

/**
 * What the road trip brings to the assistant chat: the kinds of card it draws,
 * the verbs of its change cards and what an applied change of its
 * touches, beyond the core ones. cards/index.ts and assistant.schema.ts
 * spread these into the card union and the shared enums, so a new kind, verb
 * or entity is added here and nowhere else.
 */
export const ROADTRIP_CARD_SCHEMAS = [
  roadtripCardSchema,
  corridorCardSchema,
  chargingCardSchema,
  transitCardSchema,
  dayRouteCardSchema,
] as const;
export const ROADTRIP_VERB_KEYS = [] as const;
export const ROADTRIP_APPLIED_ENTITIES = [] as const;
