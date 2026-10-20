// FE-TOUR-STAGE-SPREAD-010 to FE-TOUR-STAGE-SPREAD-016: putting a multi-day tour on a day through
// the plan's one path, whole or a stage a day from it on, asked first where no menu asked (MDT-02).
import { act, renderHook } from '@testing-library/react';
import type { TourListItem } from '@trek/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAssignment, buildDay, buildPlace } from '../../../tests/helpers/factories';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useTripStore } from '../../store/tripStore';
import type { AssignmentsMap } from '../../types';
import { useTourDayChoice } from './useTourDayChoice';

type Options = Parameters<typeof useTourDayChoice>[0];
type Undo = () => Promise<void>;

const DAYS = [buildDay({ id: 1 }), buildDay({ id: 2 }), buildDay({ id: 3 })];
const stops = ['stop-a', 'stop-b', 'stop-c', 'stop-end'].map((key) => ({ key, lat: 47, lng: 11 }));
const TOURS = [
  { place_id: 9, name: 'Hut to hut', stage_stops: stops },
  { place_id: 5, name: 'Lake loop', stage_stops: null },
] as unknown as TourListItem[];
const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);

let writes: Record<string, ReturnType<typeof vi.fn>>;
let options: Options;

function seed(assignments: AssignmentsMap) {
  seedStore(useTripStore, { ...writes, days: DAYS, assignments, selectedDayId: 1 } as never);
}

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  writes = {
    assignPlaceToDay: vi.fn(async (_trip: number, dayId: number, placeId: number) => ({ id: 900 + dayId, placeId })),
    moveAssignment: vi.fn(async () => undefined),
    removeAssignment: vi.fn(async () => undefined),
    setAssignmentTimes: vi.fn(async () => undefined),
    setAssignmentNotes: vi.fn(async () => undefined),
    setAssignmentEndDay: vi.fn(async () => undefined),
    setAssignmentRouteExcluded: vi.fn(async () => undefined),
    setAssignmentParticipants: vi.fn(async () => undefined),
    setAssignmentLegMode: vi.fn(async () => undefined),
  };
  seed({ '1': [], '2': [], '3': [] });
  options = {
    tripId: 42,
    days: DAYS,
    tours: TOURS,
    selectedDayId: 1,
    t,
    toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    pushUndo: vi.fn(),
    assignWhole: vi.fn(async () => true),
    updateRouteForDay: vi.fn(),
    onToursChanged: vi.fn(async () => undefined),
  };
});

const render = () => renderHook(() => useTourDayChoice(options));
const lastUndo = () => vi.mocked(options.pushUndo).mock.calls.at(-1)?.[1] as Undo;

