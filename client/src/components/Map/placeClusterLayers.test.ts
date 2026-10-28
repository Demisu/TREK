import { describe, it, expect } from 'vitest';
import { clusterBubbleSize, createClusterBubble } from './placeClusterLayers';

describe('cluster bubbles', () => {
  it('FE-COMP-PLACECLUSTER-001: a bubble grows in three steps with its count', () => {
    expect([1, 9, 10, 49, 50, 500].map(clusterBubbleSize)).toEqual([36, 36, 42, 42, 48, 48]);
  });

  it('FE-COMP-PLACECLUSTER-002: the GL bubble is the Leaflet markup inside a bare wrapper the pin can move', () => {
    const wrapper = createClusterBubble(38);
    expect(wrapper.className).toBe('');
    const bubble = wrapper.firstElementChild as HTMLElement;
    expect(bubble.className).toBe('marker-cluster-custom');
    expect(bubble.style.width).toBe('42px');
    expect(bubble.style.height).toBe('42px');
    expect(bubble.textContent).toBe('38');
  });
});
