import type { AssistantApplied } from '@trek/shared';
import { useCallback, useMemo } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router';

import { useTripStore } from '../../store/tripStore';
import AssistantWindow from './AssistantWindow';
import { showOnMapSearch } from './assistantShowOnMap';

/** The trip a route under /trips/:id shows, or null anywhere else. */
function useRouteTripId(): number | null {
  const match = useMatch('/trips/:id/*');
  const id = Number(match?.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The desktop assistant, mounted once above the routes so a conversation
 * keeps going from page to page. Inside a trip it is about that trip; "Show
 * on map" opens the planner on the change through its links (`?place=`,
 * `?day=`), the same way a notification opens a place, and a day picked in
 * the chat (its weather) selects that day the same way.
 */
export default function AssistantHost() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tripId = useRouteTripId();
  // The title is there once the planner has loaded the trip; the window waits for nothing else.
  const title = useTripStore((s) => (s.trip && s.trip.id === tripId ? s.trip.title : ''));
  const trip = useMemo(() => (tripId === null ? null : { id: tripId, title }), [tripId, title]);

  const openPlanner = useCallback(
    (search: string) => {
      if (tripId === null) return;
      const planner = `/trips/${tripId}`;
      void navigate({ pathname: planner, search }, { replace: pathname === planner });
    },
    [navigate, pathname, tripId]
  );
  const showOnMap = useCallback((applied: AssistantApplied) => openPlanner(showOnMapSearch(applied)), [openPlanner]);
  const focusDay = useCallback((dayId: number) => openPlanner(`?day=${dayId}`), [openPlanner]);

  return <AssistantWindow trip={trip} onShowOnMap={showOnMap} onFocusDay={focusDay} />;
}
