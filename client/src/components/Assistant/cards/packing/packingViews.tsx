import { type CardView, PENDING_VIEW } from '../cardTypes';

/**
 * How the kinds of the packing lists and to-dos draw in the chat; each one
 * draws nothing until its cards are built. This file only maps each kind to its
 * view: the components live in sibling files, since a file that exports
 * anything besides components breaks fast refresh, and lint:warnings holds
 * react-refresh/only-export-components at zero for a new file.
 */
export const PACKING_VIEWS = {
  packingList: PENDING_VIEW,
  todoList: PENDING_VIEW,
} satisfies { [K in 'packingList' | 'todoList']: CardView<K> };
