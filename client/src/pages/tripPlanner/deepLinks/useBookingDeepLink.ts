import type { DeepLinkProps } from './deepLinkTypes';

/**
 * Where the bookings open a booking the chat points at. Nothing yet: the booking cards
 * fill it in, and until then the planner keeps its own links.
 */
export function useBookingDeepLink(_links: DeepLinkProps): void {
  // Filled in by the booking cards.
}