describe('useTourDayChoice', () => {
  it('FE-TOUR-STAGE-SPREAD-010: a place, a day tour and a tour put whole on purpose go on at once', async () => {
    const { result } = render();
    await act(async () => {
      expect(await result.current.handleAssignToDay(77, 1, 3)).toBe(true);
      await result.current.handleAssignToDay(5, 2);
      await result.current.handleAssignToDay(9, 2, undefined, 'whole');
    });
    expect(options.assignWhole).toHaveBeenNthCalledWith(1, 77, 1, 3);
    expect(options.assignWhole).toHaveBeenNthCalledWith(2, 5, 2, undefined);
    expect(options.assignWhole).toHaveBeenNthCalledWith(3, 9, 2, undefined);
    expect(result.current.tourDayQuestion).toBeNull();
    expect(writes.assignPlaceToDay).not.toHaveBeenCalled();
  });

  it('FE-TOUR-STAGE-SPREAD-011: a multi-day tour asks first; whole goes the plan way, closing does nothing', async () => {
    const { result } = render();
    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.handleAssignToDay(9, 2, 4);
    });
    expect(result.current.tourDayQuestion).toEqual({
      placeId: 9,
      dayId: 2,
      day: 2,
      name: 'Hut to hut',
      count: 3,
      fit: 2,
      wholeFree: true,
    });
    act(() => result.current.answerTourDay('whole'));
    expect(await pending).toBe(true);
    expect(options.assignWhole).toHaveBeenCalledWith(9, 2, 4);

    act(() => {
      pending = result.current.handleAssignToDay(9);
    });
    expect(result.current.tourDayQuestion?.dayId).toBe(1);
    act(() => result.current.answerTourDay(null));
    expect(await pending).toBe(false);
    expect(result.current.tourDayQuestion).toBeNull();
    expect(options.assignWhole).toHaveBeenCalledTimes(1);
    expect(writes.assignPlaceToDay).not.toHaveBeenCalled();
  });

  it('FE-TOUR-STAGE-SPREAD-012: stages go on day after day in order, the whole tour gives way, and it says so', async () => {
    const whole = buildAssignment({ id: 22, day_id: 2, place: buildPlace({ id: 9 }), tour_stage_key: null });
    seed({ '1': [], '2': [whole], '3': [] });
    const { result } = render();
    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.handleAssignToDay(9, 1);
    });
    expect(result.current.tourDayQuestion?.wholeFree).toBe(true);
    act(() => result.current.answerTourDay('stages'));
    expect(await pending).toBe(true);

    expect(writes.removeAssignment).toHaveBeenCalledWith(42, 2, 22);
    expect(writes.assignPlaceToDay.mock.calls).toEqual([
      [42, 1, 9, null, 'stop-a'],
      [42, 2, 9, null, 'stop-b'],
      [42, 3, 9, null, 'stop-c'],
    ]);
    expect(options.assignWhole).not.toHaveBeenCalled();
    expect(options.onToursChanged).toHaveBeenCalled();
    expect(options.updateRouteForDay).toHaveBeenCalledWith(1);
    expect(options.toast.success).toHaveBeenCalledWith(
      'tours.stages.placed {"from":1} tours.stages.placedReplaced {"list":"2"}'
    );
    expect(options.pushUndo).toHaveBeenCalledWith('tours.stages.placeUndo', expect.any(Function), [2, 1, 3], [9]);
  });

  it('FE-TOUR-STAGE-SPREAD-013: one undo takes the whole spread back, the whole tour onto its day again', async () => {
    const whole = buildAssignment({ id: 22, day_id: 2, place: buildPlace({ id: 9 }), tour_stage_key: null });
    seed({ '1': [], '2': [whole], '3': [] });
    const { result } = render();
    await act(async () => {
      await result.current.handleAssignToDay(9, 1, undefined, 'stages');
    });
    expect(result.current.tourDayQuestion).toBeNull();
    writes.removeAssignment.mockClear();
    writes.assignPlaceToDay.mockClear();
    await act(async () => {
      await lastUndo()();
    });
    expect(writes.removeAssignment.mock.calls).toEqual([
      [42, 3, 903],
      [42, 2, 902],
      [42, 1, 901],
    ]);
    expect(writes.assignPlaceToDay).toHaveBeenCalledWith(42, 2, 9, 0, undefined);
  });

  it('FE-TOUR-STAGE-SPREAD-014: fewer days left than stages: the rest stay on no day, and the toast says so', async () => {
    const { result } = render();
    await act(async () => {
      expect(await result.current.handleAssignToDay(9, 2, undefined, 'stages')).toBe(true);
    });
    expect(writes.assignPlaceToDay.mock.calls).toEqual([
      [42, 2, 9, null, 'stop-a'],
      [42, 3, 9, null, 'stop-b'],
    ]);
    expect(options.toast.warning).toHaveBeenCalledWith(
      'tours.stages.placed {"from":2} tours.stages.placeStagesShort {"last":2}'
    );
    expect(options.toast.success).not.toHaveBeenCalled();
  });

  it('FE-TOUR-STAGE-SPREAD-015: a stage already on a day moves, and a move is undone by moving it back', async () => {
    const held = buildAssignment({ id: 31, day_id: 3, place: buildPlace({ id: 9 }), tour_stage_key: 'stop-a' });
    seed({ '1': [], '2': [], '3': [held] });
    const { result } = render();
    await act(async () => {
      await result.current.handleAssignToDay(9, 1, undefined, 'stages');
    });
    expect(writes.moveAssignment).toHaveBeenCalledWith(42, 31, 3, 1);
    expect(writes.assignPlaceToDay.mock.calls.map((call) => call[4])).toEqual(['stop-b', 'stop-c']);
    writes.moveAssignment.mockClear();
    await act(async () => {
      await lastUndo()();
    });
    expect(writes.moveAssignment).toHaveBeenCalledWith(42, 31, 1, 3);
  });

  it('FE-TOUR-STAGE-SPREAD-016: a refused write stops the spread, says so, and the undo has what went before', async () => {
    writes.assignPlaceToDay.mockResolvedValueOnce({ id: 901 }).mockRejectedValueOnce(new Error('offline'));
    const { result } = render();
    await act(async () => {
      expect(await result.current.handleAssignToDay(9, 1, undefined, 'stages')).toBe(false);
    });
    expect(writes.assignPlaceToDay).toHaveBeenCalledTimes(2);
    expect(options.toast.error).toHaveBeenCalledWith('tours.stages.placeFailed');
    expect(options.toast.success).not.toHaveBeenCalled();
    await act(async () => {
      await lastUndo()();
    });
    expect(writes.removeAssignment).toHaveBeenCalledWith(42, 1, 901);
  });
});
