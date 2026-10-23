import { bookStickerSlotColor, type BookElement, type BookStickerElement } from '@trek/shared';
import { bookSticker } from '@trek/shared/stickers';
import { RotateCcw, RotateCw } from 'lucide-react';

import { Line, NumField, Section, Switch } from './StudioControls';
import { Swatches } from './StudioSwatches';
import { stickerLabel, turned, withSlotColor } from './stickerLibrary';

/**
 * The inspector's part for a sticker: its colours slot by slot, and how it
 * lies on the page (mirrored, turned, faded).
 *
 * Every slot is offered with the colour it shows now, the sticker's own until
 * somebody picks another, and choosing one writes the colours of the slots
 * before it as well, so the list the document keeps always reads in slot order.
 * Turning is here as well as in the folded position numbers because a sticker
 * is the one element people set at an angle as a matter of course.
 */

type Translate = (k: string, params?: Record<string, string | number>) => string;

/** A quarter of a right angle and a little: what a sticker is tipped by, a step at a time. */
const TURN_STEP = 15;

export function StudioStickerInspector({
  el,
  set,
  t,
}: {
  el: BookStickerElement;
  set: (patch: Partial<BookElement>) => void;
  t: Translate;
}) {
  const def = bookSticker(el.stickerId);
  return (
    <>
      <Section
        label={t('journey.studio.stickerColours')}
        hint={def ? stickerLabel(t, def.id) : t('journey.studio.stickerMissing')}
      >
        {def?.slots.map((slot, i) => (
          <Line key={slot.name} label={t('journey.studio.stickerSlot', { index: i + 1 })} wide>
            <Swatches
              value={bookStickerSlotColor(def.slots, el.colors, i)}
              onPick={(color) => set({ colors: withSlotColor(el, def.slots, i, color) })}
            />
          </Line>
        ))}
        {el.colors.length > 0 && (
          <div className="st-row" style={{ marginTop: 8 }}>
            <button type="button" className="st-chip" onClick={() => set({ colors: [] })}>
              {t('journey.studio.stickerResetColours')}
            </button>
          </div>
        )}
      </Section>

      <Section label={t('journey.studio.stickerPlacement')}>
        <Switch label={t('journey.studio.stickerFlip')} on={el.flipX} onToggle={() => set({ flipX: !el.flipX })} />
        <div className="st-row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
          <button
            type="button"
            className="st-chip is-icon"
            onClick={() => set({ rotation: turned(el.rotation, -TURN_STEP) })}
            title={t('journey.studio.stickerTurnLeft')}
            aria-label={t('journey.studio.stickerTurnLeft')}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            className="st-chip is-icon"
            onClick={() => set({ rotation: turned(el.rotation, TURN_STEP) })}
            title={t('journey.studio.stickerTurnRight')}
            aria-label={t('journey.studio.stickerTurnRight')}
          >
            <RotateCw size={14} />
          </button>
        </div>
        <div className="st-grid2" style={{ marginTop: 10 }}>
          <NumField
            label={t('journey.studio.rotation')}
            value={el.rotation}
            min={-180}
            max={180}
            step={1}
            unit="°"
            onChange={(v) => set({ rotation: v })}
          />
          <NumField
            label={t('journey.studio.opacity')}
            value={Math.round(el.opacity * 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => set({ opacity: Math.min(1, Math.max(0, v / 100)) })}
          />
        </div>
      </Section>
    </>
  );
}
