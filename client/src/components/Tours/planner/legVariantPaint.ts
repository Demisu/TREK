import { useMemo } from 'react';
import { useMapPaint } from '../../Map/mapPaint';
import { withRouteHighlight } from '../bike/routeHighlight';
import type { LegVariant, LegVariantKey } from './legVariants';

/**
 * RTE-02: the colours of the ways offered for one section of a hike
 * (styles/hike.css), by their key: the way taken now in the route's blue, the
 * others in a hue each, over the white rim the route's highlights wear. The
 * card takes the CSS variable, the map the resolved colour.
 */
const VARIANT_PAINT_TOKENS = {
  current: '--hike-variant-current',
  a: '--hike-variant-a',
  b: '--hike-variant-b',
  c: '--hike-variant-c',
  casing: '--bike-highlight-casing',
} as const;

/** A way's colour as a CSS variable, for markup on the page. */
export function variantPaintCss(key: LegVariantKey): string {
  return `var(${VARIANT_PAINT_TOKENS[key]})`;
}

type Drawn = Parameters<typeof withRouteHighlight>;

/**
 * The ways in the order they are drawn: the one in focus (hovered or chosen)
 * last, so it lies on top of the others where they share a path.
 */
export function drawOrder(variants: readonly LegVariant[], focus: LegVariantKey | null): LegVariant[] {
  return [
    ...variants.filter((variant) => variant.key !== focus),
    ...variants.filter((variant) => variant.key === focus),
  ];
}

/**
 * The planner map's lines with the ways of the compared section laid over
 * them, each in its colour; the lines as they came while nothing is compared.
 * `overlays` are the same ways for the 3D view, which draws its own line.
 */
export function useLegVariantLines(
  route: Drawn[1],
  walking: Drawn[2],
  colors: Drawn[3],
  variants: readonly LegVariant[] | null,
  focus: LegVariantKey | null
) {
  const paint = useMapPaint(VARIANT_PAINT_TOKENS);
  return useMemo(() => {
    const ordered = variants ? drawOrder(variants, focus) : [];
    const highlight = ordered.length
      ? {
          id: 'leg-variants',
          lines: ordered.map((variant) => variant.coordinates),
          paint: 'current',
          paints: ordered.map((variant) => variant.key),
        }
      : null;
    const drawn = withRouteHighlight(highlight, route, walking, colors, { ...paint, way: paint.current });
    const overlays = ordered.map((variant) => ({ coordinates: variant.coordinates, color: paint[variant.key] }));
    return { ...drawn, overlays };
  }, [colors, focus, paint, route, variants, walking]);
}
