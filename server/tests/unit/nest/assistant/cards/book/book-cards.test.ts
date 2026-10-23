/**
 * ASTCARD-BKPG-001 to ASTCARD-BKPG-011
 *
 * The photo book's cards in the Studio's chat: a held book write tried on the
 * stored book with the shared engine (the pages before and after, numbered
 * among the double pages, the photos it brings, the findings it leaves and the
 * new severe ones among them, the engine's refusal in the tool's words), the
 * change card built from that trial and checked against the shared union, the
 * receipt from the tool's answer, the change row's words, and the way back
 * from every book write but a new book. Cards go through the registry's guard,
 * as a turn builds them.
 */
import { buildTripCard } from '../../../../../../src/nest/assistant/assistant-context';
import { toolOutputForProvider } from '../../../../../../src/nest/assistant/assistant-output';
import { unchangedSinceApplied } from '../../../../../../src/nest/assistant/assistant-undo.helpers';
import {
  bookAppliedCard,
  loadBook,
  type BookLoaded,
} from '../../../../../../src/nest/assistant/cards/book/book-change';
import {
  BOOK_TRIAL_READ,
  BOOK_TRIAL_TOOLS,
  trialFrom,
  tryBookChange,
  type BookTrialInput,
  type BookTrialRan,
} from '../../../../../../src/nest/assistant/cards/book/book-trial';
import type { PreviewContext, UndoSnapshot } from '../../../../../../src/nest/assistant/cards/card-types';
import { readKey } from '../../../../../../src/nest/assistant/cards/card-values';
import {
  appliedCardOf,
  ASSISTANT_ARG_POLICY,
  ASSISTANT_UNDO_MAP,
  ASSISTANT_WRITE_TOOLS,
  changeCardOf,
  undoReadsOf,
} from '../../../../../../src/nest/assistant/cards/registry';
import { describeToolCall } from '../../../../../../src/nest/assistant/tool-call-preview.helpers';
import {
  addBookPages,
  applyBookOps,
  blankBook,
  bookPageCardSchema,
  MAX_CARD_CHARS,
  type AssistantChangePreview,
  type BookDocument,
  type BookEditResult,
  type BookPageCard,
} from '@trek/shared';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const logMock = vi.hoisted(() => ({ logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../../../../../src/nest/audit/audit-log.logger', () => logMock);

beforeEach(() => vi.clearAllMocks());

const ctx: PreviewContext = {
  card: buildTripCard(0, 7, null, null, null),
  categories: new Map(),
  locale: 'en',
  today: '2026-10-22',
  airport: () => null,
};

/** A blank book with readable ids: sp-1 the cover, sp-2 the first page, sp-3 its double page, sp-4 and sp-5. */
function book(): BookDocument {
  let seq = 0;
  return blankBook({ title: 'Lisbon', newId: (prefix) => `${prefix}-${++seq}` });
}

/** The base a turn's gate tries a call on, as `trialBase` reads it: a journey without a book has no version. */
function input(doc: BookDocument | null = book()): BookTrialInput {
  let seq = 0;
  return {
    journeyId: 4,
    doc,
    version: doc ? 3 : null,
    ctx: {
      photos: [{ photoId: 81 }, { photoId: 82 }],
      journey: { title: 'Lisbon' },
      newId: (prefix) => `${prefix}-n${++seq}`,
    },
  };
}

function ran(tool: string, args: Record<string, unknown>, from: BookTrialInput = input()): BookTrialRan {
  const trial = tryBookChange(tool, args, from);
  if (trial?.ok !== true) throw new Error(`${tool} was refused: ${trial?.ok === false ? trial.refusal : 'no trial'}`);
  return trial;
}

const loaded = (trial: BookTrialRan): BookLoaded => ({ trial });

function cardOf(value: unknown): BookPageCard {
  const parsed = bookPageCardSchema.safeParse(value);
  if (!parsed.success) throw new Error(`not a book page card: ${parsed.error.message}`);
  return parsed.data;
}

const TWO_UP = { op: 'layout', template: 'two-up' };

/** A fixture book the engine made; one it refuses stops the test. */
function edited(done: BookEditResult): BookDocument {
  if (done.ok === false) throw new Error(`the fixture was refused: ${done.error.message}`);
  return done.doc;
}

/** The blank book with two more double pages after sp-3, sp-a1 and sp-a2. */
function threeSpreads(): BookDocument {
  let seq = 0;
  return edited(addBookPages(book(), { afterSpreadId: 'sp-3', count: 2 }, { newId: (p) => `${p}-a${++seq}` }));
}

describe('the trial of a held book write', () => {
  it('ASTCARD-BKPG-001: an edit is run by the engine: the page before and after, its number, and the new faults', () => {
    const trial = ran('edit_book_page', { spreadId: 'sp-3', ops: [TWO_UP] });
    expect(trial).toMatchObject({ journeyId: 4, version: 3, photosAdded: 0, layoutName: null, subject: '' });
    expect(trial.before).toEqual([{ spreadId: 'sp-3', index: 2, role: 'inner', number: 1, photos: 0 }]);
    expect(trial.after).toEqual([{ spreadId: 'sp-3', index: 2, role: 'inner', number: 1, photos: 0 }]);
    // Two empty frames: a fault the blank page did not have.
    expect(trial.fresh.map((finding) => finding.code)).toEqual(['empty_frame']);
    expect(trial.findings[0]?.severity).toBe('severe');

    const place = { op: 'place_photo', photoId: 81, target: 'new' };
    const placed = ran('edit_book_page', { spreadId: 'sp-3', ops: [place] });
    expect(placed).toMatchObject({ photosAdded: 1, fresh: [] });
    expect(placed.after[0]?.photos).toBe(1);

    // Filling one of two empty frames leaves the other empty: not a new fault, so nothing goes back.
    const twoUp = edited(applyBookOps(book(), { spreadId: 'sp-3', ops: [TWO_UP] }));
    const fill = { op: 'place_photo', photoId: 81, target: { slot: 0 } };
    const half = ran('edit_book_page', { spreadId: 'sp-3', ops: [fill] }, input(twoUp));
    expect(half.fresh).toEqual([]);
    expect(half.findings.map((finding) => finding.code)).toContain('empty_frame');
  });

  it("ASTCARD-BKPG-002: what the engine refuses is refused in the tool's words, before anything is held", () => {
    const outside = tryBookChange(
      'edit_book_page',
      { spreadId: 'sp-3', ops: [{ op: 'place_photo', photoId: 999, target: 'new' }] },
      input(),
    );
    expect(outside).toMatchObject({ ok: false, refusal: expect.stringMatching(/^ops\[0\]: /) });
    expect(tryBookChange('delete_book_pages', { spreadIds: ['sp-1'] }, input())).toMatchObject({
      ok: false,
      refusal: expect.stringContaining('cannot be deleted'),
    });
    expect(tryBookChange('edit_book_page', { spreadId: 'sp-3', ops: [TWO_UP] }, input(null))).toEqual({
      ok: false,
      refusal: 'This journey has no book yet: create_book makes one.',
    });
    expect(tryBookChange('create_book', {}, input())).toMatchObject({ ok: false });
    expect(tryBookChange('create_book', { preset: 'poster' }, input(null))).toMatchObject({ ok: false });
    expect(tryBookChange('get_book', {}, input())).toBeNull();
    expect(BOOK_TRIAL_TOOLS).toEqual(
      expect.arrayContaining([
        'create_book',
        'add_book_pages',
        'move_book_page',
        'delete_book_pages',
        'edit_book_page',
        'set_book_cover',
      ]),
    );
  });

  it('ASTCARD-BKPG-003: new pages, a move, a delete, the cover and a new book each name the pages they work on', () => {
    // A key the tool does not take is dropped, as the MCP layer drops it.
    const added = ran('add_book_pages', { afterSpreadId: 'sp-3', count: 2, template: 'two-up', note: 'x' });
    expect(added.before.map((page) => page.spreadId)).toEqual(['sp-3']);
    expect(added.after.map((page) => [page.index, page.number])).toEqual([
      [3, 2],
      [4, 3],
    ]);
    // A new page's template brings its frames empty: shown on the card, never sent back.
    expect(added.fresh).toEqual([]);
    expect(added.findings.filter((finding) => finding.code === 'empty_frame')).toHaveLength(2);

    const deleted = ran('delete_book_pages', { spreadIds: ['sp-3'] });
    expect(deleted.before.map((page) => page.spreadId)).toEqual(['sp-3']);
    expect(deleted.after).toEqual([]);

    const cover = ran('set_book_cover', { template: 'cover-full', photoId: 82, title: 'Portugal' });
    expect(cover.before).toEqual([{ spreadId: 'sp-1', index: 0, role: 'cover', number: null, photos: 0 }]);
    expect(cover.photosAdded).toBe(1);

    const fresh = ran('create_book', { title: '  Porto  ' }, input(null));
    expect(fresh).toMatchObject({ version: null, before: [], subject: 'Porto' });
    expect(fresh.after.map((page) => page.role)).toEqual(['cover', 'first', 'inner', 'last', 'back']);
    expect(ran('create_book', {}, input(null)).subject).toBe('Lisbon');
  });

  it('ASTCARD-BKPG-004: a move names where the page lands among the double pages; the cover stays', () => {
    const moved = ran('move_book_page', { spreadId: 'sp-3', toIndex: 4 }, input(threeSpreads()));
    expect(moved.before).toEqual([{ spreadId: 'sp-3', index: 2, role: 'inner', number: 1, photos: 0 }]);
    expect(moved.after).toEqual([{ spreadId: 'sp-3', index: 4, role: 'inner', number: 3, photos: 0 }]);
    expect(tryBookChange('move_book_page', { spreadId: 'sp-1', toIndex: 2 }, input())).toMatchObject({ ok: false });
  });
});

describe('the change card', () => {
  it('ASTCARD-BKPG-005: an edit carries its pages, operations, layout, photos and findings, valid and under the cap', () => {
    const args = { spreadId: 'sp-3', ops: [TWO_UP, { op: 'place_photo', photoId: 81, target: { slot: 0 } }] };
    const card = cardOf(changeCardOf('edit_book_page', ctx, args, loaded(ran('edit_book_page', args))));
    expect(card).toMatchObject({
      kind: 'bookPage',
      journeyId: 4,
      change: 'changed',
      baseVersion: 3,
      pages: [{ spreadId: 'sp-3', number: 1 }],
      count: 0,
      movedTo: null,
      cover: null,
      layout: { kind: 'template', id: 'two-up', name: null },
      photosAdded: 1,
      moreFindings: 0,
    });
    expect(card.ops).toHaveLength(2);
    expect(card.findings).toContainEqual({ code: 'empty_frame', severity: 'severe' });
    expect(changeCardOf('edit_book_page', ctx, args, null)).toBeNull();
    expect(changeCardOf('edit_book_page', ctx, args, { trial: null })).toBeNull();

    // Twenty long texts would weigh past the card's cap: the card keeps its facts and drops the operations.
    const words = Array.from({ length: 20 }, () => ({ op: 'text', role: 'body', text: 'w'.repeat(2000) }));
    const heavy = { spreadId: 'sp-3', ops: words };
    const light = cardOf(changeCardOf('edit_book_page', ctx, heavy, loaded(ran('edit_book_page', heavy))));
    expect(light.ops).toEqual([]);
    expect(JSON.stringify(light).length).toBeLessThan(MAX_CARD_CHARS);
  });

  it('ASTCARD-BKPG-006: new pages, a move, a delete, the cover and a new book each make their own card', () => {
    const add = { afterSpreadId: 'sp-3', count: 2, template: 'two-up' };
    expect(cardOf(changeCardOf('add_book_pages', ctx, add, loaded(ran('add_book_pages', add))))).toMatchObject({
      change: 'new',
      count: 2,
      pages: [{ spreadId: 'sp-3' }],
      layout: { kind: 'template', id: 'two-up' },
      ops: [],
    });
    const gone = { spreadIds: ['sp-3'] };
    const deleting = cardOf(changeCardOf('delete_book_pages', ctx, gone, loaded(ran('delete_book_pages', gone))));
    expect(deleting).toMatchObject({ change: 'willDelete', count: 1, pages: [{ spreadId: 'sp-3' }] });
    const cover = { template: 'cover-full', photoId: 82, title: 'Portugal' };
    expect(cardOf(changeCardOf('set_book_cover', ctx, cover, loaded(ran('set_book_cover', cover))))).toMatchObject({
      change: 'changed',
      cover: { template: 'cover-full', photoId: 82, title: 'Portugal', subtitle: null },
      layout: { kind: 'template', id: 'cover-full' },
    });
    const saved = { spreadId: 'sp-3', ops: [{ op: 'layout', auto: true }] };
    const fake = { ...ran('edit_book_page', { spreadId: 'sp-3', ops: [TWO_UP] }), layoutName: 'Mine' };
    expect(cardOf(changeCardOf('edit_book_page', ctx, saved, loaded(fake))).layout).toEqual({
      kind: 'auto',
      id: 'auto',
      name: null,
    });
    const named = { spreadId: 'sp-3', ops: [{ op: 'layout', saved: 'lay-1' }] };
    expect(cardOf(changeCardOf('edit_book_page', ctx, named, loaded(fake))).layout).toEqual({
      kind: 'saved',
      id: 'lay-1',
      name: 'Mine',
    });
    const fresh = cardOf(changeCardOf('create_book', ctx, {}, loaded(ran('create_book', {}, input(null)))));
    expect(fresh).toMatchObject({ change: 'new', baseVersion: null, pages: [], count: 5 });
  });

  it("ASTCARD-BKPG-007: the change row's words: the page's first text, a move's places, every book write a curated card", () => {
    for (const tool of BOOK_TRIAL_TOOLS) {
      expect(ASSISTANT_WRITE_TOOLS[tool]?.entity, tool).toBe('book_page');
      expect(describeToolCall(tool, 'c0', {}, ctx).verbKey).toBe(ASSISTANT_WRITE_TOOLS[tool]?.verbKey);
    }
    const heading = [{ op: 'text', role: 'heading', text: 'Alfama at dusk' }];
    const titled = edited(applyBookOps(book(), { spreadId: 'sp-3', ops: heading }));
    const args = { spreadId: 'sp-3', ops: [TWO_UP] };
    const headed = ran('edit_book_page', args, input(titled));
    const preview = describeToolCall('edit_book_page', 'c1', args, ctx, loaded(headed));
    expect(preview).toMatchObject({ verbKey: 'editBookPage', subject: 'Alfama at dusk', undoable: true });
    expect(preview.card?.kind).toBe('bookPage');
    const move = { spreadId: 'sp-3', toIndex: 4 };
    const trial = ran('move_book_page', move, input(threeSpreads()));
    const moved = describeToolCall('move_book_page', 'c2', move, ctx, loaded(trial));
    expect(moved.rows).toEqual([{ op: 'move', labelKey: 'position', before: '1', after: '3' }]);
    expect(moved.card).toMatchObject({ change: 'moved', movedTo: 3 });
    expect(describeToolCall('create_book', 'c3', {}, ctx).undoable).toBe(false);
  });
});

describe('the receipt and the way back', () => {
  const held = (card: BookPageCard): AssistantChangePreview => ({
    toolCallId: 'c1',
    verbKey: 'editBookPage',
    subject: '',
    rows: [],
    dayId: null,
    placeIds: [],
    undoable: true,
    card,
  });

  it('ASTCARD-BKPG-008: the receipt names the pages as the answer left them, numbered as the held card knew them', () => {
    const args = { spreadId: 'sp-3', ops: [TWO_UP] };
    const card = cardOf(changeCardOf('edit_book_page', ctx, args, loaded(ran('edit_book_page', args))));
    const answer = {
      version: 4,
      spread_ids: ['sp-3'],
      pages: [{ index: 2, id: 'sp-3', role: 'inner', photoIds: [81] }],
      findings: [{ code: 'overlap', severity: 'warn', elementIds: [], message: 'x' }, { code: 'made-up' }],
    };
    const receipt = cardOf(appliedCardOf('edit_book_page', { args, result: answer, preview: held(card) }));
    expect(receipt).toMatchObject({ baseVersion: 4, pages: [{ spreadId: 'sp-3', number: 1, photos: 1 }] });
    expect(receipt.findings).toEqual([{ code: 'overlap', severity: 'warn' }]);
    expect(receipt.ops).toEqual(card.ops);

    const add = { afterSpreadId: 'sp-3', count: 2 };
    const pending = cardOf(changeCardOf('add_book_pages', ctx, add, loaded(ran('add_book_pages', add))));
    const made = bookAppliedCard(
      {
        version: 4,
        pages: [
          { index: 3, id: 'sp-x', role: 'inner', photoIds: [] },
          { index: 4, id: 'sp-y', role: 'inner', photoIds: [] },
        ],
        findings: [],
      },
      held(pending),
    );
    expect(made?.pages.map((page) => [page.spreadId, page.number])).toEqual([
      ['sp-x', 2],
      ['sp-y', 3],
    ]);
    // Pages added after the first page are the first double pages.
    const early = { afterSpreadId: 'sp-2', count: 2 };
    const front = cardOf(changeCardOf('add_book_pages', ctx, early, loaded(ran('add_book_pages', early))));
    const opened = bookAppliedCard(
      {
        version: 4,
        pages: [
          { index: 3, id: 'sp-q', role: 'inner', photoIds: [] },
          { index: 2, id: 'sp-p', role: 'inner', photoIds: [] },
        ],
        findings: [],
      },
      held(front),
    );
    expect(opened?.pages.map((page) => [page.spreadId, page.number])).toEqual([
      ['sp-q', 2],
      ['sp-p', 1],
    ]);
    const gone = { spreadIds: ['sp-3'] };
    const deleting = cardOf(changeCardOf('delete_book_pages', ctx, gone, loaded(ran('delete_book_pages', gone))));
    expect(bookAppliedCard({ version: 4, pages: [], findings: [] }, held(deleting))?.pages).toEqual(deleting.pages);
    expect(bookAppliedCard(answer, null)).toBeNull();
  });

  it('ASTCARD-BKPG-011: findings past the card count severe ones and warnings only, and a full answer keeps the count', () => {
    const args = { spreadId: 'sp-3', ops: [TWO_UP] };
    const card = cardOf(changeCardOf('edit_book_page', ctx, args, loaded(ran('edit_book_page', args))));
    const finding = (severity: string) => ({ code: 'overlap', severity, elementIds: [], message: 'x' });
    const seven = [...Array.from({ length: 7 }, () => finding('warn')), finding('info'), finding('info')];
    const receipt = (findings: unknown[], more: number) =>
      bookAppliedCard({ version: 4, pages: [], findings }, held({ ...card, moreFindings: more }));
    // Six on the card, one warning past it; the two info findings are context, not counted.
    expect(receipt(seven, 0)).toMatchObject({ moreFindings: 1 });
    expect(receipt(seven, 0)?.findings).toHaveLength(6);
    // The answer lists 40 at most: a full list keeps the held card's count when that is higher.
    const full = Array.from({ length: 40 }, () => finding('severe'));
    expect(receipt(full, 50)).toMatchObject({ moreFindings: 50 });
    expect(receipt(full, 3)).toMatchObject({ moreFindings: 34 });
  });

  it('ASTCARD-BKPG-009: edits and the cover go back by restore checking their pages, deletes at their version; new pages and moves while unmoved', () => {
    const previous = [{ index: 2, spread: book().spreads[2] }];
    const result = { version: 4, spread_ids: ['sp-3'], previous_spreads: previous };
    for (const tool of ['edit_book_page', 'set_book_cover', 'delete_book_pages']) {
      expect(ASSISTANT_UNDO_MAP[tool]?.args({}, result, null), tool).toEqual({
        pages: previous,
        expectedVersion: 4,
      });
      expect(ASSISTANT_UNDO_MAP[tool]?.args({}, { version: 4 }, null)).toBeNull();
      expect(ASSISTANT_ARG_POLICY[tool]?.forced).toEqual({ returnPrevious: true });
      // The pages kept for the undo never reach the model or the chat.
      expect(toolOutputForProvider(tool, result)).toEqual({ version: 4, spread_ids: ['sp-3'] });
    }
    // With the digest of every page it puts back, the restore checks those pages only, not the book's version.
    const digests = [{ spreadId: 'sp-3', digest: '0123456789abcdef' }];
    const digested = { ...result, page_digests: digests };
    for (const tool of ['edit_book_page', 'set_book_cover']) {
      expect(ASSISTANT_UNDO_MAP[tool]?.args({}, digested, null), tool).toEqual({
        pages: previous,
        expectedVersion: 4,
        expectedPages: digests,
      });
      // The digests stay with the undo too: neither the model nor the chat sees them.
      expect(toolOutputForProvider(tool, digested)).toEqual({ version: 4, spread_ids: ['sp-3'] });
    }
    // A deleted page has no digest, and digests that miss a page leave the version to guard the restore.
    const deleted = { ...result, page_digests: [{ spreadId: 'sp-3', digest: null }] };
    expect(ASSISTANT_UNDO_MAP.delete_book_pages?.args({}, deleted, null)).toEqual({
      pages: previous,
      expectedVersion: 4,
    });
    const partial = { ...result, page_digests: [{ spreadId: 'sp-9', digest: '0123456789abcdef' }, 'odd'] };
    expect(ASSISTANT_UNDO_MAP.edit_book_page?.args({}, partial, null)).toEqual({ pages: previous, expectedVersion: 4 });
    expect(toolOutputForProvider('edit_book_page', { version: 4, page_digests: digests })).toEqual({ version: 4 });
    // The undo of new pages and of a move names the version the change left, so a save since refuses it.
    expect(ASSISTANT_UNDO_MAP.add_book_pages?.args({}, { version: 4, spread_ids: ['sp-x', 'sp-y'] }, null)).toEqual({
      spreadIds: ['sp-x', 'sp-y'],
      expectedVersion: 4,
    });
    expect(ASSISTANT_UNDO_MAP.add_book_pages?.args({}, { spread_ids: ['sp-x'] }, null)).toBeNull();
    const back = ASSISTANT_UNDO_MAP.move_book_page?.args({ spreadId: 'sp-3' }, { version: 4, from_index: 2 }, null);
    expect(back).toEqual({ spreadId: 'sp-3', toIndex: 2, expectedVersion: 4 });
    expect(ASSISTANT_UNDO_MAP.move_book_page?.args({ spreadId: 'sp-3' }, { from_index: 2 }, null)).toBeNull();
    // That version is the server's to set: the model never sees it.
    for (const tool of ['move_book_page', 'delete_book_pages']) {
      expect(ASSISTANT_ARG_POLICY[tool]?.stripped, tool).toEqual(['expectedVersion']);
    }
    expect(ASSISTANT_UNDO_MAP.create_book).toBeUndefined();
    expect(undoReadsOf('add_book_pages', {}, {})).toEqual([{ tool: 'get_book', args: {} }]);

    const snapshot = (version: number): UndoSnapshot => ({
      summary: null,
      places: null,
      reads: new Map([[readKey('get_book', {}), { exists: true, version }]]),
    });
    const unchanged = (tool: string, answer: unknown, version: number) =>
      unchangedSinceApplied(tool, answer, snapshot(version));
    expect(unchanged('add_book_pages', { version: 4 }, 4)).toBe(true);
    expect(unchanged('add_book_pages', { version: 4 }, 5)).toBe(false);
    expect(unchanged('move_book_page', {}, 4)).toBe(false);
    expect(unchanged('edit_book_page', result, 9)).toBe(true);
  });

  it('ASTCARD-BKPG-010: the lookup reads the trial through the turn reader; a refused or missing trial gives none', async () => {
    const trial = ran('edit_book_page', { spreadId: 'sp-3', ops: [TWO_UP] });
    const read = vi.fn(async (tool: string) => (tool === BOOK_TRIAL_READ ? trial : null));
    const args = { spreadId: 'sp-3', ops: [TWO_UP] };
    expect(await loadBook('edit_book_page', args, read)).toEqual({ trial });
    expect(read).toHaveBeenCalledWith(BOOK_TRIAL_READ, { tool: 'edit_book_page', args });
    const refused = vi.fn(async () => ({ ok: false, refusal: 'no' }));
    expect(await loadBook('edit_book_page', args, refused)).toEqual({ trial: null });
    expect(trialFrom({ ok: true })).toBeNull();
    expect(trialFrom('text')).toBeNull();
  });
});
