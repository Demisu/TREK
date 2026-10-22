import { ListTodo, Luggage } from 'lucide-react';

import type { PackLook } from '../cardTypes';

/**
 * What the packing lists and to-dos bring to the chat's pure look: the verbs,
 * tool names and steps they add, what an applied change of theirs opens, and
 * the look of each of their kinds. Applied items have no way to open yet, as
 * before. A look stays pure, icons and literals only: the chat's main chunk
 * reads every look, so whatever a look imports ships with it.
 */
export const PACKING_LOOK = {
  verbs: {},
  tools: {},
  steps: {},
  entities: {
    packing: { Icon: Luggage },
    todo: { Icon: ListTodo },
  },
  cards: {
    packingList: {},
    todoList: {},
  },
} satisfies PackLook<'packingList' | 'todoList'>;
