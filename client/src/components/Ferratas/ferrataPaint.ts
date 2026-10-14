import type { FerrataTone } from './ferrataModel';

/**
 * The colours the via ferrata lines are drawn in, per difficulty band.
 *
 * Map paint cannot take a `var(--token)`: Leaflet writes the colour into an
 * SVG `stroke` attribute and GL paint wants a resolved colour string. So the
 * status tokens are read off the document when the layer draws (the precedent
 * is the hazard overlay in useHazardLayerGL), which keeps the lines on the
 * user's scheme without a colour literal of their own. Easy, medium and hard
 * follow the same success, warning and danger tones the grade badge uses, so
 * the line and the card agree.
 */
interface FerrataPaint {
  tone: Record<FerrataTone, string>;
  /** The halo under the line, so it stays readable over a satellite or hillshade tile. */
  casing: string;
}

const TONE_TOKENS: Record<FerrataTone, string> = {
  easy: '--success',
  medium: '--warning',
  hard: '--danger',
  unknown: '--text-muted',
};

/** What a token resolves to on the root, or `currentColor` where nothing defines it (a test DOM). */
function token(name: string, style: CSSStyleDeclaration | null): string {
  const value = style?.getPropertyValue(name).trim();
  return value || 'currentColor';
}

export function ferrataPaint(): FerrataPaint {
  const style = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  return {
    tone: {
      easy: token(TONE_TOKENS.easy, style),
      medium: token(TONE_TOKENS.medium, style),
      hard: token(TONE_TOKENS.hard, style),
      unknown: token(TONE_TOKENS.unknown, style),
    },
    casing: token('--bg-primary', style),
  };
}
