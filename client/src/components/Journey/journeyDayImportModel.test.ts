// FE-JRN-DAYIMPORT-MODEL-001 to FE-JRN-DAYIMPORT-MODEL-008
//
// JRN-02: what the traveller decided in the day take-over, before anything is
// written. Two stays at San Marco, a parking stop and Rialto, as the review
// lists them.
import type { JourneyDayStay } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import { buildDayStay, buildDayStays } from '../../../tests/helpers/journeyRecording';
import {
  canJoin,
  defaultAnchor,
  groupsOf,
  initialChoice,
  problemOf,
  rename,
  REPORT_KEY,
  requestOf,
  titleOf,
  toggleJoin,
  toggleStay,
  type DayImportChoice,
} from './journeyDayImportModel';

const STAYS = buildDayStays().stays;
const [PARKING, MARKUS, , RIALTO] = STAYS as [JourneyDayStay, JourneyDayStay, JourneyDayStay, JourneyDayStay];
const REPORT = 'Day of 14 May';

describe('journeyDayImportModel', () => {
  it('FE-JRN-DAYIMPORT-MODEL-001: every open stay starts chosen, and the same place twice in a row starts joined', () => {
    const choice = initialChoice(STAYS);
    expect([...choice.selected]).toEqual([10, 11, 12, 13]);
    expect([...choice.joined]).toEqual([12]);
    expect(groupsOf(choice, STAYS).map((g) => [g.kind, g.stays.map((s) => s.suggestionId)])).toEqual([
      ['single', [10]],
      ['merged', [11, 12]],
      ['single', [13]],
    ]);
  });

  it('FE-JRN-DAYIMPORT-MODEL-002: stays the journal holds or that went elsewhere are never chosen; one left out before starts unchosen', () => {
    const stays = [
      buildDayStay({ suggestionId: 1, status: 'here', entry: { id: 4, title: 'Morning' } }),
      buildDayStay({ suggestionId: 2, status: 'elsewhere', name: 'Rialto' }),
      buildDayStay({ suggestionId: 3, status: 'skipped', name: 'Lido' }),
    ];
    const choice = initialChoice(stays);
    expect(choice.selected.size).toBe(0);
    expect(problemOf(choice, stays, REPORT)).toBe('nothing');
    const picked = toggleStay(choice, 3);
    expect(groupsOf(picked, stays).map((g) => g.key)).toEqual([3]);
    expect(requestOf(picked, stays, REPORT)).toEqual({ groups: [{ kind: 'single', stays: [{ suggestionId: 3 }] }] });
  });

  it('FE-JRN-DAYIMPORT-MODEL-003: an open stay left unchosen is sent as left out, and a renamed one under its new name', () => {
    let choice = toggleStay(initialChoice(STAYS), 10);
    choice = rename(choice, RIALTO, '  Ponte di Rialto ');
    expect(requestOf(choice, STAYS, REPORT)).toEqual({
      groups: [
        {
          kind: 'merged',
          stays: [{ suggestionId: 11 }, { suggestionId: 12 }],
          title: 'Piazza San Marco',
          anchorSuggestionId: 12,
        },
        { kind: 'single', stays: [{ suggestionId: 13, name: 'Ponte di Rialto' }] },
      ],
      skipSuggestionIds: [10],
    });
  });

  it('FE-JRN-DAYIMPORT-MODEL-004: joining needs both neighbours chosen; unchoosing a stay separates it', () => {
    const choice = toggleStay(initialChoice(STAYS), 11);
    expect(canJoin(choice, STAYS, 2)).toBe(false);
    expect(groupsOf(choice, STAYS).map((g) => g.kind)).toEqual(['single', 'single', 'single']);
    const back = toggleStay(choice, 11);
    expect(back.joined.has(12)).toBe(true);
    expect(canJoin(back, STAYS, 1)).toBe(true);
    const joined = toggleJoin(back, 11);
    expect(groupsOf(joined, STAYS).map((g) => g.stays.length)).toEqual([3, 1]);
  });

  it('FE-JRN-DAYIMPORT-MODEL-005: a day report takes every chosen stay, titled by default, at the longest stay or off the map', () => {
    const choice = { ...initialChoice(STAYS), mode: 'report' as const };
    const [report] = groupsOf(choice, STAYS);
    if (!report) throw new Error('no report');
    expect(report).toMatchObject({ key: REPORT_KEY, kind: 'report' });
    expect(report.stays).toHaveLength(4);
    expect(titleOf(choice, report, REPORT)).toBe(REPORT);
    expect(requestOf(choice, STAYS, REPORT).groups[0]).toMatchObject({ title: REPORT, anchorSuggestionId: 12 });
    const offMap = { ...choice, anchors: { [REPORT_KEY]: null } };
    expect(requestOf(offMap, STAYS, REPORT).groups[0]).toMatchObject({ anchorSuggestionId: null });
  });

  it('FE-JRN-DAYIMPORT-MODEL-006: a report of one chosen stay is that stay on its own', () => {
    let choice: DayImportChoice = { ...initialChoice(STAYS), mode: 'report' };
    for (const id of [10, 11, 12]) choice = toggleStay(choice, id);
    expect(groupsOf(choice, STAYS)).toEqual([{ key: 13, kind: 'single', stays: [RIALTO] }]);
  });

  it('FE-JRN-DAYIMPORT-MODEL-007: a blank name or a blank title holds the take-over back, so no card is empty', () => {
    const choice = initialChoice(STAYS);
    expect(problemOf(choice, STAYS, REPORT)).toBeNull();
    expect(problemOf(rename(choice, PARKING, '   '), STAYS, REPORT)).toBe('name');
    expect(problemOf({ ...choice, titles: { 11: ' ' } }, STAYS, REPORT)).toBe('title');
    expect(problemOf({ ...choice, mode: 'report', titles: { [REPORT_KEY]: '' } }, STAYS, REPORT)).toBe('title');
  });

  it('FE-JRN-DAYIMPORT-MODEL-008: the default position is the longest stay that has a place', () => {
    expect(defaultAnchor(STAYS)).toBe(12);
    expect(defaultAnchor([buildDayStay({ suggestionId: 5, lat: null, lng: null })])).toBeNull();
    expect(rename(rename(initialChoice(STAYS), MARKUS, 'X'), MARKUS, MARKUS.name).names).toEqual({});
  });
});
