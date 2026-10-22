import type { DomainCards, ToolCards } from '../card-types';
import { VACAY_ANSWER_CARDS } from './vacay-answer';
import { appliedCompany, appliedToggle } from './vacay-applied';
import { VACAY_CHANGE_CARDS, VACAY_DESCRIBERS } from './vacay-change';
import { loadDay, loadStats, type VacayLoaded, type VacayStatsLoaded } from './vacay-load';

/**
 * The vacation planner in the assistant chat. Its reads show the days off,
 * the days left and the public holidays on a month calendar; a held toggle,
 * company holiday or new allowance shows the day (or the year) it changes,
 * with the leave before and after. Vacation days are the plan's, not the
 * trip's, so each held change looks the plan up first (`load`). A decision
 * can come hours after the hold, so the applied card follows what the tool
 * says it did, not what the held card foresaw (`applied`).
 *
 * A toggle cannot be undone from the chat yet: whether the day is still as
 * the change left it needs the change's own date, which an undo check is not
 * handed (`undo.unchanged` gets the result only, and the result names no
 * date). The other vacation writes stay cards built from their arguments.
 */

const toggle: ToolCards<VacayLoaded> = {
  write: { verbKey: 'addVacationDay', entity: 'vacay' },
  load: loadDay,
  describe: VACAY_DESCRIBERS.toggle_vacay_entry,
  change: VACAY_CHANGE_CARDS.toggle_vacay_entry,
  applied: appliedToggle,
};

const companyHoliday: ToolCards<VacayLoaded> = {
  write: { verbKey: 'setCompanyHoliday', entity: 'vacay' },
  load: loadDay,
  describe: VACAY_DESCRIBERS.toggle_company_holiday,
  change: VACAY_CHANGE_CARDS.toggle_company_holiday,
  applied: appliedCompany,
};

const allowance: ToolCards<VacayStatsLoaded> = {
  write: { verbKey: 'setVacationAllowance', entity: 'vacay' },
  load: loadStats,
  describe: VACAY_DESCRIBERS.update_vacay_stats,
  change: VACAY_CHANGE_CARDS.update_vacay_stats,
};

export const VACAY_CARDS: DomainCards = {
  id: 'vacay',
  tools: {
    toggle_vacay_entry: toggle,
    toggle_company_holiday: companyHoliday,
    update_vacay_stats: allowance,
    get_vacay_entries: { answer: VACAY_ANSWER_CARDS.get_vacay_entries },
    get_vacay_stats: { answer: VACAY_ANSWER_CARDS.get_vacay_stats },
    list_holidays: { answer: VACAY_ANSWER_CARDS.list_holidays },
  },
  prompt: [
    'toggle_vacay_entry clears a day logged with the same size and kind, so read get_vacay_entries before you toggle.',
  ],
};
