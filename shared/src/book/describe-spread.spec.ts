import { MIN_PRINT_DPI, photoDpi, spreadFindings } from './book-findings';
import { applyBookTemplate, findBookTemplate, type BookTemplate } from './book-layouts';
import type { BookPhotoInfo } from './book-ops-core';
import { BOOK_OP_LIMITS, bookPageDescriptionSchema, bookOverviewSchema, type BookFinding } from './book-ops.schema';
import { blankBook } from './book-pages';
import {
  bookPhotoElementSchema,
  bookShapeElementSchema,
  bookTextElementSchema,
  type BookDocument,
  type BookElement,
  type BookPhotoElement,
  type BookSpread,
  type BookTextElement,
} from './book.schema';
import { describeSpread, listBookLayouts, summarizeBook, summarizeSpread } from './describe-spread';

import { describe, expect, it } from 'vitest';

/**
 * The page in words and its findings, on small fixture pages that each carry
 * one fault. The page is the default square book: 210 mm pages, a 420 mm
 * spread folded at 210, 3 mm bleed, 5 mm safe margin.
 */

type Frame = { x: number; y: number; w: number; h: number };

const photo = (id: string, photoId: number | null, frame: Frame, over: Partial<BookPhotoElement> = {}) =>
  bookPhotoElementSchema.parse({ id, kind: 'photo', frame, photoId, ...over }) as BookPhotoElement;
const text = (id: string, words: string, frame: Frame = { x: 230, y: 120, w: 160, h: 40 }, over = {}) =>
  bookTextElementSchema.parse({ id, kind: 'text', frame, text: words, size: 10, ...over }) as BookElement;

const gallery: BookPhotoInfo[] = [
  { photoId: 1, width: 4000, height: 3000, caption: 'Harbour' },
  { photoId: 2, width: 800, height: 600 },
  { photoId: 3 },
  { photoId: 4, width: 3000, height: 3000, hidden: true },
];

/** A clean picture and a short text on the right-hand page. */
const clean = (): BookElement[] => [photo('p-ok', 1, { x: 230, y: 20, w: 80, h: 60 }), text('t-ok', 'Harbour')];

function book(elements: BookElement[], over: Partial<BookSpread> = {}): BookDocument {
  const doc = blankBook({ title: 'Iceland', newId: (p) => `${p}-x` });
  const ids = ['sp-cover', 'sp-first', 'sp-in', 'sp-last', 'sp-back'];
  const spreads = doc.spreads.map((s, i) => ({ ...s, id: ids[i] as string }));
  spreads[2] = { ...(spreads[2] as BookSpread), elements, ...over };
  return { ...doc, spreads };
}

const findings = (elements: BookElement[], photos: BookPhotoInfo[] | undefined = gallery, over = {}) => {
  const doc = book(elements, over);
  return spreadFindings(doc.spreads[2] as BookSpread, doc.page, photos);
};
const codes = (list: BookFinding[]) => list.map((f) => `${f.severity}:${f.code}`);

