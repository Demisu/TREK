import { bookLevelFindings } from '../book-findings-design';
import { blankBook } from '../book-pages';
import {
  MAX_SPREADS,
  MAX_SPREAD_ELEMENTS,
  bookDocumentSchema,
  bookTextElementSchema,
  type BookDocument,
  type BookElement,
  type BookSpread,
} from '../book.schema';
import { pageFindings } from '../describe-spread';
import { designBook, type BookDesignInput, type BookDesignResult } from './design-book';
import type { BookDesignDirectivesInput } from './design-directives.schema';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The whole-book design engine on three journeys (rich, sparse, no figures)
 * and a set of directives: every style, both densities, a page budget, a
 * scope, chapters by day and by place, a palette from the photos, captions
 * and excerpts, chapter maps, a locked page kept. Each design is checked for
 * its structure (the framing in order, every chapter there, the rhythm, the
 * budget, the caps, a document the save route takes) and for being clean:
 * no severe and no warn finding left on any page or on the book.
 */

type Name = 'rich' | 'sparse' | 'nostats';

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url));
const fixtures = JSON.parse(readFileSync(here('./design-book.fixtures.json'), 'utf8')) as Record<
  Name,
  { input: BookDesignInput }
>;

/** The journey with ids minted by a counter, so a design is the same every run. */
function input(name: Name): BookDesignInput {
  let n = 0;
  return { ...fixtures[name].input, newId: (p) => `${p}-${++n}` };
}

const VARIANTS: [string, Name, BookDesignDirectivesInput][] = [
  ['minimal', 'rich', { style: 'minimal' }],
  ['editorial', 'rich', { style: 'editorial' }],
  ['journal', 'rich', { style: 'journal' }],
  ['bold', 'rich', { style: 'bold' }],
  ['scrapbook', 'rich', { style: 'scrapbook' }],
  ['airy', 'rich', { style: 'minimal', density: 'airy' }],
  ['dense', 'rich', { style: 'editorial', density: 'rich' }],
  ['budget', 'rich', { style: 'journal', pages: { min: 6, max: 10 } }],
  ['grow', 'rich', { style: 'minimal', pages: { min: 30 } }],
  ['scope', 'rich', { style: 'editorial', scope: { entryIds: [3, 4, 5, 6] } }],
  ['days', 'rich', { style: 'minimal', chapters: 'day' }],
  ['places', 'rich', { style: 'bold', chapters: 'place' }],
  ['palette', 'rich', { style: 'classic', palette: 'from_photos', type: { scale: 0.8 } }],
  ['captions', 'rich', { style: 'journal', text: { captions: 'photo', story: 'excerpt', excerptChars: 300 } }],
  ['maps', 'rich', { style: 'editorial', travel: { chapterMaps: true, dayBadges: false } }],
  ['sparse', 'sparse', { style: 'scrapbook' }],
  ['sparse-all', 'sparse', { style: 'minimal', photos: { pick: 'all' } }],
  ['nostats', 'nostats', { style: 'editorial' }],
  ['nostats-a5', 'nostats', { style: 'bold', preset: 'a5-landscape' }],
];

const FRAMING_ROLES = ['cover', 'first', 'last', 'back'];
const inner = (doc: BookDocument) => doc.spreads.filter((s) => s.role === 'inner');
const notInfo = (list: { severity: string }[]) => list.filter((f) => f.severity !== 'info');

/** Everything a design must be, whatever was asked of it. */
function checkStructure(result: BookDesignResult): void {
  const roles = result.doc.spreads.map((s) => s.role);
  expect(roles.slice(0, 2)).toEqual(['cover', 'first']);
  expect(roles.slice(-2)).toEqual(['last', 'back']);
  expect(roles.slice(2, -2).every((r) => r === 'inner')).toBe(true);
  expect(bookDocumentSchema.safeParse(result.doc).success).toBe(true);
  expect(result.doc.spreads.every((s) => s.elements.length <= MAX_SPREAD_ELEMENTS)).toBe(true);
  expect(new Set(result.doc.spreads.map((s) => s.id)).size).toBe(result.doc.spreads.length);
}

/** No severe and no warn finding, on any page or on the book, measured afresh. */
function checkClean(result: BookDesignResult, photos: BookDesignInput['photos']): void {
  expect(notInfo(result.findings)).toEqual([]);
  expect(result.plan.every((r) => r.findings.severe === 0 && r.findings.warn === 0)).toBe(true);
  for (const spread of result.doc.spreads) {
    const left = notInfo(pageFindings(spread, result.doc.page, photos));
    expect({ spread: spread.id, left }).toEqual({ spread: spread.id, left: [] });
  }
  expect(notInfo(bookLevelFindings(result.doc))).toEqual([]);
}

