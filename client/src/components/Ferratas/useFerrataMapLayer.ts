import { useCallback, useMemo, useRef, useState } from 'react';

import type { Ferrata, FerrataBbox } from '@trek/shared';

import type { FerrataSelectHandler } from './useFerrataLayerGL';
import { type FerrataStatus, useTripFerratas } from './useTripFerratas';

/**
 * The via ferrata layer as a map hands it around: whether it is on, the switch
 * the layer pill shows, what the status pill says, the lines to draw and what
 * a click on one of them does. Both flat renderers and the 3D terrain map take
 * this one object, so the three cannot drift apart on what the layer is.
 */
export interface FerrataMapLayer {
  active: boolean;
  onToggle: () => void;
  status: FerrataStatus;
  ferratas: readonly Ferrata[];
  onSelect: FerrataSelectHandler;
}

/**
 * The via ferrata layer of one map surface: off by default, and nothing is
 * asked for while it is off.
 *
 * `onViewportChange` takes the visible area from whichever map is on screen
 * (the flat planner map or the 3D terrain). While the layer is off the area is
 * only remembered, not put into state, so panning a map with the layer off
 * re-renders nothing; switching it on starts from the last area the map
 * reported instead of waiting for the next pan. `selected` is the ferrata
 * whose card is open, closed again when the layer is switched off.
 */
export function useFerrataMapLayer(tripId: number | null | undefined) {
  const [active, setActive] = useState(false);
  const [bbox, setBbox] = useState<FerrataBbox | null>(null);
  const [selected, setSelected] = useState<Ferrata | null>(null);
  const lastArea = useRef<FerrataBbox | null>(null);
  const activeRef = useRef(false);
  const { ferratas, status } = useTripFerratas(tripId, bbox, active);

  const onViewportChange = useCallback((area: FerrataBbox) => {
    lastArea.current = area;
    if (activeRef.current) setBbox(area);
  }, []);

  const onToggle = useCallback(() => {
    const next = !activeRef.current;
    activeRef.current = next;
    setActive(next);
    setSelected(null);
    if (next) setBbox(lastArea.current);
  }, []);

  const close = useCallback(() => setSelected(null), []);
  const onSelect = useCallback<FerrataSelectHandler>((ferrata) => setSelected(ferrata), []);

  const layer = useMemo<FerrataMapLayer>(
    () => ({ active, onToggle, status, ferratas, onSelect }),
    [active, onToggle, status, ferratas, onSelect]
  );

  return { layer, onViewportChange, selected: active ? selected : null, close };
}