describe('findings', () => {
  it('BOOKDESC-001: finds nothing on a clean page', () => {
    expect(findings(clean())).toEqual([]);
  });

  it('BOOKDESC-002: finds two photos on top of each other, naming both', () => {
    const list = findings([
      photo('p-a', 1, { x: 230, y: 20, w: 80, h: 60 }),
      photo('p-b', 1, { x: 260, y: 40, w: 80, h: 60 }),
    ]);
    expect(list.find((f) => f.code === 'overlap')).toMatchObject({ severity: 'severe', elementIds: ['p-a', 'p-b'] });
  });

  it('BOOKDESC-003: lets a text sit on a photo, which is a design, not a fault', () => {
    const list = findings([
      photo('p-a', 1, { x: 230, y: 20, w: 80, h: 60 }),
      text('t-a', 'On it', { x: 240, y: 30, w: 50, h: 10 }),
    ]);
    expect(codes(list)).not.toContain('severe:overlap');
  });

  it('BOOKDESC-004: finds words in the fold, says a photo across it, and a focal point there', () => {
    expect(codes(findings([text('t-f', 'Across', { x: 180, y: 120, w: 80, h: 20 })]))).toContain('severe:fold');
    const split = findings([photo('p-f', 1, { x: 170, y: 20, w: 80, h: 60 })]).find((f) => f.code === 'fold');
    expect(split).toMatchObject({ severity: 'warn', elementIds: ['p-f'] });
    expect(split?.message).toMatch(/focal point in it/);
    const aside = findings([photo('p-g', 1, { x: 170, y: 20, w: 80, h: 60 }, { focalX: 0.1 })]);
    expect(aside.find((f) => f.code === 'fold')?.message).toMatch(/meant to cross/);
    expect(codes(aside)).not.toContain('severe:fold');
    const wide = photo('p-w', 1, { x: -3, y: -3, w: 426, h: 216 }, { focalX: 0.5 });
    expect(codes(findings([wide]))).toContain('warn:fold');
  });

  it('BOOKDESC-005: finds words past the trim, words in the safe margin and a picture short of the bleed', () => {
    expect(codes(findings([text('t-x', 'Cut', { x: -10, y: 100, w: 60, h: 20 })]))).toContain('severe:trim');
    expect(codes(findings([text('t-s', 'Close', { x: 2, y: 100, w: 60, h: 20 })]))).toContain('warn:trim');
    const short = findings([photo('p-s', 1, { x: 229, y: -1, w: 80, h: 60 })]);
    expect(short.find((f) => f.code === 'trim')?.message).toMatch(/bleed/);
    const sliver = findings([photo('p-v', 1, { x: 230, y: 1, w: 80, h: 60 })]);
    expect(sliver.find((f) => f.code === 'trim')?.message).toMatch(/short of the page edge/);
  });

  it('BOOKDESC-006: finds an element off the page altogether', () => {
    expect(codes(findings([photo('p-o', 1, { x: 500, y: 20, w: 80, h: 60 })]))).toContain('warn:trim');
  });

  it('BOOKDESC-007: finds empty frames, in one finding', () => {
    const list = findings([
      photo('p-e1', null, { x: 230, y: 20, w: 40, h: 30 }),
      photo('p-e2', null, { x: 300, y: 20, w: 40, h: 30 }),
    ]);
    expect(list.filter((f) => f.code === 'empty_frame')).toEqual([
      expect.objectContaining({ severity: 'severe', elementIds: ['p-e1', 'p-e2'] }),
    ]);
  });

  it('BOOKDESC-008: finds a print under 200 dpi only when the original size is known', () => {
    const big = photo('p-l', 2, { x: 230, y: 20, w: 160, h: 120 });
    expect(photoDpi(big, gallery[1])).toBeLessThan(MIN_PRINT_DPI);
    expect(codes(findings([big]))).toContain('warn:low_dpi');
    const unknown = photo('p-u', 3, { x: 230, y: 20, w: 160, h: 120 });
    expect(photoDpi(unknown, gallery[2])).toBeNull();
    expect(codes(findings([unknown]))).not.toContain('warn:low_dpi');
  });

  it('BOOKDESC-009: finds a focal point outside an ellipse mask or hidden under another picture', () => {
    const masked = photo('p-m', 1, { x: 230, y: 20, w: 80, h: 60 }, { mask: 'ellipse', focalX: 0.95, focalY: 0.95 });
    expect(codes(findings([masked]))).toContain('warn:focal_cut');
    const under = photo('p-under', 1, { x: 230, y: 20, w: 160, h: 120 });
    const over = photo('p-over', 1, { x: 290, y: 60, w: 40, h: 40 });
    const list = findings([under, over]);
    expect(list.find((f) => f.code === 'focal_cut')?.message).toMatch(/p-over/);
  });

  it('BOOKDESC-010: finds a text that will likely not fit its frame', () => {
    const long = text('t-long', 'A long day on the ice. '.repeat(40), { x: 230, y: 120, w: 60, h: 12 });
    expect(findings([long]).find((f) => f.code === 'text_overflow')).toMatchObject({ severity: 'severe' });
  });

  it('BOOKDESC-011: notes what is parked and which photos are hidden from the page image', () => {
    const parked = [photo('p-park', 1, { x: 0, y: 0, w: 10, h: 10 }), text('t-park', 'Spare')];
    const list = findings([photo('p-h', 4, { x: 230, y: 20, w: 60, h: 60 })], gallery, { parked });
    expect(list.find((f) => f.code === 'parked')).toMatchObject({ severity: 'info', elementIds: ['p-park', 't-park'] });
    expect(codes(list)).toContain('info:hidden_photo');
  });

  it('BOOKDESC-012: notes a photo the gallery does not hold, only when the gallery is given', () => {
    const stray = [photo('p-st', 99, { x: 230, y: 20, w: 80, h: 60 })];
    expect(codes(findings(stray))).toContain('warn:not_in_gallery');
    const doc = book(stray);
    expect(codes(spreadFindings(doc.spreads[2] as BookSpread, doc.page))).not.toContain('warn:not_in_gallery');
  });

  it('BOOKDESC-020: measures a text with no leading of its own, as a layout sets a meta line, at the default', () => {
    const meta: Partial<BookTextElement> = {
      ...(text('t-m', 'June 2026', { x: 230, y: 20, w: 160, h: 5 }, { size: 7.5 }) as BookTextElement),
    };
    delete meta.leading;
    const fits = findings([meta as BookElement]);
    expect(codes(fits)).not.toContain('severe:text_overflow');
    expect(fits.map((f) => f.message).join(' ')).not.toMatch(/NaN/);
    const long = { ...meta, text: 'A long day on the ice. '.repeat(40) } as BookElement;
    expect(findings([long]).find((f) => f.code === 'text_overflow')?.message).toMatch(/needs about \d+(\.\d)? mm/);
  });

  it('BOOKDESC-021: takes the band-quote layout, type set across the spread, as meant rather than a fault', () => {
    const doc = book([
      photo('p-1', 1, { x: 230, y: 20, w: 80, h: 60 }),
      photo('p-2', 1, { x: 320, y: 20, w: 80, h: 60 }),
      text('t-h', 'Reykjavik', undefined, { size: 22 }),
      text('t-b', 'The wind never stopped.'),
    ]);
    const tpl = findBookTemplate('band-quote') as BookTemplate;
    const laid = applyBookTemplate(doc.spreads[2] as BookSpread, tpl, doc.page);
    const list = codes(spreadFindings(laid, doc.page, gallery));
    expect(list).toContain('warn:fold');
    expect(list).not.toContain('severe:fold');
  });

  it('BOOKDESC-022: notes a small picture set over a large one as an inset, not an overlap to fix', () => {
    const hero = photo('p-hero', 1, { x: 210, y: -3, w: 213, h: 130 });
    const inset = photo('p-in', 1, { x: 224, y: 104, w: 52, h: 40 });
    const list = findings([hero, inset]);
    expect(list.find((f) => f.code === 'overlap')).toMatchObject({ severity: 'info', elementIds: ['p-in', 'p-hero'] });
    expect(codes(list)).not.toContain('severe:overlap');
  });

  it('BOOKDESC-013: puts severe first and stops at the cap', () => {
    // 45 texts past the trim, each too small for its words: 90 severe findings before the cap.
    const many = Array.from({ length: 45 }, (_, i) => text(`t-${i}`, 'Cut', { x: -10, y: 5 + i * 4, w: 40, h: 3 }));
    const list = findings([...many, photo('p-e', null, { x: 230, y: 20, w: 40, h: 30 })], gallery, {
      parked: [text('t-p', 'Spare')],
    });
    expect(list).toHaveLength(BOOK_OP_LIMITS.findings);
    expect(list.every((f) => f.severity === 'severe')).toBe(true);
    const order = list.map((f) => ({ severe: 0, warn: 1, info: 2 })[f.severity]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('describeSpread', () => {
  it('BOOKDESC-014: says what the page is, every element back to front with its frame, and the findings', () => {
    const doc = book([...clean(), photo('p-e', null, { x: 330, y: 20, w: 40, h: 30 })], {
      background: '#fafafa',
      entryId: 7,
    });
    const d = describeSpread(doc, 'sp-in', gallery);
    expect(bookPageDescriptionSchema.safeParse(d).success).toBe(true);
    expect(d?.index).toBe(2);
    expect(d?.text).toMatch(/Page 3 of 5 \(sp-in\): a double spread, 420 x 210 mm/);
    expect(d?.text).toMatch(/fold at x 210/);
    expect(d?.text).toMatch(/Background #fafafa\. From entry 7\./);
    expect(d?.text).toMatch(
      /1\. photo p-ok at 230, 20, 80 x 60: photo 1, landscape 4000 x 3000 px in a landscape frame/,
    );
    expect(d?.text).toMatch(/2\. text t-ok .*"Harbour"/);
    expect(d?.text).toMatch(/3\. photo p-e .*empty frame/);
    expect(d?.text).toMatch(/- severe empty_frame/);
    expect(d?.elements.map((e) => e.id)).toEqual(['p-ok', 't-ok', 'p-e']);
  });

  it('BOOKDESC-015: says an empty page is empty and has no findings, and answers null for an unknown page', () => {
    const doc = book([]);
    expect(describeSpread(doc, 'sp-cover')?.text).toMatch(
      /the front cover, a single page, 210 x 210 mm[\s\S]*The page is empty\.[\s\S]*Findings: none\./,
    );
    expect(describeSpread(doc, 'sp-nope')).toBeNull();
  });

  it('BOOKDESC-016: tells a hidden photo apart, and how much of a picture a cover crop shows', () => {
    const doc = book([photo('p-h', 4, { x: 230, y: 20, w: 120, h: 60 })]);
    const t = describeSpread(doc, 'sp-in', gallery)?.text ?? '';
    expect(t).toMatch(/by another contributor, not shown/);
    expect(t).toMatch(/cover shows 50% of the picture/);
  });

  it('BOOKDESC-017: lists the parked elements and the bindings of texts', () => {
    const bound = text('t-b', 'Iceland', undefined, { binding: { source: 'journey.title' } });
    const doc = book([bound], { parked: [photo('p-park', 3, { x: 0, y: 0, w: 10, h: 10 })] });
    const d = describeSpread(doc, 'sp-in');
    expect(d?.text).toMatch(/bound to journey\.title/);
    expect(d?.text).toMatch(/Parked off the page \(1\): photo 3/);
    expect(d?.elements[0]).toMatchObject({ id: 't-b', binding: 'journey.title', text: 'Iceland' });
  });
});

describe('summaries', () => {
  it('BOOKDESC-018: sums a page up for get_book, and a book without its document', () => {
    const doc = book([...clean(), photo('p-e', null, { x: 330, y: 20, w: 40, h: 30 })]);
    expect(summarizeSpread(doc.spreads[2] as BookSpread, 2)).toEqual({
      index: 2,
      id: 'sp-in',
      role: 'inner',
      entryId: null,
      background: null,
      photoIds: [1],
      texts: ['Harbour'],
      elements: 3,
      emptyFrames: 1,
      parked: 0,
    });
    const overview = summarizeBook(doc, 4);
    expect(bookOverviewSchema.safeParse(overview).success).toBe(true);
    expect(overview).toMatchObject({ exists: true, version: 4, title: 'Iceland' });
    expect(summarizeBook(null, null)).toMatchObject({ exists: false, version: null, spreads: [] });
  });

  it('BOOKDESC-019: lists the layouts a page can use, by kind', () => {
    const doc = book([]);
    const shape = bookShapeElementSchema.parse({ id: 's', kind: 'shape', frame: { x: 0, y: 0, w: 10, h: 10 } });
    const withSaved: BookDocument = {
      ...doc,
      layouts: [
        {
          id: 'L1',
          name: 'Mine',
          role: 'single',
          pageWidth: 210,
          pageHeight: 210,
          background: null,
          elements: [shape],
        },
      ],
    };
    const all = listBookLayouts(withSaved, doc.page);
    expect(all.inner.length).toBeGreaterThan(0);
    expect(all.single.length).toBeGreaterThan(0);
    expect(all.grids.length).toBeGreaterThan(0);
    expect(all.saved).toEqual([{ id: 'L1', name: 'Mine', role: 'single', photoFrames: 0, texts: 0 }]);
    const inner = listBookLayouts(withSaved, doc.page, 'inner');
    expect(inner.single).toEqual([]);
    expect(inner.saved).toEqual([]);
  });

  it('BOOKDESC-023: says with the layouts what a grid and a template do to the page', () => {
    const { notes } = listBookLayouts(null, book([]).page);
    expect(notes.grids).toMatch(/re-pours every photo of the page, placed or parked/);
    expect(notes.templates).toMatch(/shapes, maps, badges, stats, lists and icons are dropped/);
  });
});