/** A loud spread (a hero, a panorama) is followed by a calm one, and heroes are four spreads apart. */
function checkRhythm(result: BookDesignResult): void {
  const beats = result.plan.filter((r) => r.action !== 'drop').map((r) => r.beat);
  const loud = (b: string) => b === 'hero' || b === 'pano';
  beats.forEach((b, i) => {
    if (i > 0 && loud(b)) expect(loud(beats[i - 1] as string)).toBe(false);
  });
  const heroes = beats.flatMap((b, i) => (b === 'hero' ? [i] : []));
  heroes.forEach((at, i) => {
    if (i > 0) expect(at - (heroes[i - 1] as number)).toBeGreaterThanOrEqual(4);
  });
}

/** Every entry with something to show opens a spread of its own (or is listed among the stations). */
function checkCoverage(result: BookDesignResult, entryIds: readonly number[]): void {
  const told = new Set<number>();
  for (const spread of result.doc.spreads) {
    if (spread.entryId != null) told.add(spread.entryId);
    for (const el of spread.elements) if (el.kind === 'text' && el.binding?.entryId) told.add(el.binding.entryId);
  }
  expect(entryIds.filter((id) => !told.has(id))).toEqual([]);
}

const substantive = (name: Name, ids?: readonly number[]) =>
  fixtures[name].input.entries
    .filter((e) => !ids || ids.includes(e.id))
    .filter((e) => e.photos.length > 0 || (e.story ?? '').trim())
    .map((e) => e.id);

