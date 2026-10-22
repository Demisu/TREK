import { Route } from 'lucide-react';

import type { PackLook } from '../cardTypes';

/**
 * What the tours bring to the chat's pure look: the verbs, tool names and steps
 * they add, what an applied change of theirs opens, and the look of each of
 * their kinds. An applied tour has no way to open yet, as before. A look stays
 * pure, icons and literals only: the chat's main chunk reads every look, so
 * whatever a look imports ships with it.
 */
export const TOUR_LOOK = {
  verbs: {},
  tools: {},
  steps: {},
  entities: {
    tour: { Icon: Route },
  },
  cards: {
    tourRoute: {},
    tourList: {},
  },
} satisfies PackLook<'tourRoute' | 'tourList'>;
