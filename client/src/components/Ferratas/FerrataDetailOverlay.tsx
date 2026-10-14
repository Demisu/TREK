import { useEffect, useRef } from 'react';

import FerrataDetailCard from './FerrataDetailCard';
import type { FerrataSelection } from './useFerrataMapLayer';

/**
 * The picked ferrata's card over the map, anchored at the bottom of the inline
 * end, above the row of map controls. `insetEnd` is what the panel on that
 * side covers plus the gap the layer pill keeps to the panel on the other, so
 * the card mirrors the pill and never slides under the panel; `bottom` clears
 * the control row (the layer pill on the flat map, the dock and the grade
 * legend in 3D).
 *
 * It closes on a press anywhere outside it and on Escape. A press on another
 * ferrata closes this card first and the click then opens that one's. The
 * press outside is handed to `onOutsidePress` as well, so the map under it can
 * leave the click that follows alone (see `useOutsidePressGuard`).
 */
export default function FerrataDetailOverlay({
  selection,
  onClose,
  onOutsidePress,
  insetEnd,
  bottom,
}: {
  selection: FerrataSelection | null;
  onClose: () => void;
  onOutsidePress?: () => void;
  insetEnd: number;
  bottom: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const open = !!selection;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const card = ref.current;
      if (card && event.target instanceof Node && card.contains(event.target)) return;
      onOutsidePress?.();
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, onOutsidePress]);

  if (!selection) return null;
  return (
    <div
      ref={ref}
      className="absolute z-[20] flex justify-end"
      style={{ insetInlineEnd: insetEnd, bottom, maxWidth: `calc(100% - ${insetEnd + 32}px)` }}
      data-testid="ferrata-detail-overlay"
    >
      <FerrataDetailCard group={selection.group} segment={selection.segment} onClose={onClose} />
    </div>
  );
}
