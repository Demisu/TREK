import { useMapPaint } from '../../Map/mapPaint';

/**
 * MAP-03: the colours of the SAC grades along a hike (styles/hike.css), by
 * name. The card takes the CSS variable, which follows the theme on its own;
 * the map reads them resolved (`useHikePaint`). A way without a known grade
 * is drawn in the bike paints' grey of the unknown, the one grey the route
 * paints use for what the data does not say.
 */
const HIKE_PAINT_TOKENS = {
  t1: '--hike-sac-t1',
  t2: '--hike-sac-t2',
  t3: '--hike-sac-t3',
  t4: '--hike-sac-t4',
  t5: '--hike-sac-t5',
  t6: '--hike-sac-t6',
} as const;

export type HikePaintKey = keyof typeof HIKE_PAINT_TOKENS;

/** A colour as a CSS variable, for markup on the page. */
export function hikePaintCss(key: HikePaintKey): string {
  return `var(${HIKE_PAINT_TOKENS[key]})`;
}

/** The colours resolved for map paint, again whenever the theme changes. */
export function useHikePaint(): Record<HikePaintKey, string> {
  return useMapPaint(HIKE_PAINT_TOKENS);
}
