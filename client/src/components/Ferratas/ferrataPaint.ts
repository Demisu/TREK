/**
 * The colours the via ferrata lines are drawn in.
 *
 * Ferratas have a look of their own, apart from the green, yellow and red the
 * tour line takes by gradient: a dark dashed line in the content colour on a
 * light casing in the surface colour, and the accent for the ferrata under the
 * pointer or open in the card. The grade is a badge on the card, never a line
 * colour.
 *
 * The default accent is neutral, close to the content colour itself, so a lit
 * ferrata in it would only lose its dashes. A grey accent therefore hands the
 * highlight to the info colour, and the lit line is drawn solid and wider, on
 * a wider casing, so it stands out by its shape as well as its colour.
 *
 * Map paint cannot take a `var(--token)`: Leaflet writes the colour into an
 * SVG `stroke` attribute and GL paint wants a resolved colour string. So the
 * tokens are read off the document when the layer draws (the precedent is the
 * hazard overlay in useHazardLayerGL), which keeps the lines on the user's
 * scheme without a colour literal of their own.
 */
export interface FerrataPaint {
  /** The dashed line itself. */
  line: string;
  /** The halo under the line, so it stays readable over a satellite or hillshade tile. */
  casing: string;
  /** The ferrata under the pointer or open in the card. */
  highlight: string;
}

const TOKENS = {
  line: '--text-primary',
  casing: '--bg-primary',
  highlight: '--accent',
  /** The highlight when the accent is a grey, which would not stand out from the line. */
  highlightFallback: '--info',
} as const;

/** How far apart the channels of a colour may lie and it still reads as a grey. */
const GREY_SPREAD = 24;

/** The red, green and blue of a hex or `rgb()` colour, or null for anything else (a name, `currentColor`). */
function channels(colour: string): [number, number, number] | null {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(colour);
  if (hex?.[1]) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d) : (hex[1].match(/../g) ?? []);
    const [r = 0, g = 0, b = 0] = digits.map((pair) => parseInt(pair, 16));
    return [r, g, b];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(colour);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** Whether a resolved colour is a grey (the neutral default accent, light or dark). */
export function isGreyColour(colour: string): boolean {
  const rgb = channels(colour);
  return !!rgb && Math.max(...rgb) - Math.min(...rgb) <= GREY_SPREAD;
}

/** What a token resolves to on the root, or `currentColor` where nothing defines it (a test DOM). */
function token(name: string, style: CSSStyleDeclaration | null): string {
  const value = style?.getPropertyValue(name).trim();
  return value || 'currentColor';
}

export function ferrataPaint(): FerrataPaint {
  const style = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const accent = token(TOKENS.highlight, style);
  return {
    line: token(TOKENS.line, style),
    casing: token(TOKENS.casing, style),
    highlight: isGreyColour(accent) ? token(TOKENS.highlightFallback, style) : accent,
  };
}

export function sameFerrataPaint(a: FerrataPaint, b: FerrataPaint): boolean {
  return a.line === b.line && a.casing === b.casing && a.highlight === b.highlight;
}
