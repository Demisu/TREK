import { useLayoutEffect, useRef } from 'react';
import { useSelectedPoi } from '../../components/Tours/poi/useTourPoiSearch';
import { selectPaddleObstacle, usePaddleObstacleStore } from '../../store/paddleObstacleStore';
import { useTourPoiStore } from '../../store/tourPoiStore';

/**
 * The corner over the planner map holds one card at a time. A via ferrata's,
 * a paddle object's and a place's card close on any press outside them, so
 * the press that opens the next one has closed the last already. The
 * comparison of a section's ways (RTE-02) stays up through presses on the map,
 * so it is kept apart here: whichever of it and the others opened last stays,
 * and the other closes. Laid out before paint, so two cards never show
 * stacked in the corner, not even for a frame.
 */
export function useOneCornerCard({
  comparing,
  closeComparison,
  ferrataOpen,
  closeFerrata,
}: {
  comparing: boolean;
  closeComparison: () => void;
  ferrataOpen: boolean;
  closeFerrata: () => void;
}): void {
  const paddleOpen = usePaddleObstacleStore((state) => state.selectedRef !== null);
  const poiOpen = useSelectedPoi() !== null;
  const selectPoi = useTourPoiStore((state) => state.select);
  const otherOpen = ferrataOpen || paddleOpen || poiOpen;
  const was = useRef({ comparing, otherOpen });

  useLayoutEffect(() => {
    const before = was.current;
    was.current = { comparing, otherOpen };
    if (!comparing || !otherOpen) return;
    // A card picked on the map while comparing takes the corner; a comparison opened over a card does.
    if (!before.otherOpen) {
      closeComparison();
      return;
    }
    closeFerrata();
    selectPaddleObstacle(null);
    selectPoi(null);
  }, [closeComparison, closeFerrata, comparing, otherOpen, selectPoi]);
}
