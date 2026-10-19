import { tourVisitSchema } from '@trek/shared';
import { useEffect } from 'react';
import { addListener, removeListener } from '../../../api/websocket';
import { useTourVisitStore } from '../../../store/tourVisitStore';
import type { WebSocketEvent } from '../../../types';

/**
 * CW-03: the visits of a trip's city walks, read when the trip opens and kept
 * current by its socket, so a station another traveller checks off shows on
 * every day plan at once. Offline the day plan shows none until it is back.
 */
export function useTourVisitsSync(tripId: number | string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || tripId === undefined) return;
    let current = true;
    useTourVisitStore
      .getState()
      .load(tripId)
      .catch(() => {
        // Offline or refused, the day plan shows no progress rather than another trip's.
        if (current) useTourVisitStore.getState().reset(tripId);
      });
    const onEvent = (event: WebSocketEvent) => {
      if (event?.type !== 'tours:visits' || String(event.tripId ?? '') !== String(tripId)) return;
      const visits = Array.isArray(event.visits)
        ? event.visits.flatMap((raw) => {
            const parsed = tourVisitSchema.safeParse(raw);
            return parsed.success ? [parsed.data] : [];
          })
        : [];
      useTourVisitStore.getState().applyRemote(Number(event.assignmentId), visits);
    };
    addListener(onEvent);
    return () => {
      current = false;
      removeListener(onEvent);
    };
  }, [enabled, tripId]);
}
