import { CalendarDays, CalendarRange } from 'lucide-react';
import type { useTranslation } from '../../../i18n';
import type { Day } from '../../../types';
import type { useContextMenu } from '../../shared/ContextMenu';
import { dayMenuLabel } from '../tourDays';
import type { TourDayAssignment } from '../useTourDayAssignment';
import { stagesThatFit, tourDayChoices } from './stageSpread';

type Translate = ReturnType<typeof useTranslation>['t'];
type MenuItems = Parameters<ReturnType<typeof useContextMenu>['open']>[1];

export interface TourDayHowInput {
  placeId: number;
  dayId: number;
  days: Day[];
  /** The stages of the multi-day tour. */
  stageCount: number;
  assignment: TourDayAssignment;
}

/**
 * MDT-02: the two ways a multi-day tour goes on a day, as menu items: whole,
 * or a stage a day from it on, under the day they act on, so the step after
 * the day menu still says which day was picked. Whole is greyed out on a day
 * that holds the tour already, and says so; the stages say how many fit when
 * the trip ends before them.
 */
export function tourDayHowItems(input: TourDayHowInput, t: Translate, locale: string): MenuItems {
  const { placeId, dayId, days, stageCount, assignment } = input;
  const facts = {
    count: stageCount,
    fit: stagesThatFit(days, dayId, stageCount),
    wholeFree: !assignment.isOnDay(placeId, dayId),
  };
  const ways = tourDayChoices(facts, t).map((choice) => {
    const disabled = choice.disabled || !assignment.isAvailable(placeId, dayId, choice.how);
    return {
      label: choice.title,
      // Greyed out with no reason reads as broken; the reason goes right under it.
      hint: choice.disabled && choice.how === 'whole' ? choice.hint : undefined,
      icon: choice.how === 'whole' ? CalendarDays : CalendarRange,
      disabled,
      onClick: () => void assignment.assign(placeId, dayId, choice.how),
    };
  });
  const at = days.findIndex((day) => day.id === dayId);
  if (at < 0) return ways;
  return [{ label: dayMenuLabel(days[at], at, t, locale), heading: true }, ...ways];
}
