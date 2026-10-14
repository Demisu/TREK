import { useEffect, useState } from 'react';

import { ferrataPaint } from './ferrataPaint';

/** The attributes `applyAppearance()` writes on `<html>` that change what the status tokens resolve to. */
const THEME_ATTRIBUTES = ['class', 'style', 'data-scheme'];

type Paint = ReturnType<typeof ferrataPaint>;

function samePaint(a: Paint, b: Paint): boolean {
  return (
    a.casing === b.casing &&
    a.tone.easy === b.tone.easy &&
    a.tone.medium === b.tone.medium &&
    a.tone.hard === b.tone.hard &&
    a.tone.unknown === b.tone.unknown
  );
}

/**
 * The line colours, resolved again whenever the light/dark class, the colour
 * scheme or a custom accent on `<html>` changes. Map paint holds resolved
 * strings rather than `var(--token)`, so without this a theme toggle would leave
 * the lines in the old scheme's colours until the next refetch. Same observer
 * approach as `useIsDark`, which only watches the class. The reference only
 * changes when a colour does, so a memo keyed on it does not churn.
 */
export function useFerrataPaint(): Paint {
  const [paint, setPaint] = useState(ferrataPaint);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      const next = ferrataPaint();
      setPaint((current) => (samePaint(current, next) ? current : next));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: THEME_ATTRIBUTES });
    return () => observer.disconnect();
  }, []);

  return paint;
}
