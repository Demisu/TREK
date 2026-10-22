import { Ticket } from 'lucide-react';

import type { PackLook } from '../cardTypes';

/**
 * What the bookings bring to the chat's pure look: the verbs, tool names and
 * steps they add, what an applied change of theirs opens, and the look of each
 * of their kinds. Empty but for the booking entity until the booking cards fill
 * it. A look stays pure, icons and literals only: the chat's main chunk reads
 * every look, so whatever a look imports ships with it.
 */
export const BOOKING_LOOK = {
  verbs: {},
  tools: {},
  steps: {},
  entities: {
    // An applied booking shows on the map by its day, as before.
    reservation: { Icon: Ticket, onMap: (applied) => ({ placeId: null, dayId: applied.dayId }) },
  },
  cards: {
    booking: {},
  },
} satisfies PackLook<'booking'>;
