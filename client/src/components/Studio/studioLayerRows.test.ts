import type { BookElement, BookSpread } from '@trek/shared';
import { bookShapeElementSchema, bookTextElementSchema } from '@trek/shared';
import { describe, expect, it } from 'vitest';

import { dropOn, layerLabel, layerRows, rowIds } from './studioLayerRows';
import { shortcutKeys } from './studioShortcut';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a value');
  return value;
}

const shape = (id: string, over: Partial<BookElement> = {}) =>
  bookShapeElementSchema.parse({
    id,
    kind: 'shape',
    frame: { x: 0, y: 0, w: 10, h: 10 },
    shape: 'rect',
    ...over,
  }) as BookElement;

const spread = {
  id: 'sp',
  role: 'inner',
  background: null,
  parked: [],
  entryId: null,
  elements: [shape('back'), shape('m1', { group: 'g' }), shape('m2', { group: 'g' }), shape('front')],
  groups: [{ id: 'g', name: 'Pair' }],
} as BookSpread;

describe('layerRows', () => {
  it('lists the page front to back, a group with its members under it', () => {
    const rows = layerRows(spread, new Set());
    expect(rows.map((r) => r.key)).toEqual(['front', 'g:g', 'm2', 'm1', 'back']);
    const group = must(rows[1]);
    expect(group.type === 'group' && group.name).toBe('Pair');
    expect(rowIds(group)).toEqual(['m2', 'm1']);
    expect(rowIds(must(rows[0]))).toEqual(['front']);
  });

  it('shows a folded group as its row alone', () => {
    expect(layerRows(spread, new Set(['g'])).map((r) => r.key)).toEqual(['front', 'g:g', 'back']);
  });
});

describe('dropOn', () => {
  const rows = layerRows(spread, new Set());
  it('puts what is dragged in front of or behind an element row', () => {
    expect(dropOn(must(rows[0]), true)).toEqual({ anchorId: 'front', where: 'above', join: false });
    expect(dropOn(must(rows[4]), false)).toEqual({ anchorId: 'back', where: 'below', join: false });
  });

  it('takes it into a group on a member row, and beside the whole group on the group row', () => {
    expect(dropOn(must(rows[2]), false)).toEqual({ anchorId: 'm2', where: 'below', join: true });
    expect(dropOn(must(rows[1]), true)).toEqual({ anchorId: 'm2', where: 'above', join: false });
    expect(dropOn(must(rows[1]), false)).toEqual({ anchorId: 'm1', where: 'below', join: false });
  });
});

describe('layerLabel', () => {
  it('uses the name, then a text’s first words, then the kind', () => {
    expect(layerLabel(shape('a', { name: 'Sun' }), 'Shape')).toBe('Sun');
    expect(layerLabel(shape('a'), 'Shape')).toBe('Shape');
    const words = bookTextElementSchema.parse({
      id: 't',
      kind: 'text',
      frame: { x: 0, y: 0, w: 1, h: 1 },
      text: '\n  Reykjavik  \nmore',
    });
    expect(layerLabel(words as BookElement, 'Text')).toBe('Reykjavik');
    const long = bookTextElementSchema.parse({
      id: 't',
      kind: 'text',
      frame: { x: 0, y: 0, w: 1, h: 1 },
      text: 'x'.repeat(60),
    });
    expect(layerLabel(long as BookElement, 'Text')).toHaveLength(40);
    const empty = bookTextElementSchema.parse({ id: 't', kind: 'text', frame: { x: 0, y: 0, w: 1, h: 1 }, text: '  ' });
    expect(layerLabel(empty as BookElement, 'Text')).toBe('Text');
  });
});

describe('shortcutKeys', () => {
  it('spells the command and option keys for the platform', () => {
    expect(shortcutKeys(true, 'Ctrl', ['⇧', 'G'])).toEqual(['⌘', '⇧', 'G']);
    expect(shortcutKeys(false, 'Strg', ['alt', 'C'])).toEqual(['Strg', 'Alt', 'C']);
    expect(shortcutKeys(true, 'Ctrl', ['alt', 'V'])).toEqual(['⌘', '⌥', 'V']);
  });
});
