import {
  BOOK_LINE_CAPS,
  BOOK_LINE_ORNAMENTS,
  type BookLineCap,
  type BookLineElement,
  type BookLineOrnament,
  bookLineStyled,
} from '@trek/shared';
import { ArrowLeftRight } from 'lucide-react';

import { useStudioStore } from '../../store/studioStore';
import { LinePaths } from './LineView';
import { Choice, Line, NumField, Section } from './StudioControls';
import { Swatches } from './StudioSwatches';
import { lineGeometry } from './lineRender';

/**
 * The inspector of a drawn line: its colour and weight, dashes, the course it
 * takes, a wave or a zigzag, the hand-drawn wobble, what sits on each end and
 * in the middle.
 *
 * Every change goes through `bookLineStyled`, the book engine's own restyle,
 * so a wider stroke or a new head refits the frame exactly as the assistant's
 * `style` does, and the ends stay where they were drawn.
 */

type Look = Partial<Omit<BookLineElement, 'id' | 'kind' | 'frame' | 'points'>>;

type GlyphLook = Parameters<typeof lineGeometry>[0];

/** A tiny level line for the pickers: a plain rule, with what the picker is choosing set on it. */
function MiniLine({ over }: { over: Partial<GlyphLook> }) {
  const el: GlyphLook = {
    points: [
      { x: 0.08, y: 0.5 },
      { x: 0.92, y: 0.5 },
    ],
    curve: 'straight',
    strokeWidth: 1.4,
    dash: 'solid',
    squiggle: 'none',
    startCap: 'none',
    endCap: 'none',
    wobble: 0,
    ornament: 'none',
    ...over,
  };
  const g = lineGeometry(el, 28, 12, 'glyph');
  return (
    <svg viewBox="0 0 28 12" width="28" height="12" aria-hidden style={{ overflow: 'visible' }}>
      <LinePaths g={g} color="currentColor" width={el.strokeWidth} />
    </svg>
  );
}

/** A tiny line with this end on it, for the end pickers. */
const CapGlyph = ({ cap, start }: { cap: BookLineCap; start: boolean }) => (
  <MiniLine over={start ? { startCap: cap } : { endCap: cap }} />
);

/** A tiny rule with this ornament in its middle. */
const OrnamentGlyph = ({ ornament }: { ornament: BookLineOrnament }) => (
  <MiniLine over={{ ornament, strokeWidth: 0.7 }} />
);

export function LineInspector({
  el,
  spreadIndex,
  t,
}: {
  el: BookLineElement;
  spreadIndex: number;
  t: (k: string) => string;
}) {
  const commit = useStudioStore((s) => s.commit);
  const selection = useStudioStore((s) => s.selection);

  /** Restyle every selected line, each refitted around its own points. */
  const set = (look: Look) =>
    commit((d) => ({
      ...d,
      spreads: d.spreads.map((sp, i) =>
        i !== spreadIndex
          ? sp
          : {
              ...sp,
              elements: sp.elements.map((e) =>
                e.kind === 'line' && selection.includes(e.id) && !e.locked ? bookLineStyled(e, look) : e
              ),
            }
      ),
    }));

  /** The line turned round: its points in the other order and its two ends swapped with them. */
  const swapEnds = () =>
    commit((d) => ({
      ...d,
      spreads: d.spreads.map((sp, i) =>
        i !== spreadIndex
          ? sp
          : {
              ...sp,
              elements: sp.elements.map((e) =>
                e.kind === 'line' && selection.includes(e.id) && !e.locked
                  ? { ...e, points: [...e.points].reverse(), startCap: e.endCap, endCap: e.startCap }
                  : e
              ),
            }
      ),
    }));

  const caps = (start: boolean) =>
    BOOK_LINE_CAPS.map((c) => ({
      value: c,
      label: <CapGlyph cap={c} start={start} />,
      title: t(`journey.studio.cap.${c}`),
    }));

  return (
    <>
      <Section label={t('journey.studio.kind.line')}>
        <Line label={t('journey.studio.stroke')} wide>
          <Swatches value={el.stroke} onPick={(c) => set({ stroke: c })} />
        </Line>
        <div className="st-grid2" style={{ marginTop: 10 }}>
          <NumField
            label={t('journey.studio.strokeWidth')}
            value={el.strokeWidth}
            min={0.05}
            max={20}
            step={0.05}
            unit="mm"
            onChange={(v) => set({ strokeWidth: v })}
          />
          <NumField
            label={t('journey.studio.wobble')}
            value={Math.round(el.wobble * 100)}
            min={0}
            max={100}
            step={10}
            unit="%"
            onChange={(v) => set({ wobble: Math.min(1, Math.max(0, v / 100)) })}
          />
        </div>
        <div style={{ marginTop: 10 }}>
          <Line label={t('journey.studio.strokeStyle')} wide>
            <Choice
              value={el.dash}
              options={(
                [
                  ['solid', 'strokeSolid'],
                  ['dashed', 'strokeDashed'],
                  ['dotted', 'strokeDotted'],
                ] as const
              ).map(([value, key]) => ({ value, label: t(`journey.studio.${key}`) }))}
              onPick={(dash) => set({ dash })}
            />
          </Line>
          <Line label={t('journey.studio.lineCourseTitle')} wide>
            <Choice
              value={el.curve}
              options={(['straight', 'smooth'] as const).map((value) => ({
                value,
                label: t(`journey.studio.lineCourse.${value}`),
              }))}
              onPick={(curve) => set({ curve })}
            />
          </Line>
          <Line label={t('journey.studio.lineBodyTitle')} wide>
            <Choice
              value={el.squiggle}
              options={(['none', 'wave', 'zigzag'] as const).map((value) => ({
                value,
                label: t(`journey.studio.lineBody.${value}`),
              }))}
              onPick={(squiggle) => set({ squiggle })}
            />
          </Line>
        </div>
        <p className="st-hint" style={{ paddingTop: 8 }}>
          {t('journey.studio.linePointsHint')}
        </p>
      </Section>

      <Section label={t('journey.studio.lineEnds')}>
        <Line label={t('journey.studio.lineStart')} wide>
          <Choice value={el.startCap} options={caps(true)} onPick={(startCap) => set({ startCap })} />
        </Line>
        <Line label={t('journey.studio.lineEnd')} wide>
          <Choice value={el.endCap} options={caps(false)} onPick={(endCap) => set({ endCap })} />
        </Line>
        <div className="st-row" style={{ marginTop: 6 }}>
          <button type="button" className="st-chip" onClick={swapEnds}>
            <ArrowLeftRight size={13} />
            {t('journey.studio.swapEnds')}
          </button>
        </div>
      </Section>

      <Section label={t('journey.studio.ornamentTitle')} defaultOpen={el.ornament !== 'none'}>
        <Choice
          value={el.ornament}
          options={BOOK_LINE_ORNAMENTS.map((o) => ({
            value: o,
            label: <OrnamentGlyph ornament={o} />,
            title: t(`journey.studio.ornament.${o}`),
          }))}
          onPick={(ornament) => set({ ornament })}
          ariaLabel={t('journey.studio.ornamentTitle')}
        />
      </Section>
    </>
  );
}
