import type { DeepLinkProps } from './deepLinkTypes';

/**
 * Where the tours open a tour the chat points at (`?tour=`). Nothing yet: the tour cards
 * fill it in, and until then the planner keeps its own links.
 */
export function useTourDeepLink(_links: DeepLinkProps): void {
  // Filled in by the tour cards.
}
