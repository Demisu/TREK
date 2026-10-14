import { useEffect, useRef } from 'react';

import type { Ferrata } from '@trek/shared';

import FerrataDetailCard from './FerrataDetailCard';

/**
 * The picked ferrata's card over the map, anchored bottom right above the row
 * of map controls. `insetRight` is what the right panel covers plus the gap the
 * layer pill keeps to the left one, so the card mirrors the pill and never
 * slides under the panel; `bottom` clears the control row (the layer pill on
 * the flat map, the dock and the grade legend in 3D).
 *
 * It closes on a press anywhere outside it and on Escape. A press on another
 * ferrata closes this card first and the click then opens that one's.
 */
export default function FerrataDetailOverlay({
  ferrata,
  onClose,
  insetRight,
  bottom,
}: {
  ferrata: Ferrata | null;
  onClose: () => void;
  insetRight: number;
  bottom: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ferrata) return;
    const onDown = (event: PointerEvent) => {
      const card = ref.current;
      if (card && event.target instanceof Node && card.contains(event.target)) return;
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
  }, [ferrata, onClose]);

  if (!ferrata) return null;
  return (
    <div
      ref={ref}
      className="absolute z-[20]"
      style={{
        right: insetRight, // rtl-lint-disable: measured from the right panel, which stays on the physical right
        bottom,
        maxWidth: `calc(100% - ${insetRight + 32}px)`,
      }}
      data-testid="ferrata-detail-overlay"
    >
      <FerrataDetailCard ferrata={ferrata} onClose={onClose} />
    </div>
  );
}
