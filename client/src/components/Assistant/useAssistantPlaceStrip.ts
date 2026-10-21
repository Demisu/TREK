import { type AssistantFoundPlace, categoryIdForKind } from '@trek/shared';
import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useNetworkMode } from '../../hooks/useNetworkMode';
import { useTranslation } from '../../i18n';
import { chatOf, useAssistantStore } from '../../store/assistantStore';
import { useCanDo } from '../../store/permissionsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import type { Assignment } from '../../types';
import { dayLabel } from '../../utils/dayLabel';
import { haversineKm } from '../../utils/geo';
import { safeHexColor } from '../../utils/safeColor';
import { formatDistance } from '../../utils/units';
import { hasUndecided } from './assistantParts';
import { useAssistantView } from './assistantViewContext';

/** A day a found place can be suggested for, named the way the day list names it. */
interface StripDay {
  id: number;
  /** Its place in the trip, 1 for the first day: "+ Day 3". */
  n: number;
  label: string;
}

/** The trip category a found place most likely belongs in, for its line and its icon. */
interface StripCategory {
  name: string;
  icon: string;
  color: string;
}

/** The last stop of a day that has a spot on the map. */
function lastSpot(stops: readonly Assignment[] | undefined): { lat: number; lng: number } | null {
  const sorted = [...(stops ?? [])].sort((a, b) => a.order_index - b.order_index);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const place = sorted[i]?.place;
    if (place && typeof place.lat === 'number' && typeof place.lng === 'number') {
      return { lat: place.lat, lng: place.lng };
    }
  }
  return null;
}

/**
 * What the strip of found places needs, the same for the window and the
 * phone: the trip's days to suggest a place for, the day in focus, how far a
 * place is from that day's last stop, its likely category, whether a
 * suggestion can be made now and why not, and the map's part (the pin while
 * the pointer rests on a card, the camera on a click).
 *
 * Suggesting writes nothing: the server holds the place as a change card to
 * decide like any other. It waits while another change is undecided, because
 * one decision answers all open cards.
 */
export function useAssistantPlaceStrip() {
  const { t, locale } = useTranslation();
  const { tripId, onRevealMap } = useAssistantView();
  const { offline } = useNetworkMode();
  const can = useCanDo();
  const unit = useSettingsStore((s) => s.settings.distance_unit ?? 'metric');
  const { trip, days, assignments, categories } = useTripStore(
    useShallow((s) => {
      const here = s.trip?.id === tripId;
      return {
        trip: here ? s.trip : null,
        days: here ? s.days : null,
        assignments: here ? s.assignments : null,
        categories: s.categories,
      };
    })
  );
  const { focusDayId, isRunning, threadId, waiting } = useAssistantStore(
    useShallow((s) => {
      const chat = chatOf(s, tripId);
      return {
        focusDayId: chat.focus?.dayId ?? null,
        isRunning: chat.isRunning,
        threadId: chat.threadId,
        waiting: hasUndecided(chat.messages),
      };
    })
  );
  const addFoundPlace = useAssistantStore((s) => s.addFoundPlace);
  const requestCamera = useAssistantStore((s) => s.requestCamera);
  const setPreviewPin = useAssistantStore((s) => s.setPreviewPin);
  const [adding, setAdding] = useState<string | null>(null);

  const stripDays = useMemo(
    (): StripDay[] =>
      (days ?? []).map((day, index) => ({ id: day.id, n: index + 1, label: dayLabel(day, index, t, locale) })),
    [days, t, locale]
  );
  const focusDay = stripDays.find((d) => d.id === focusDayId) ?? null;
  const from = focusDay && assignments ? lastSpot(assignments[String(focusDay.id)]) : null;

  /** Whether "+ Day" shows at all: the planner holds the trip and the user may add to it. */
  const canSuggest = !!trip && can('place_edit', trip) && stripDays.length > 0;
  /** Why "+ Day" is off right now, as a tooltip; null when it is on. */
  let blockedKey: string | null = null;
  if (offline) blockedKey = 'assistant.error.offline';
  else if (waiting) blockedKey = 'assistant.composer.decideFirst';
  const disabled = blockedKey !== null || isRunning || threadId === null || adding !== null;

  const categoryOf = (place: AssistantFoundPlace): StripCategory | null => {
    const id = categoryIdForKind(place.kind, categories);
    const category = id === null ? undefined : categories.find((c) => c.id === id);
    if (!category) return null;
    return { name: category.name, icon: category.icon, color: safeHexColor(category.color, 'var(--text-faint)') };
  };

  const distanceOf = (place: AssistantFoundPlace): string | null =>
    from ? formatDistance(haversineKm(from, place), unit) : null;

  const suggest = async (place: AssistantFoundPlace, dayId: number) => {
    if (disabled) return;
    setAdding(place.ref);
    try {
      await addFoundPlace(tripId, place.ref, dayId);
    } finally {
      setAdding(null);
    }
  };

  /** Shows the place on the map; on the phone the chat steps aside first. */
  const show = (place: AssistantFoundPlace) => {
    onRevealMap?.();
    requestCamera(tripId, [[place.lat, place.lng]], 'pan', 'user');
  };

  // Stable, so the strip can take the pin away when it goes.
  const hover = useCallback(
    (place: AssistantFoundPlace | null) => {
      if (place) setPreviewPin({ tripId, ref: place.ref, lat: place.lat, lng: place.lng, name: place.name });
      else setPreviewPin(null);
    },
    [tripId, setPreviewPin]
  );

  return {
    days: stripDays,
    focusDay,
    canSuggest,
    disabled,
    blockedKey,
    adding,
    categoryOf,
    distanceOf,
    suggest,
    show,
    hover,
  };
}
