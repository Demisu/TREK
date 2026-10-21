import { useEffect } from 'react';

import { useAssistantStore } from '../../store/assistantStore';
import type { Day } from '../../types';
import type { PlannerSearchParams } from './plannerTypes';

interface AssistantDeepLinkOptions {
  searchParams: PlannerSearchParams[0];
  setSearchParams: PlannerSearchParams[1];
  tripId: number;
  /** The days the store holds, which may still be the last trip's for a moment. */
  days: readonly Day[];
  selectDay: (dayId: number) => void;
}

/**
 * The assistant's two ways into the planner. `?assistant=1` opens it on this
 * trip: the AI settings card's "Open the assistant" lands here with it.
 * `?day=<id>` selects that day: the chat's "Show on map" for a change that
 * lives on a day, a note or a stop; one about a place uses `?place=` instead.
 *
 * Like `?place=`, a link is taken once and then leaves the URL, so a reload or
 * the way back does not repeat it. A day waits until the trip's days are there,
 * and one the trip does not hold is dropped without a word.
 */
export function useAssistantDeepLink({
  searchParams,
  setSearchParams,
  tripId,
  days,
  selectDay,
}: AssistantDeepLinkOptions): void {
  const openRequested = searchParams.get('assistant') === '1';
  const requestedDay = searchParams.get('day');
  const tripDays = days.filter((day) => day.trip_id === tripId);
  const known = requestedDay !== null && tripDays.some((day) => day.id === Number(requestedDay));
  const dayDone = requestedDay !== null && (known || tripDays.length > 0);

  useEffect(() => {
    if (!openRequested && !dayDone) return;
    if (openRequested) useAssistantStore.getState().open();
    if (known) selectDay(Number(requestedDay));
    setSearchParams(
      (params) => {
        if (openRequested) params.delete('assistant');
        if (dayDone) params.delete('day');
        return params;
      },
      { replace: true }
    );
  }, [openRequested, requestedDay, known, dayDone, selectDay, setSearchParams]);
}
