import { sortedStops, stopAlpha, type BookPaint, type BookPaintStop } from '@trek/shared';
import { useMemo, type ReactNode, type SVGProps } from 'react';
import { linearLine, r2 } from './paintGeometry';
import { patternGeometry, type PatternBox } from './patterns';
import { usePaintId } from './usePaintId';

/**
 * Paint, drawn: the one renderer for a shape's fill and a page's background.
 *
 * Every paint becomes SVG the print path already knows: a fill with
 * `fill-opacity`, a `linearGradient` or `radialGradient` in user space, or a
 * pattern drawn out as geometry (patterns.ts) under a `clipPath` in user
 * space. Nothing here is lazy, measured or raster, so what the editor shows
 * is what headless Chromium prints.
 *
 * ── Why the ids come from useId ──────────────────────────────────────────
 *
 * Page mode draws each double spread twice, once per half (bookSheets.ts),
 * and a thumbnail draws it again beside the canvas. An id taken from the
 * element alone would then exist twice in one document, and `url(#id)`
 * resolves to the first, so the second half would borrow the first half's
 * gradient, and a pattern clipped to the first copy's path would vanish from
 * the second. React's useId is unique per mounted instance and the same on
 * every render of it, which is exactly the property a defs id needs; the
 * element's own id is kept in front only to make the markup readable.
 */

function Stops({ stops }: { stops: readonly BookPaintStop[] }) {
  return (
    <>
      {sortedStops(stops).map((s, i) => (
        <stop
          // Two stops may share an offset (a hard edge), so the index keys them.
          key={i}
          offset={r2(s.at)}
          stopColor={s.color}
          stopOpacity={stopAlpha(s) < 1 ? stopAlpha(s) : undefined}
        />
      ))}
    </>
  );
}

/** What a painted outline needs: the defs to put in the SVG, and how to fill the outline. */
interface PaintParts {
  defs: ReactNode;
  fill: string;
  fillOpacity?: number;
  /** A pattern's geometry, to draw clipped to the outline over its fill. */
  pattern: { clipId: string; layers: { d: string; opacity: number }[]; transform?: string; ink: string } | null;
}

function paintParts(paint: BookPaint, box: PatternBox, id: string): PaintParts {
  switch (paint.type) {
    case 'solid':
      return {
        defs: null,
        fill: paint.color,
        fillOpacity: stopAlpha(paint) < 1 ? stopAlpha(paint) : undefined,
        pattern: null,
      };
    case 'linear': {
      const line = linearLine(paint.angle, box);
      return {
        defs: (
          <linearGradient id={id} gradientUnits="userSpaceOnUse" {...line}>
            <Stops stops={paint.stops} />
          </linearGradient>
        ),
        fill: `url(#${id})`,
        pattern: null,
      };
    }
    case 'radial':
      return {
        defs: (
          <radialGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            cx={r2(box.x + paint.cx * box.w)}
            cy={r2(box.y + paint.cy * box.h)}
            r={r2((paint.r * Math.hypot(box.w, box.h)) / 2)}
          >
            <Stops stops={paint.stops} />
          </radialGradient>
        ),
        fill: `url(#${id})`,
        pattern: null,
      };
    case 'pattern': {
      const geo = patternGeometry(paint, box);
      return {
        defs: null,
        fill: paint.bg ?? 'none',
        pattern: { clipId: `${id}-clip`, layers: geo.layers, transform: geo.transform, ink: paint.fg },
      };
    }
  }
}

type OutlineProps = Omit<SVGProps<SVGPathElement>, 'fill' | 'd'>;

/**
 * An outline filled with a paint, inside an `<svg>` whose user units are
 * millimetres. `box` is the outline's box in that space, which a gradient and
 * a pattern are laid over. The stroke, when the outline has one, is drawn on
 * top of a pattern rather than under it, so the edge stays crisp.
 */
export function PaintedPath({
  d,
  paint,
  box,
  idPrefix,
  fillRule,
  stroke,
  ...rest
}: {
  d: string;
  paint: BookPaint | null;
  box: PatternBox;
  /** The element's id, to make the markup readable; uniqueness comes from useId. */
  idPrefix: string;
  fillRule?: 'evenodd' | 'nonzero';
} & OutlineProps) {
  const id = usePaintId(`p-${idPrefix}`);
  // The caller holds `box` steady between renders (a memo of the frame), so a re-render
  // that moved nothing does not lay the pattern out again.
  const parts = useMemo(() => (paint ? paintParts(paint, box, id) : null), [paint, box, id]);
  const outline = { d, fillRule, clipRule: fillRule };

  if (!parts) return <path {...outline} fill="none" stroke={stroke} {...rest} />;

  const pattern = parts.pattern;
  return (
    <>
      {(parts.defs || pattern) && (
        <defs>
          {parts.defs}
          {pattern && (
            <clipPath id={pattern.clipId} clipPathUnits="userSpaceOnUse">
              <path {...outline} />
            </clipPath>
          )}
        </defs>
      )}
      <path
        {...outline}
        fill={parts.fill}
        fillOpacity={parts.fillOpacity}
        stroke={pattern ? undefined : stroke}
        {...(pattern ? {} : rest)}
      />
      {pattern && (
        <>
          <g clipPath={`url(#${pattern.clipId})`}>
            <g transform={pattern.transform}>
              {pattern.layers.map((layer, i) => (
                <path
                  key={i}
                  d={layer.d}
                  fill={pattern.ink}
                  fillOpacity={layer.opacity < 1 ? layer.opacity : undefined}
                />
              ))}
            </g>
          </g>
          {stroke && <path {...outline} fill="none" stroke={stroke} {...rest} />}
        </>
      )}
    </>
  );
}

/**
 * A page's paint, drawn under everything on it and out into the bleed.
 *
 * Positioned in the spread's own millimetres from minus the bleed, so print,
 * whose window shows the bleed, gets paint to the cut, and the editor, which
 * clips at the trim, shows the same paint up to it.
 */
export function SpreadPaint({
  paint,
  width,
  height,
  bleed,
  idPrefix,
}: {
  paint: BookPaint;
  width: number;
  height: number;
  bleed: number;
  idPrefix: string;
}) {
  const w = r2(width + bleed * 2);
  const h = r2(height + bleed * 2);
  const box = useMemo(() => ({ x: 0, y: 0, w, h }), [w, h]);
  return (
    <svg
      aria-hidden
      width={`${w}mm`}
      height={`${h}mm`}
      viewBox={`0 0 ${w} ${h}`}
      // A page is laid out left to right in every language; its own direction makes the start its left edge.
      style={{
        position: 'absolute',
        direction: 'ltr',
        insetInlineStart: `${-bleed}mm`,
        top: `${-bleed}mm`,
        display: 'block',
        pointerEvents: 'none',
      }}
    >
      <PaintedPath d={`M0 0H${w}V${h}H0Z`} paint={paint} box={box} idPrefix={`bg-${idPrefix}`} />
    </svg>
  );
}
