import {
  applyBookOps,
  type BookCardCover,
  type BookCardFinding,
  type BookCardLayout,
  type BookCardPage,
  type BookDocument,
  type BookFindingCode,
  type BookPageCard,
  type BookSpread,
  findBookGrid,
  findBookTemplate,
  setBookCover,
} from '@trek/shared';

import type { ChangeState } from '../../assistantParts';

/**
 * The pure side of the book's page card: how a page is named, what a layout
 * and a finding are called, and which spreads the card draws. The page before
 * and after a change comes from the Studio's own book with the shared engine,
 * the one the server tried the change with, so the card shows what the change
 * does to the page as it is on screen.
 */

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** The single pages by their role; a double page is named by its number. */
const ROLE_LOOK = {
  cover: { labelKey: 'assistant.card.book.cover' },
  first: { labelKey: 'assistant.card.book.first' },
  last: { labelKey: 'assistant.card.book.last' },
  back: { labelKey: 'assistant.card.book.back' },
} as const satisfies Record<Exclude<BookCardPage['role'], 'inner'>, { labelKey: string }>;

/** What each finding of the server's check is called. A table, so a new code fails to compile until it has words. */
const FINDING_LOOK: Readonly<Record<BookFindingCode, { labelKey: string }>> = {
  overlap: { labelKey: 'assistant.card.book.finding.overlap' },
  fold: { labelKey: 'assistant.card.book.finding.fold' },
  trim: { labelKey: 'assistant.card.book.finding.trim' },
  empty_frame: { labelKey: 'assistant.card.book.finding.empty_frame' },
  low_dpi: { labelKey: 'assistant.card.book.finding.low_dpi' },
  focal_cut: { labelKey: 'assistant.card.book.finding.focal_cut' },
  text_overflow: { labelKey: 'assistant.card.book.finding.text_overflow' },
  parked: { labelKey: 'assistant.card.book.finding.parked' },
  hidden_photo: { labelKey: 'assistant.card.book.finding.hidden_photo' },
  not_in_gallery: { labelKey: 'assistant.card.book.finding.not_in_gallery' },
  text_on_busy: { labelKey: 'assistant.card.book.finding.text_on_busy' },
  contrast_low: { labelKey: 'assistant.card.book.finding.contrast_low' },
  small_text: { labelKey: 'assistant.card.book.finding.small_text' },
  crowded: { labelKey: 'assistant.card.book.finding.crowded' },
  off_grid: { labelKey: 'assistant.card.book.finding.off_grid' },
  font_mix: { labelKey: 'assistant.card.book.finding.font_mix' },
  palette_drift: { labelKey: 'assistant.card.book.finding.palette_drift' },
  repeat_layout: { labelKey: 'assistant.card.book.finding.repeat_layout' },
};

/** A page as the Studio names it: the cover, the first page, double page 3. */
export function pageLabel(page: BookCardPage, t: Translate): string {
  if (page.role !== 'inner') return t(ROLE_LOOK[page.role].labelKey);
  return page.number === null
    ? t('assistant.card.book.spreadAny')
    : t('assistant.card.book.spread', { page: page.number });
}

/** What the change is about: its pages, or a new book. */
export function subjectOf(card: BookPageCard, t: Translate): string {
  if (card.pages.length === 0) return t('assistant.card.book.newBook');
  return card.pages.map((page) => pageLabel(page, t)).join(', ');
}

/** The name of the layout a change lays its page out on; null when there is none or this build does not know it. */
export function layoutLabel(layout: BookCardLayout | null, t: Translate): string | null {
  if (!layout) return null;
  if (layout.kind === 'auto') return t('assistant.card.book.layoutAuto');
  if (layout.kind === 'saved') return layout.name ?? layout.id;
  if (layout.kind === 'grid') {
    const grid = findBookGrid(layout.id);
    return grid ? t('assistant.card.book.grid', { count: grid.cells.length }) : null;
  }
  const template = findBookTemplate(layout.id);
  return template ? t(template.labelKey) : null;
}

/** The name of one finding. */
export function findingLabel(finding: BookCardFinding, t: Translate): string {
  return t(FINDING_LOOK[finding.code].labelKey);
}

/** The findings worth a look (severe ones and warnings, those past the card counted), and whether one is a fault. */
export function findingsToCheck(card: BookPageCard): { count: number; severe: boolean } {
  const shown = card.findings.filter((finding) => finding.severity !== 'info').length;
  const severe = card.findings.some((finding) => finding.severity === 'severe');
  return { count: shown + card.moreFindings, severe };
}

/** Each kind of finding once, the most severe first, as the server ordered them. */
export function distinctFindings(card: BookPageCard): BookCardFinding[] {
  const seen = new Set<BookFindingCode>();
  return card.findings.filter((finding) => {
    if (seen.has(finding.code)) return false;
    seen.add(finding.code);
    return true;
  });
}

/** What a page card draws of one page: where it stands, and the page before the change and after it. */
export interface BookPageView {
  index: number;
  before: BookSpread | null;
  after: BookSpread | null;
}

const GONE: ReadonlySet<ChangeState> = new Set(['failed', 'discarded', 'expired']);

/** `set_book_cover`'s arguments from the card, without the parts it leaves as they are. */
function coverArgs(cover: BookCardCover): Record<string, unknown> {
  return Object.fromEntries(Object.entries(cover).filter(([, value]) => value !== null));
}

/** The page as the change would leave it, run on the Studio's book; null when the card carries nothing to run. */
function afterOf(card: BookPageCard, doc: BookDocument, spreadId: string): BookSpread | null {
  let made: ReturnType<typeof applyBookOps> | null = null;
  if (card.cover) made = setBookCover(doc, coverArgs(card.cover));
  else if (card.ops.length > 0) made = applyBookOps(doc, { spreadId, ops: card.ops });
  if (!made || made.ok === false) return null;
  return made.doc.spreads.find((spread) => spread.id === spreadId) ?? null;
}

/** Where a page stands in the book on screen, and the page; null where the book does not hold it. */
function spreadAt(doc: BookDocument, spreadId: string): { index: number; current: BookSpread } | null {
  const index = doc.spreads.findIndex((spread) => spread.id === spreadId);
  const current = doc.spreads[index];
  return current ? { index, current } : null;
}

/**
 * The spreads a page card draws from the Studio's book, one view per page:
 * while the change waits, its page as it is and as the change would leave it
 * (a move shows its page alone, a delete each page it takes alone); once
 * applied, the page as it is now. Nothing for new pages not made yet, for a
 * change that did not run, or where the book on screen does not hold the
 * page (another book, or none open).
 */
export function pageViewOf(card: BookPageCard, doc: BookDocument | null, state: ChangeState): BookPageView[] {
  if (!doc || GONE.has(state)) return [];
  if (card.change === 'willDelete' && state !== 'applied') {
    return card.pages.flatMap((page) => {
      const found = spreadAt(doc, page.spreadId);
      return found ? [{ index: found.index, before: found.current, after: null }] : [];
    });
  }
  const spreadId = card.pages[0]?.spreadId;
  const found = spreadId ? spreadAt(doc, spreadId) : null;
  if (!spreadId || !found) return [];
  if (state === 'applied') return [{ index: found.index, before: null, after: found.current }];
  if (card.change === 'new') return [];
  return [{ index: found.index, before: found.current, after: afterOf(card, doc, spreadId) }];
}
