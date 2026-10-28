/**
 * The GL map's cluster bubbles for the trip's places (MapViewGL draws them):
 * named here so the layers drawn over them, the assistant's route lines among
 * them, can leave a tap on a bubble to the bubble.
 */
export const PLACE_CLUSTER_CIRCLE_LAYER_ID = 'trip-place-clusters-circle';
export const PLACE_CLUSTER_COUNT_LAYER_ID = 'trip-place-clusters-count';

/** A count bubble's diameter in pixels: both renderers size their bubbles by it. */
export function clusterBubbleSize(count: number): number {
  return count < 10 ? 36 : count < 50 ? 42 : 48;
}

/**
 * A count bubble as DOM, styled by `.marker-cluster-custom` in index.css.
 *
 * The GL map draws its bubbles with this element rather than as canvas text, so they
 * read in the app's own font and get the same hover the Leaflet map has. A canvas
 * symbol layer can only use the glyphs the map style ships and knows no `:hover`.
 * The bubble sits in a bare wrapper because the pin positions its element through
 * `transform`, which would otherwise override the hover's scale.
 */
export function createClusterBubble(count: number): HTMLDivElement {
  const size = clusterBubbleSize(count);
  const bubble = document.createElement('div');
  bubble.className = 'marker-cluster-custom';
  bubble.style.width = `${size}px`;
  bubble.style.height = `${size}px`;
  const label = document.createElement('span');
  label.textContent = String(count);
  bubble.appendChild(label);
  const wrapper = document.createElement('div');
  wrapper.appendChild(bubble);
  return wrapper;
}
