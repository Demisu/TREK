import { CalendarDays, CalendarRange, ChevronDown, Plus } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from '../../../i18n';
import type { Day } from '../../../types';
import { ContextMenu, useContextMenu } from '../../shared/ContextMenu';
import { DialogButton } from '../../shared/DialogShell';
import type { TourDayAssignment } from '../useTourDayAssignment';
import { stagesThatFit, tourDayChoices } from './stageSpread';

type Translate = ReturnType<typeof useTranslation>['t'];
type MenuItems = Parameters<ReturnType<typeof useContextMenu>['open']>[1];

interface TourDayHowInput {
  placeId: number;
  dayId: number;
  days: Day[];
  /** The stages of the multi-day tour. */
  stageCount: number;
  assignment: TourDayAssignment;
}

/**
 * MDT-02: the two ways a multi-day tour goes on a day, as menu items: whole,
 * or a stage a day from it on. Whole is greyed out on a day that holds the
 * tour already; the stages say how many fit when the trip ends before them.
 */
export function tourDayHowItems(input: TourDayHowInput, t: Translate): MenuItems {
  const { placeId, dayId, days, stageCount, assignment } = input;
  const facts = {
    count: stageCount,
    fit: stagesThatFit(days, dayId, stageCount),
    wholeFree: !assignment.isOnDay(placeId, dayId),
  };
  return tourDayChoices(facts, t).map((choice) => ({
    label: choice.title,
    icon: choice.how === 'whole' ? CalendarDays : CalendarRange,
    disabled: choice.disabled || !assignment.isAvailable(placeId, dayId, choice.how),
    onClick: () => void assignment.assign(placeId, dayId, choice.how),
  }));
}

/**
 * The detail's "Add to day" for the day selected in the plan. A day tour goes
 * on at once; a multi-day tour opens the two ways first, in a menu under the
 * button, so the choice is made where the day was.
 */
export function TourDayAddButton(input: TourDayHowInput) {
  const { placeId, dayId, stageCount, assignment } = input;
  const { t } = useTranslation();
  const menu = useContextMenu();
  const staged = stageCount > 1;

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!staged) {
      void assignment.assign(placeId, dayId);
      return;
    }
    if (menu.menu) {
      event.stopPropagation();
      menu.close();
      return;
    }
    menu.open(event, tourDayHowItems(input, t), true);
  };

  return (
    <>
      <DialogButton
        variant="primary"
        onClick={onClick}
        disabled={!assignment.isAvailable(placeId, dayId, staged ? 'stages' : 'whole')}
        aria-haspopup={staged ? 'menu' : undefined}
        aria-expanded={staged ? !!menu.menu : undefined}
        icon={<Plus size={14} strokeWidth={2} />}
      >
        {t('inspector.addToDay')}
        {staged && (
          <ChevronDown
            size={13}
            strokeWidth={2.2}
            aria-hidden="true"
            className={`transition-transform ${menu.menu ? 'rotate-180' : ''}`}
          />
        )}
      </DialogButton>
      <ContextMenu menu={menu.menu} onClose={menu.close} />
    </>
  );
}
