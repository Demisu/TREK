import { shapePaint, withShapePaint, type BookElement, type BookShapeElement } from '@trek/shared';
import { usePaintChannel } from './paint/usePaintChannel';
import { Line, Section } from './StudioControls';
import { StudioPaintPicker } from './StudioPaintPicker';
import type { StudioT } from './StudioSidebar';
import { Swatches } from './StudioSwatches';

/** The outline a shape is given when its fill goes and it has none, so it never turns invisible. */
const OUTLINE = '#141414';

/**
 * A shape's colours: its fill as a paint, and its outline.
 *
 * The fill goes to every selected shape at once, the way the rest of the
 * inspector's properties do. Taking the fill away from a shape with no
 * outline gives it one, as the old fill switch did: a shape with neither is
 * a shape nobody can see or find again.
 */
export function StudioShapePaint({
  el,
  spreadIndex,
  selection,
  onStroke,
  t,
}: {
  el: BookShapeElement;
  spreadIndex: number;
  selection: readonly string[];
  onStroke: (color: string) => void;
  t: StudioT;
}) {
  const channel = usePaintChannel((paint) => (doc) => ({
    ...doc,
    spreads: doc.spreads.map((sp, i) =>
      i !== spreadIndex
        ? sp
        : {
            ...sp,
            elements: sp.elements.map((e): BookElement => {
              if (e.kind !== 'shape' || !selection.includes(e.id)) return e;
              const painted = withShapePaint(e, paint);
              return paint === null && !e.stroke
                ? { ...painted, stroke: OUTLINE, strokeWidth: e.strokeWidth || 0.5 }
                : painted;
            }),
          }
    ),
  }));

  return (
    <Section label={t('journey.studio.colour')}>
      <Line label={t('journey.studio.fill')} wide>
        <StudioPaintPicker value={shapePaint(el)} channel={channel} t={t} noneLabel={t('journey.studio.paint.none')} />
      </Line>
      <Line label={t('journey.studio.stroke')} wide>
        <Swatches value={el.stroke ?? OUTLINE} onPick={onStroke} />
      </Line>
    </Section>
  );
}
