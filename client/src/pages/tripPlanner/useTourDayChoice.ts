import type { TourListItem } from '@trek/shared';
import { useCallback, useRef, useState } from 'react';
import {
  planStageSpread,
  stageKeysOfTour,
  stagesThatFit,
  type SpreadStep,
  type StageSpread,
  type TourDayHow,
  type TourDayQuestion,
} from '../../components/Tours/stages/stageSpread';
import { isTourOnDay } from '../../components/Tours/useTourDayAssignment';
import { useTripStore } from '../../store/tripStore';
import type { Day } from '../../types';
import { restoreVisit, visitOf } from './placeUndo';

type Translate = (key: string, params?: Record<string, string | number>) => string;
type Undo = () => Promise<void>;

interface TourDayChoiceOptions {
  tripId: number;
  days: Day[];
  tours: readonly TourListItem[];
  selectedDayId: number | null;
  t: Translate;
  toast: {
    success: (message: string) => unknown;
    warning: (message: string) => unknown;
    error: (message: string) => unknown;
  };
  pushUndo: (label: string, undoFn: () => Promise<void> | void, dayIds?: number[], placeIds?: number[]) => void;
  /** The plan's one way of putting a place on a day, which puts a tour there whole. */
  assignWhole: (placeId: number, dayId?: number, position?: number) => Promise<boolean>;
  updateRouteForDay: (dayId: number) => void;
  onToursChanged: () => Promise<unknown> | void;
}

/** Sends one write of a spread through the store, the plan's offline way, and returns what takes it back. */
async function runStep(tripId: number, placeId: number, step: SpreadStep): Promise<Undo> {
  const store = useTripStore.getState();
  if (step.kind === 'move') {
    await store.moveAssignment(tripId, step.assignmentId, step.fromDayId, step.toDayId);
    return () => useTripStore.getState().moveAssignment(tripId, step.assignmentId, step.toDayId, step.fromDayId);
  }
  if (step.kind === 'create') {
    const created = await store.assignPlaceToDay(tripId, step.dayId, placeId, null, step.key);
    return async () => {
      if (created?.id) await useTripStore.getState().removeAssignment(tripId, step.dayId, created.id);
    };
  }
  const item = (store.assignments[String(step.dayId)] ?? []).find((entry) => entry.id === step.assignmentId);
  await store.removeAssignment(tripId, step.dayId, step.assignmentId);
  return async () => {
    if (!item?.place) return;
    // Back where it was, whole or as its stage, with the times, note and travellers it had.
    const visit = visitOf(step.dayId, item);
    const actions = useTripStore.getState();
    const key = item.tour_stage_key ?? undefined;
    const restored = await actions.assignPlaceToDay(tripId, step.dayId, placeId, visit.orderIndex, key);
    if (restored?.id) await restoreVisit(tripId, actions, visit, restored.id);
  };
}

/** The days a write acts on. */
const daysOf = (step: SpreadStep): number[] => (step.kind === 'move' ? [step.fromDayId, step.toDayId] : [step.dayId]);

/** What a spread did, in a sentence or three: from which day, what found no day, what the stages replaced. */
function spreadMessage(plan: StageSpread, days: readonly Day[], t: Translate): string {
  const numberOf = (dayId: number) => days.findIndex((day) => day.id === dayId) + 1;
  const parts = [t('tours.stages.placed', { from: numberOf(plan.placed[0].dayId) })];
  if (plan.unplaced > 0) parts.push(t('tours.stages.placeStagesShort', { last: plan.placed.length }));
  if (plan.wholeOff.length > 0) {
    const off = plan.wholeOff.map(numberOf).sort((a, b) => a - b);
    parts.push(t('tours.stages.placedReplaced', { list: off.join(', ') }));
  }
  return parts.join(' ');
}

