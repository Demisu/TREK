import type { AssistantMessage, AssistantPlaces } from '@trek/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../i18n';
import AssistantPlaceCard from './AssistantPlaceCard';
import { suggestedFromStrip } from './assistantParts';
import { useAssistantView } from './assistantViewContext';
import { useAssistantPlaceStrip } from './useAssistantPlaceStrip';

/** Cards the strip shows, every one the server sends; what it left out is counted on the tile at its end. */
const SHOWN = 20;

// In the strip's head, never over a card: a press that ends a pixel off still lands on the arrow.
const ARROW =
  'grid h-7 w-7 place-items-center rounded-full bg-surface-card text-content-secondary shadow-sm ring-1 ring-edge-faint transition-colors hover:text-content disabled:cursor-default disabled:opacity-40 disabled:hover:text-content-secondary';

/** How far the strip has scrolled from either end, with the reading direction in mind. */
function edgesOf(el: HTMLElement): { start: boolean; end: boolean } {
  // A right-to-left strip scrolls into negative numbers; the distance from the start is the same either way.
  const from = Math.abs(el.scrollLeft);
  return { start: from > 4, end: from + el.clientWidth < el.scrollWidth - 4 };
}

/**
 * The places a search found, as one row of cards to swipe or scroll through:
 * the next card peeks in, so the row says it goes on, and the edges fade
 * where there is more. On the desktop a head over the row names it and holds
 * two arrows that move it by whole cards, off while that way is the end. Every card the step found, then a
 * tile counting what the server left out.
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

  /**
   * Scrolls by as many whole cards as the view holds, towards the start (-1)
   * or the end (1), so the row lands on a card edge instead of fighting its
   * snap points half way; smoothly, unless motion is turned down.
   */
  const page = (towards: -1 | 1) => {
    const el = listRef.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    const step = card.offsetWidth + gap;
    const cards = Math.max(1, Math.floor((el.clientWidth - 32) / step));
    const rtl = getComputedStyle(el).direction === 'rtl';
    // Smooth through the strip's own scroll-behavior, which reduced motion turns off.
    el.scrollBy((rtl ? -towards : towards) * cards * step, 0);
  };

  const total = found.places.length + found.more;
  return (
    <section aria-label={t('assistant.place.strip')} className="-mx-4">
      {variant === 'window' && (fade.start || fade.end) && (
        // The cards are reachable by Tab; the arrows are for the pointer only.
        <div className="mb-1.5 flex items-center gap-2 px-4">
          <span className="min-w-0 flex-1 truncate text-caption font-medium text-content-muted">
            {t('assistant.place.strip')}
            <span className="ms-1.5 tabular-nums text-content-faint">{total}</span>
          </span>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={!fade.start}
            onClick={() => page(-1)}
            className={ARROW}
          >
            <ChevronLeft size={15} className="rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={!fade.end}
            onClick={() => page(1)}
            className={ARROW}
          >
            <ChevronRight size={15} className="rtl:-scale-x-100" />
          </button>
        </div>
      )}
      <ul
        ref={listRef}
        onScroll={measure}
        data-fade-start={fade.start || undefined}
        data-fade-end={fade.end || undefined}
        className="trek-assistant-strip flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto overscroll-x-contain px-4 pb-2 pt-0.5 motion-safe:scroll-smooth"
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
          <li className="flex w-24 flex-shrink-0 snap-start items-center justify-center rounded-2xl border border-dashed border-edge-faint px-2 text-center text-caption text-content-muted">
            {t('assistant.place.more', { count: rest })}
          </li>
        )}
      </ul>
    </section>
  );
}
