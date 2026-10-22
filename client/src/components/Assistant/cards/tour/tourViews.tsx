import { type CardView, PENDING_VIEW } from '../cardTypes';

/**
 * How the kinds of the tours draw in the chat; each one draws nothing until its
 * cards are built. This file only maps each kind to its view: the components
 * live in sibling files, since a file that exports anything besides components
 * breaks fast refresh, and lint:warnings holds
 * react-refresh/only-export-components at zero for a new file.
 */
export const TOUR_VIEWS = {
  tourRoute: PENDING_VIEW,
  tourList: PENDING_VIEW,
} satisfies { [K in 'tourRoute' | 'tourList']: CardView<K> };
