import { useMemo } from 'react';

import { useTranslation } from '../../i18n';
import { useCanDo } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';
import { localIsoDate } from '../../utils/localDate';
import { suggestionsFor, tripPhase } from './assistantModel';
import { useAssistantFocus } from './useAssistantFocus';

export interface ReadySuggestion {
  id: string;
  /** What the button says, and the question it sends. */
  prompt: string;
}

/**
 * The questions the empty chat offers, worded and ready to send, and whether
 * the user may change this trip at all. For a trip the planner is not showing
 * (one picked from the dashboard) neither its dates nor its rights are at
 * hand, so it gets the general questions and none that would change it.
 */
export function useAssistantSuggestions(tripId: number): { suggestions: ReadySuggestion[]; canEdit: boolean } {
  const { t } = useTranslation();
  const can = useCanDo();
  const trip = useTripStore((s) => (s.trip?.id === tripId ? s.trip : null));
  const hasPlaces = useTripStore((s) => s.places.length > 0);
  const { label, kind } = useAssistantFocus(tripId);
  const canEdit = !!trip && can('place_edit', trip);

  const suggestions = useMemo(() => {
    const phase = trip
      ? tripPhase({
          startDate: trip.start_date ?? null,
          endDate: trip.end_date ?? null,
          hasPlaces,
          today: localIsoDate(),
        })
      : 'upcoming';
    return suggestionsFor({
      phase,
      canEdit,
      place: kind === 'place' ? label : null,
      day: kind === 'day' ? label : null,
    }).map((s) => ({ id: s.id, prompt: t(s.labelKey, s.params) }));
  }, [trip, hasPlaces, canEdit, kind, label, t]);

  return { suggestions, canEdit };
}
