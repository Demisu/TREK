/**
 * The name and grade of the via ferrata under the pointer on a GL map, the
 * twin of the Leaflet layer's sticky tooltip: the same words, the look of the
 * shared Tooltip (card surface, faint edge, caption tier), floating just above
 * the pointer.
 *
 * Built from the DOM rather than React, because it follows every mouse move:
 * a React state per move would render the whole map view each time. The words
 * go in as text, never as markup. It lives in the map's own container, so it
 * scrolls, hides and goes away with the map.
 */

/** How far above the pointer the label floats, in CSS pixels. */
const POINTER_GAP = 12;

const LABEL_CLASS =
  'pointer-events-none absolute z-20 whitespace-nowrap rounded-lg border border-edge-faint bg-surface-card px-2.5 py-1 text-caption font-medium text-content shadow-lg';

/** Just the call the label needs, so the Mapbox and the MapLibre map both fit, and a stand-in without it gets none. */
interface LabelHost {
  getContainer?(): HTMLElement;
}

interface FerrataHoverLabel {
  show(text: { name: string; grade: string | null }, point: { x: number; y: number }): void;
  hide(): void;
  remove(): void;
}

const NO_LABEL: FerrataHoverLabel = { show: () => undefined, hide: () => undefined, remove: () => undefined };

export function ferrataHoverLabel(map: LabelHost): FerrataHoverLabel {
  if (typeof map.getContainer !== 'function' || typeof document === 'undefined') return NO_LABEL;
  const container = map.getContainer();
  let element: HTMLDivElement | null = null;

  const ensure = () => {
    if (element) return element;
    element = document.createElement('div');
    element.className = LABEL_CLASS;
    element.setAttribute('role', 'tooltip');
    element.dataset.testid = 'ferrata-hover-label';
    // The pointer's pixel on the map, not a side of the text: placed from the corner either way.
    element.style.inset = '0px auto auto 0px';
    container.appendChild(element);
    return element;
  };

  return {
    show({ name, grade }, { x, y }) {
      const label = ensure();
      label.replaceChildren(document.createTextNode(name));
      if (grade) {
        const badge = document.createElement('span');
        badge.className = 'ms-1.5 font-semibold';
        badge.textContent = grade;
        label.appendChild(badge);
      }
      label.style.transform = `translate(${x}px, ${y - POINTER_GAP}px) translate(-50%, -100%)`;
      label.hidden = false;
    },
    hide() {
      if (element) element.hidden = true;
    },
    remove() {
      element?.remove();
      element = null;
    },
  };
}
