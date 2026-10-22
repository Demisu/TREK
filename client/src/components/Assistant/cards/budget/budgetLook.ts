import { Wallet } from 'lucide-react';

import type { PackLook } from '../cardTypes';

/**
 * What the costs bring to the chat's pure look: the verbs, tool names and steps
 * they add, what an applied change of theirs opens, and the look of each of
 * their kinds. An applied expense has no way to open yet, as before. A look
 * stays pure, icons and literals only: the chat's main chunk reads every look,
 * so whatever a look imports ships with it.
 */
export const BUDGET_LOOK = {
  verbs: {},
  tools: {},
  steps: {},
  entities: {
    budget: { Icon: Wallet },
  },
  cards: {
    expenses: {},
    payments: {},
    settlement: {},
    costPerPerson: {},
  },
} satisfies PackLook<'expenses' | 'payments' | 'settlement' | 'costPerPerson'>;
