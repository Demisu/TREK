import { useCallback, useState } from 'react';
import type { SkiChoice } from './skiChoice';

/**
 * SKI-02: a planned ski tour's discipline and cross-country technique, fields
 * of the draft like a paddle tour's boat: nothing chosen until the traveller
 * picks, and no step of the history. A technique stays remembered while
 * another discipline is tried. `onEdit` tells the planner the draft changed,
 * and says whether it may.
 */
export function useSkiFields(initial: SkiChoice, onEdit: () => boolean) {
  const [choice, setChoice] = useState<SkiChoice>(initial);
  const change = useCallback(
    (next: SkiChoice) => {
      if (next.discipline === choice.discipline && next.technique === choice.technique) return;
      if (onEdit()) setChoice(next);
    },
    [choice, onEdit]
  );
  return {
    choice,
    change,
    /** Loaded from a tour, a draft or an import, or cleared; not an edit. */
    load: setChoice,
  };
}
