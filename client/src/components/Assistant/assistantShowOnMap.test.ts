import type { AssistantApplied } from '@trek/shared';

import { showOnMapSearch, showOnMapTarget } from './assistantShowOnMap';

const applied = (entity: AssistantApplied['entity'], ids: number[], dayId: number | null): AssistantApplied => ({
  toolCallId: 'c1',
  entity,
  ids,
  dayId,
  undoUntil: null,
});

describe('assistantShowOnMap', () => {
  it('FE-ASSIST-SHOW-001: a place goes to the place, even when it was put on a day', () => {
    expect(showOnMapTarget(applied('place', [7], 3))).toEqual({ placeId: 7, dayId: null });
    expect(showOnMapSearch(applied('place', [7], 3))).toBe('?place=7');
  });

  it('FE-ASSIST-SHOW-002: a stop or a note goes to its day', () => {
    expect(showOnMapSearch(applied('assignment', [41], 3))).toBe('?day=3');
    expect(showOnMapSearch(applied('day_note', [9], 4))).toBe('?day=4');
  });

  it('FE-ASSIST-SHOW-003: a change with nowhere to point at opens the planner as it is', () => {
    expect(showOnMapTarget(applied('packing', [2], null))).toEqual({ placeId: null, dayId: null });
    expect(showOnMapSearch(applied('place', [], null))).toBe('');
  });
});
