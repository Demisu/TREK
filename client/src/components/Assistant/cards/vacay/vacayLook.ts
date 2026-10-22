import type { PackLook } from '../cardTypes';

/**
 * What the vacation planner brings to the chat's pure look: the verbs, tool
 * names and steps it adds, what an applied change of its own opens, and the
 * look of each of its kinds. Empty until the vacation cards fill it. A look
 * stays pure, icons and literals only: the chat's main chunk reads every look,
 * so whatever a look imports ships with it.
 */
export const VACAY_LOOK = {
  verbs: {},
  tools: {},
  steps: {},
  entities: {},
  cards: {
    vacay: {},
  },
} satisfies PackLook<'vacay'>;