/**
 * MDT-02: putting a multi-day tour on a day, for the desktop and the phone
 * alike. Every way the plan puts a place on a day ends here; a tour with
 * stages asks first whether it goes on the day whole or a stage a day from
 * there on, unless the menu it came from has asked already (`how`). Put on
 * a day each, the stages go through the plan's one write path in order
 * (store, repo, mutation queue), so they work offline and show at once, and
 * one undo takes them all back. With fewer days left in the trip than stages
 * it says so and leaves the rest on no day.
 */
export function useTourDayChoice(options: TourDayChoiceOptions) {
  const { tripId, days, tours, selectedDayId, t, toast } = options;
  const { pushUndo, assignWhole, updateRouteForDay, onToursChanged } = options;
  const [tourDayQuestion, setTourDayQuestion] = useState<TourDayQuestion | null>(null);
  const answer = useRef<((how: TourDayHow | null) => void) | null>(null);

  const answerTourDay = useCallback((how: TourDayHow | null) => {
    const resolve = answer.current;
    answer.current = null;
    setTourDayQuestion(null);
    resolve?.(how);
  }, []);

  const ask = useCallback(
    (question: TourDayQuestion) =>
      new Promise<TourDayHow | null>((resolve) => {
        // A question still open is dropped, as if it had been closed.
        answer.current?.(null);
        answer.current = resolve;
        setTourDayQuestion(question);
      }),
    []
  );

  const spreadTourStages = useCallback(
    async (placeId: number, dayId: number): Promise<boolean> => {
      const keys = stageKeysOfTour(tours.find((tour) => tour.place_id === placeId));
      const plan = planStageSpread({ placeId, keys, days, assignments: useTripStore.getState().assignments, dayId });
      if (plan.placed.length === 0) return false;
      const undos: Undo[] = [];
      let failed = false;
      for (const step of plan.steps) {
        try {
          undos.unshift(await runStep(tripId, placeId, step));
        } catch {
          // The store has put back the write that failed; what went before stays, and the undo takes it back.
          failed = true;
          break;
        }
      }
      const touched = [...new Set(plan.steps.flatMap(daysOf))];
      const redraw = () => {
        const selected = useTripStore.getState().selectedDayId;
        if (selected != null && touched.includes(selected)) updateRouteForDay(selected);
      };
      redraw();
      await onToursChanged();
      if (undos.length > 0) {
        pushUndo(
          t('tours.stages.placeUndo'),
          async () => {
            for (const undo of undos) await undo();
            await onToursChanged();
            redraw();
          },
          touched,
          [placeId]
        );
      }
      if (failed) {
        toast.error(t('tours.stages.placeFailed'));
        return false;
      }
      const message = spreadMessage(plan, days, t);
      if (plan.unplaced > 0) toast.warning(message);
      else toast.success(message);
      return true;
    },
    [days, onToursChanged, pushUndo, t, toast, tours, tripId, updateRouteForDay]
  );

  const handleAssignToDay = useCallback(
    async (placeId: number, dayId?: number, position?: number, how?: TourDayHow): Promise<boolean> => {
      const target = dayId || selectedDayId;
      const tour = tours.find((item) => item.place_id === placeId);
      const count = stageKeysOfTour(tour).length;
      const index = target ? days.findIndex((day) => day.id === target) : -1;
      if (!tour || !target || count < 2 || index < 0 || how === 'whole') return assignWhole(placeId, dayId, position);
      const question: TourDayQuestion = {
        placeId,
        dayId: target,
        day: index + 1,
        name: tour.name,
        count,
        fit: stagesThatFit(days, target, count),
        wholeFree: !isTourOnDay(useTripStore.getState().assignments, placeId, target),
      };
      const choice = how ?? (await ask(question));
      if (choice === 'stages') return spreadTourStages(placeId, target);
      return choice === 'whole' ? assignWhole(placeId, target, position) : false;
    },
    [ask, assignWhole, days, selectedDayId, spreadTourStages, tours]
  );

  return { tourDayQuestion, answerTourDay, handleAssignToDay };
}
