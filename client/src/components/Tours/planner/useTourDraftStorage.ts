import { useCallback, useMemo } from 'react';
import { validDraft, type DraftPayload } from './tourPlannerDraft';
import { normalizePlannerWaypoints } from './tourPlannerWaypoints';

/**
 * The planner's draft kept in this browser between visits, one per trip: the
 * draft found when the planner opens (null for none, or one that does not
 * pass the check), keeping the current one, and forgetting it once it is
 * saved or thrown away. Storage that is full or blocked keeps nothing.
 */
export function useTourDraftStorage(tripId: number | string) {
  const storageKey = `tour-draft-${tripId}`;
  const restored = useMemo(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null') as unknown;
      return validDraft(parsed)
        ? { ...parsed, waypoints: normalizePlannerWaypoints(parsed.waypoints, parsed.tourType === 'kayak') }
        : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  const keep = useCallback(
    (draft: DraftPayload) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        // Full or blocked storage: the draft lives on in the page until it is saved.
      }
    },
    [storageKey]
  );

  const forget = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Blocked storage held nothing to forget.
    }
  }, [storageKey]);

  return { restored, keep, forget };
}
