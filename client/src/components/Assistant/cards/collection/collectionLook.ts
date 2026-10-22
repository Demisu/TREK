import type { PackLook } from '../cardTypes';

/**
 * What the collections bring to the chat's pure look: the verbs, tool names and
 * steps they add, what an applied change of theirs opens, and the look of each
 * of their kinds. Empty until the collections cards fill it. A look stays pure,
 * icons and literals only: the chat's main chunk reads every look, so whatever
 * a look imports ships with it.
 */
export const COLLECTION_LOOK = {
  verbs: {},
  tools: {},
  steps: {},
  entities: {},
  cards: {
    collectionPlaces: {},
    collectionLists: {},
  },
} satisfies PackLook<'collectionPlaces' | 'collectionLists'>;
