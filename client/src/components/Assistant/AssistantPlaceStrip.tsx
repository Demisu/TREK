import type { AssistantMessage, AssistantPlaces } from '@trek/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../i18n';
import AssistantPlaceCard from './AssistantPlaceCard';
import { suggestedFromStrip } from './assistantParts';
import { useAssistantView } from './assistantViewContext';
import { useAssistantPlaceStrip } from './useAssistantPlaceStrip';

/** Cards the strip shows; the rest are counted on the tile at its end. */
const SHOWN = 6;

const ARROW =
  'absolute top-[52px] z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-edge-faint bg-surface-card text-content-secondary shadow-dropdown hover:text-content group-hover:flex';

/** How far the strip has scrolled from either end, with the reading direction in mind. */
function edgesOf(el: HTMLElement): { start: boolean; end: boolean } {
  // A right-to-left strip scrolls into negative numbers; the distance from the start is the same either way.
  const from = Math.abs(el.scrollLeft);
  return { start: from > 4, end: from + el.clientWidth < el.scrollWidth - 4 };
}

/**
 * The places a search found, as one row of cards to swipe or scroll through:
 * the next card peeks in, so the row says it goes on, and the edges fade
 * where there is more. On the desktop two arrows show on hover while the row
 * overflows. At most six cards, then a tile counting the rest.
 */
export default function AssistantPlaceStrip({ found, message }: { found: AssistantPlaces; message: AssistantMessage }) {
  const { t } = useTranslation();
  const { variant } = useAssistantView();
  const strip = useAssistantPlaceStrip();
  const listRef = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState({ start: false, end: false });
  const rest = Math.max(0, found.places.length - SHOWN) + found.more;

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const next = edgesOf(el);
    setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);

  useEffect(() => {
    measure();
    const el = listRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, found]);

  // The pin a card left on the map goes with the strip.
  const { hover } = strip;
  useEffect(() => () => hover(null), [hover]);

  /** Scrolls by most of a view towards the start (-1) or the end (1) of the row. */
  const page = (towards: -1 | 1) => {
    const el = listRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy((rtl ? -towards : towards) * el.clientWidth * 0.8, 0);
  };

  return (
    <section aria-label={t('assistant.place.strip')} className="group relative -mx-4">
      <ul
        ref={listRef}
        onScroll={measure}
        data-fade-start={fade.start || undefined}
        data-fade-end={fade.end || undefined}
        className="trek-assistant-strip flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 pb-1"
      >
        {found.places.slice(0, SHOWN).map((place) => (
          <AssistantPlaceCard
            key={place.ref}
            place={place}
            strip={strip}
            suggested={suggestedFromStrip(message, place)}
          />
        ))}
        {rest > 0 && (
          <li className="flex w-24 flex-shrink-0 snap-start items-center justify-center rounded-xl border border-dashed border-edge-faint px-2 text-center text-caption text-content-muted">
            {t('assistant.place.more', { count: rest })}
          </li>
        )}
      </ul>
      {variant === 'window' && (
        // The cards are reachable by Tab; the arrows are for the pointer only.
        <>
          {fade.start && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => page(-1)}
              className={`${ARROW} start-2`}
            >
              <ChevronLeft size={15} className="rtl:-scale-x-100" />
            </button>
          )}
          {fade.end && (
            <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => page(1)} className={`${ARROW} end-2`}>
              <ChevronRight size={15} className="rtl:-scale-x-100" />
            </button>
          )}
        </>
      )}
    </section>
  );
}