describe('design_book', () => {
  for (const [label, name, directives] of VARIANTS) {
    it(`BOOKDSN-001: designs the ${label} variant with its framing in order, its pages valid and none left with a fault`, () => {
      const fx = input(name);
      const result = designBook(null, fx, directives);
      checkStructure(result);
      checkRhythm(result);
      checkClean(result, fx.photos);
    });
  }

  it('BOOKDSN-002: gives every entry with photos or words a spread, in the order of the journey', () => {
    for (const style of ['minimal', 'editorial', 'scrapbook'] as const) {
      checkCoverage(designBook(null, input('rich'), { style }), substantive('rich'));
    }
    checkCoverage(designBook(null, input('rich'), { style: 'minimal', chapters: 'day' }), substantive('rich'));
    checkCoverage(designBook(null, input('sparse'), { style: 'journal' }), substantive('sparse'));
    const scoped = designBook(null, input('rich'), { style: 'editorial', scope: { entryIds: [3, 4, 5, 6] } });
    checkCoverage(scoped, substantive('rich', [3, 4, 5, 6]));
    const others = scoped.doc.spreads.filter((s) => s.entryId != null && ![3, 4, 5, 6].includes(s.entryId));
    expect(others).toEqual([]);
  });

  it('BOOKDSN-003: keeps to the page budget, and grows when more pages are asked for', () => {
    const tight = designBook(null, input('rich'), { style: 'journal', pages: { min: 6, max: 10 } });
    expect(inner(tight.doc).length).toBeLessThanOrEqual(10);
    expect(tight.photos.left_out.some((p) => p.reason === 'page_budget')).toBe(true);
    const natural = inner(designBook(null, input('rich'), { style: 'minimal' }).doc).length;
    const grown = inner(designBook(null, input('rich'), { style: 'minimal', pages: { min: 30 } }).doc).length;
    expect(grown).toBeGreaterThan(natural);
  });

  it('BOOKDSN-004: sets every page in two typefaces at most, and colours from the photos when asked', () => {
    const result = designBook(null, input('rich'), { style: 'editorial' });
    expect(result.style).toMatchObject({ heading: 'playfair', body: 'garamond', paper: '#faf8f4' });
    const fonts = new Set(result.doc.spreads.flatMap((s) => s.elements.flatMap((e) => ('font' in e ? [e.font] : []))));
    expect([...fonts].sort()).toEqual(['garamond', 'playfair']);
    const tinted = designBook(null, input('rich'), { style: 'minimal', palette: 'from_photos' });
    expect(tinted.style.accent).not.toBe(result.style.accent);
    const given = (accent: string) =>
      designBook(null, input('sparse'), { style: 'minimal', palette: { paper: '#ffffff', ink: '#111111', accent } });
    expect(given('#C2410C').style.accent).toBe('#c2410c');
    expect(given('#fafafa').style.accent).toBe('#111111');
  });

  it('BOOKDSN-005: binds the words the journey owns, and the cover and title page to the journey', () => {
    const result = designBook(null, input('rich'), { style: 'editorial' });
    const texts = result.doc.spreads.flatMap((s) => s.elements.filter((e) => e.kind === 'text'));
    const sources = new Set(texts.flatMap((t) => (t.kind === 'text' && t.binding ? [t.binding.source] : [])));
    expect([...sources]).toEqual(expect.arrayContaining(['journey.title', 'entry.title', 'entry.date', 'entry.story']));
    const cover = result.doc.spreads[0] as BookSpread;
    expect(cover.elements.some((e) => e.kind === 'photo')).toBe(true);
    const own = designBook(null, input('rich'), { style: 'minimal', cover: { title: 'Our coast' } });
    const title = (own.doc.spreads[0] as BookSpread).elements.find((e) => e.kind === 'text');
    expect(title).toMatchObject({ text: 'Our coast', binding: null });
    expect(own.doc.title).toBe('Our coast');
  });

  it('BOOKDSN-006: leaves a near duplicate out and says why, and keeps every photo with pick all', () => {
    const best = designBook(null, input('rich'), { style: 'minimal' });
    expect(best.photos.left_out.some((p) => p.reason === 'near_duplicate_of')).toBe(true);
    const sparse = designBook(null, input('sparse'), { style: 'minimal', photos: { pick: 'all' } });
    expect(sparse.photos.used.sort()).toEqual([900, 901, 902]);
    const without = designBook(null, input('sparse'), { style: 'minimal', photos: { exclude: [902] } });
    expect(without.photos.used).not.toContain(902);
    expect(without.photos.left_out).toContainEqual({ photoId: 902, reason: 'excluded' });
  });

  it('BOOKDSN-007: keeps a locked page as it is, takes the place of the stored pages of its entries, drops the rest', () => {
    const stored = storedBook();
    const result = designBook(stored, input('rich'), { style: 'minimal' });
    const locked = result.doc.spreads.find((s) => s.id === 'sp-locked');
    expect(locked).toEqual(stored.spreads[2]);
    expect(result.plan.find((r) => r.spreadId === 'sp-locked')?.action).toBe('keep');
    expect(result.plan.find((r) => r.spreadId === 'sp-entry')?.action).toBe('replace');
    expect(result.plan.find((r) => r.spreadId === 'sp-hand')?.action).toBe('drop');
    expect(result.doc.spreads[0]?.id).toBe('sp-cover');
    checkClean(result, input('rich').photos);
    const edited = designBook(stored, input('rich'), { style: 'minimal', keep: 'edited' });
    expect(edited.plan.find((r) => r.spreadId === 'sp-hand')?.action).toBe('keep');
  });

  it('BOOKDSN-008: lays the classic style over a stored book as the Auto layout, keeping the locked page', () => {
    const stored = storedBook();
    const result = designBook(stored, input('rich'), { style: 'classic' });
    expect(result.doc.spreads.find((s) => s.id === 'sp-locked')).toEqual(stored.spreads[2]);
    expect(result.plan.find((r) => r.spreadId === 'sp-cover')?.action).toBe('replace');
    checkStructure(result);
  });

  it('BOOKDSN-009: designs the same book twice from the same journey and seed', () => {
    const a = designBook(null, input('rich'), { style: 'editorial', seed: 7 });
    const b = designBook(null, input('rich'), { style: 'editorial', seed: 7 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const c = designBook(null, input('rich'), { style: 'editorial', seed: 8 });
    expect(JSON.stringify(c.doc)).not.toBe(JSON.stringify(a.doc));
  });

  it('BOOKDSN-010: honours a new format only for a book with nothing on it yet', () => {
    const fresh = designBook(null, input('nostats'), { style: 'bold', preset: 'a5-landscape' });
    expect(fresh.doc.page).toMatchObject({ preset: 'a5-landscape', pageWidth: 210, pageHeight: 148 });
    const kept = designBook(storedBook(), input('rich'), { style: 'bold', preset: 'a5-landscape' });
    expect(kept.doc.page.preset).toBe('square-210');
  });

  it('BOOKDSN-011: runs classic as the Auto layout only when nothing more is asked, and measures its pages', () => {
    const photos = input('rich').photos;
    const auto = designBook(null, input('rich'), { style: 'classic' });
    expect(inner(auto.doc).length).toBeGreaterThan(4);
    for (const row of auto.plan) {
      const spread = auto.doc.spreads.find((s) => s.id === row.spreadId) as BookSpread;
      const left = pageFindings(spread, auto.doc.page, photos);
      expect(row.findings.severe).toBe(left.filter((f) => f.severity === 'severe').length);
      expect(row.findings.warn).toBe(left.filter((f) => f.severity === 'warn').length);
    }
    const budgeted = designBook(null, input('rich'), { style: 'classic', pages: { max: 4 } });
    expect(inner(budgeted.doc).length).toBeLessThanOrEqual(4);
    expect(budgeted.style).toMatchObject({ heading: 'sans', body: 'sans', paper: '#ffffff' });
    const titled = designBook(null, input('rich'), { style: 'classic', cover: { title: 'Our coast' } });
    const title = (titled.doc.spreads[0] as BookSpread).elements.find((e) => e.kind === 'text');
    expect(title).toMatchObject({ text: 'Our coast', binding: null });
  });

  it('BOOKDSN-012: holds a small page budget as a hard limit, the framing pages counted in it', () => {
    for (const style of ['editorial', 'bold'] as const) {
      const result = designBook(null, input('rich'), { style, pages: { max: 2 } });
      checkStructure(result);
      expect(inner(result.doc).length).toBeLessThanOrEqual(2);
      expect(result.notes.some((n) => n.includes('no room for'))).toBe(true);
    }
    const one = designBook(null, input('rich'), { style: 'minimal', pages: { min: 5, max: 1 } });
    expect(inner(one.doc).length).toBeLessThanOrEqual(1);
  });

  it('BOOKDSN-013: lays the cover out by the cover layout asked for, the same way every time', () => {
    const banded = designBook(null, input('rich'), { style: 'minimal', cover: { template: 'cover-band' } });
    const cover = banded.doc.spreads[0] as BookSpread;
    const photo = cover.elements.find((e) => e.kind === 'photo');
    expect(photo).toBeDefined();
    expect((photo?.frame.y ?? 0) + (photo?.frame.h ?? 0)).toBeLessThan(banded.doc.page.pageHeight);
    const bound = cover.elements.some((e) => e.kind === 'text' && e.binding?.source === 'journey.title');
    expect(bound).toBe(true);
    const again = designBook(null, input('rich'), { style: 'minimal', cover: { template: 'cover-band' } });
    expect(JSON.stringify(again.doc)).toBe(JSON.stringify(banded.doc));
  });

  it('BOOKDSN-014: stays within the spread cap beside many kept pages, the closing pages kept', () => {
    const stored = storedBook();
    const lockedPage = stored.spreads[2] as BookSpread;
    const many = Array.from({ length: MAX_SPREADS - 6 }, (_, i): BookSpread => ({
      ...lockedPage,
      id: `sp-l${i}`,
      elements: lockedPage.elements.map((e) => ({ ...e, id: `t-l${i}` })),
    }));
    const [cover, first] = stored.spreads;
    const full: BookDocument = {
      ...stored,
      spreads: [cover as BookSpread, first as BookSpread, ...many, ...stored.spreads.slice(-2)],
    };
    for (const style of ['minimal', 'classic'] as const) {
      const result = designBook(full, input('rich'), { style });
      checkStructure(result);
      expect(result.doc.spreads.length).toBeLessThanOrEqual(MAX_SPREADS);
      expect(inner(result.doc).length).toBeLessThanOrEqual(MAX_SPREADS - 4);
      expect(many.every((p) => result.doc.spreads.some((s) => s.id === p.id))).toBe(true);
      expect(result.notes.length).toBeGreaterThan(0);
    }
  });
});

/** A stored book: a page locked by hand, a page of entry 3, and a page made by hand. */
function storedBook(): BookDocument {
  const doc = blankBook({ title: 'Atlantic coast', newId: (p) => `${p}-s` });
  const ids = ['sp-cover', 'sp-first', 'sp-locked', 'sp-last', 'sp-back'];
  const spreads = doc.spreads.map((s, i) => ({ ...s, id: ids[i] as string }));
  const frame = { x: 230, y: 30, w: 150, h: 12 };
  const words = { kind: 'text', frame, text: 'Kept', font: 'inter', locked: true };
  const lockedText = bookTextElementSchema.parse({ id: 't-locked', ...words }) as BookElement;
  spreads[2] = { ...(spreads[2] as BookSpread), elements: [lockedText], entryId: 6 };
  const note = bookTextElementSchema.parse({ id: 't-hand', kind: 'text', frame, text: 'Ours', font: 'inter' });
  const entryPage = { ...(spreads[2] as BookSpread), id: 'sp-entry', elements: [], entryId: 3 };
  const handPage = { ...(spreads[2] as BookSpread), id: 'sp-hand', elements: [note as BookElement], entryId: null };
  spreads.splice(3, 0, entryPage, handPage);
  return { ...doc, spreads };
}
