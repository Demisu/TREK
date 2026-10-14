import { useMemo } from 'react';
import type { useOutsidePressGuard } from '../../components/Ferratas/useOutsidePressGuard';
import type { TourPlannerController } from '../../components/Tours/planner/useTourPlanner';
import { useWaypointPlaceNames } from '../../components/Tours/planner/useWaypointPlaceNames';
import { useTranslation } from '../../i18n';
import { usePlacedPointHint } from './usePlacedPointHint';
import { useTourMapPlacing, type TourMapMode } from './useTourMapPlacing';

const NO_POINTS: never[] = [];
const ROLE_KEY = {
  start: 'tours.planner.start',
  via: 'tours.planner.via',
  end: 'tours.planner.end',
} as const;

type PointsPlanner = Pick<
  TourPlannerController,
  | 'mode'
  | 'isSaving'
  | 'waypoints'
  | 'selectedWaypointId'
  | 'setSelectedWaypointId'
  | 'setWaypointPosition'
  | 'addWaypoint'
  | 'undo'
  | 'maxHikingDifficulty'
>;

interface Options {
  tourPlanner: PointsPlanner;
  canPlaceEdit: boolean;
  mode: TourMapMode;
  /** A via ferrata card is open: the "point set" hint gives way to it. */
  ferrataOpen: boolean;
  /** Drops the click that closed a ferrata card. */
  guard: ReturnType<typeof useOutsidePressGuard>['guard'];
}

/**
 * The tour's control points on the planner map, for either mode: what the map
 * shows and may change, the "set points" tool, and the hint with its undo
 * after a point went in. A click places a point only while the tool is on,
 * only when it was a click and not a drag, and never when it closed a card.
 */
export function useTourMapPoints({ tourPlanner, canPlaceEdit, mode, ferrataOpen, guard }: Options) {
  const { t } = useTranslation();
  const editing = tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved';
  // The same lookup as the waypoint list, so a pin is named on hover as its row is.
  const placeNames = useWaypointPlaceNames(editing ? tourPlanner.waypoints : NO_POINTS);
  const canEditRoute = canPlaceEdit && !tourPlanner.isSaving && editing;
  const { active, toggle, gate, attach } = useTourMapPlacing(mode);
  const placeOn = canEditRoute && active;
  const placedHint = usePlacedPointHint({
    waypoints: tourPlanner.waypoints,
    difficulty: tourPlanner.maxHikingDifficulty,
    undo: tourPlanner.undo,
    enabled: editing && !ferrataOpen,
  });
  const { notePlacement } = placedHint;
  const { addWaypoint } = tourPlanner;
  const addPoint = (lat: number, lng: number) => {
    notePlacement();
    addWaypoint(lat, lng);
  };
  const onAdd = guard(gate(placeOn ? addPoint : undefined));
  // Kept by identity while nothing about the points changed, so the map does not redraw its pins on every render.
  const { waypoints } = tourPlanner;
  const points = useMemo(
    () =>
      editing
        ? waypoints.map((point, index) => ({
            ...point,
            name: placeNames[point.id] ?? t('tours.planner.waypointLabel', { n: index + 1 }),
            detail: t(ROLE_KEY[point.role]),
          }))
        : NO_POINTS,
    [editing, waypoints, placeNames, t]
  );

  return {
    waypoints: {
      points,
      selectedId: editing ? tourPlanner.selectedWaypointId : null,
      onSelect: tourPlanner.setSelectedWaypointId,
      onMove: canEditRoute ? tourPlanner.setWaypointPosition : undefined,
      onAdd,
    },
    /** The switch for the layer pill, there only while the tour can be edited. */
    placeTool: canEditRoute ? { active, onToggle: toggle } : undefined,
    placeOn,
    /** Goes on the element around the map, where the presses are followed. */
    attachSurface: attach,
    placedHint,
  };
}
