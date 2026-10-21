// FE-MAP-GHOST-001 to 003: the assistant's suggested places as map pins, built once for both renderers.
import { describe, expect, it, vi } from 'vitest';
import { GHOST_HOT_CLASS, buildGhostElement, mountGhosts, setGhostHot } from './assistantGhostMarker';

const GHOST = { id: 'c1', lat: 41.9, lng: 12.48, name: 'Pantheon', color: '#ff0000', icon: 'Landmark' };

describe('assistantGhostMarker', () => {
  it('FE-MAP-GHOST-001: a name never becomes markup, and the colour goes in as a CSS variable', () => {
    const el = buildGhostElement({ ...GHOST, name: '<img src=x onerror=alert(1)>' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.getAttribute('aria-label')).toBe('<img src=x onerror=alert(1)>');
    expect(el.style.getPropertyValue('--ghost-color')).toBe('#ff0000');
    expect(el.querySelector('.trek-ghost-face svg')).not.toBeNull();
  });

  it('FE-MAP-GHOST-002: the pointer reports the hover, a click or Enter reports the ghost without reaching the map', () => {
    const onHover = vi.fn();
    const onClick = vi.fn();
    const removed = vi.fn();
    const map = document.createElement('div');
    const mapClick = vi.fn();
    map.addEventListener('click', mapClick);
    const mounted = mountGhosts(
      [GHOST],
      (el) => {
        map.appendChild(el);
        return { remove: removed };
      },
      { current: { onHover, onClick } }
    );
    const el = mounted.elements.get('c1');
    el?.dispatchEvent(new Event('pointerenter'));
    el?.dispatchEvent(new Event('pointerleave'));
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onHover.mock.calls).toEqual([['c1'], [null]]);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(mapClick).not.toHaveBeenCalled();

    mounted.dispose();
    expect(removed).toHaveBeenCalledOnce();
    expect(mounted.elements.size).toBe(0);
  });

  it('FE-MAP-GHOST-003: only the hovered ghost is marked', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const elements = new Map([
      ['a', a],
      ['b', b],
    ]);
    setGhostHot(elements, 'b');
    expect([a.classList.contains(GHOST_HOT_CLASS), b.classList.contains(GHOST_HOT_CLASS)]).toEqual([false, true]);
    setGhostHot(elements, null);
    expect(b.classList.contains(GHOST_HOT_CLASS)).toBe(false);
  });
});
