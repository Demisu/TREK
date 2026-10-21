import type { PlannableTourType } from '@trek/shared';
import { useCallback } from 'react';
import { focusPaddleArea } from '../../../store/paddleObstacleStore';
import type { TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';
import type { WalkFerryCrossing } from '../planner/tourRouting';
import { crossingLine, ferryLegOf } from './walkFerry';

interface WalkFerriesInput {
  tourType: PlannableTourType;
  ferries: WalkFerryCrossing[] | null;
  routeCurrent: boolean;
  walkGap: number | null;
  waypoints: TourPlannerWaypoint[];
  editWaypoints: (change: (current: TourPlannerWaypoint[]) => TourPlannerWaypoint[]) => void;
}

/**
 * CW-12: a city walk's crossings by boat as the planner handles them. A
 * crossing the router took is shown and explained but not saved until the
 * travellers take it as a ferry leg (`accept`, one step of the history), so
 * the boat never passes for walking unnoticed. `gap` is the leg no way
 * joins at all, while that is why the route failed.
 */
export function useWalkFerries({
  tourType,
  ferries,
  routeCurrent,
  walkGap,
  waypoints,
  editWaypoints,
}: WalkFerriesInput) {
  const crossings = tourType === 'walk' && routeCurrent ? (ferries ?? []) : [];
  const pending = crossings.filter((crossing) => !crossing.accepted);

  const accept = useCallback(
    (crossing: WalkFerryCrossing) => {
      editWaypoints((current) => {
        const from = current[crossing.leg];
        const to = current[crossing.leg + 1];
        const leg = from && to && !from.fixedLeg ? ferryLegOf(crossing, from, to) : null;
        return leg
          ? current.map((point, index) => (index === crossing.leg ? { ...point, fixedLeg: leg } : point))
          : current;
      });
    },
    [editWaypoints]
  );

  /** A ferry leg given back: the leg is planned on foot again, as one step of the history. */
  const release = useCallback(
    (id: string) => {
      editWaypoints((current) =>
        current.map((point) => {
          if (point.id !== id || point.fixedLeg?.kind !== 'ferry') return point;
          const { fixedLeg: _crossing, ...onFoot } = point;
          return onFoot;
        })
      );
    },
    [editWaypoints]
  );

  const show = useCallback((crossing: WalkFerryCrossing) => focusPaddleArea(crossingLine(crossing)), []);

  return {
    crossings,
    pending,
    /** Save waits while a crossing is not taken on purpose. */
    blocksSave: pending.length > 0,
    gap: tourType === 'walk' && walkGap !== null && waypoints[walkGap + 1] ? { leg: walkGap } : null,
    accept,
    release,
    show,
  };
}
