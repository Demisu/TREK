import type { AutoEntry } from '../auto/auto-types';
import type { BookElement, BookSpread } from '../book.schema';
import type { BookDesignInput } from './design-book';
import type { ComposeCtx } from './design-compose';
import { composeCountries, composeStations, composeSummary } from './design-framing';
import type { DesignedSpread } from './design-merge';
import {
  buildChapters,
  fitChapters,
  naturalSpreads,
  newRhythm,
  planChapter,
  settleRhythm,
  shareSpreads,
  type DesignChapter,
  type PlannedSpread,
} from './design-pacing';
import type { BookDesignLeftOut, DesignPhotoChoice } from './design-photos';
import {
  composeDuo,
  composeGrid,
  composeHero,
  composeOpener,
  composePano,
  composeQuiet,
  composeTrio,
  innerSpread,
  panoFits,
  type Composed,
} from './design-spreads';

/**
 * The inner pages of a designed book: the journey at a glance and its
 * countries, the chapters paced to the page budget, the closing totals.
 */

export interface FramingNeeds {
  /** Inner spreads the book has room for, the kept stored pages taken off. */
  room: number;
  /** Bare stops one stations spread holds. */
  perStations: number;
}

interface InnerResult {
  spreads: DesignedSpread[];
  leftOut: BookDesignLeftOut[];
  notes: string[];
}

type FramingKind = 'summary' | 'countries' | 'closing';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The inner framing pages the journey has something for: the summary, the countries, the closing totals. */
function framingInner(c: ComposeCtx): FramingKind[] {
  const stats = c.travel.stats;
  const travel = c.directives.travel;
  const out: FramingKind[] = [];
  if (!stats) return out;
  if ((travel?.summary ?? true) && stats.points.length >= 2) out.push('summary');
  if ((travel?.countries ?? true) && stats.countries.length >= 2) out.push('countries');
  const closes = c.directives.style === 'editorial' || c.directives.style === 'bold';
  if (closes && stats.points.length >= 2) out.push('closing');
  return out;
}

/** The most inner spreads the design may make: `pages.max`, and never past the room the book has. */
const innerCap = (c: ComposeCtx, needs: FramingNeeds) =>
  Math.max(0, Math.min(c.directives.pages?.max ?? needs.room, needs.room));

/**
 * The framing pages that fit beside at least one chapter spread: past the cap
 * the closing totals go first, then the countries, then the summary.
 */
function fittingFraming(all: readonly FramingKind[], cap: number): FramingKind[] {
  let out = [...all];
  for (const drop of ['closing', 'countries', 'summary'] as const) {
    if (out.length + 1 <= cap) break;
    out = out.filter((k) => k !== drop);
  }
  return out;
}

/** Spreads for the chapters, within the page budget the directives set (framing pages count as pages). */
function chapterBudget(c: ComposeCtx, natural: number, framing: number, cap: number): number {
  const lo = Math.min(c.directives.pages?.min ?? 1, cap);
  return Math.max(1, clamp(natural + framing, lo, Math.max(lo, cap)) - framing);
}

/**
 * The chapter pages within the cap. Stations pages take what their stops need
 * and a chapter may round up, so the end is cut here; the photos of a page cut
 * are said to be left out for the budget.
 */
function withinCap(body: DesignedSpread[], room: number, leftOut: BookDesignLeftOut[], notes: string[]) {
  const keep = Math.max(0, room);
  if (body.length <= keep) return body;
  const cut = body.slice(keep);
  for (const d of cut) {
    for (const e of d.spread.elements) {
      if (e.kind === 'photo' && e.photoId != null) leftOut.push({ photoId: e.photoId, reason: 'page_budget' });
    }
  }
  notes.push(`${cut.length} pages past the page budget are left out`);
  return body.slice(0, keep);
}

function framingElements(c: ComposeCtx, kind: FramingKind, input: BookDesignInput): BookElement[] {
  const stats = c.travel.stats;
  if (kind === 'countries') return composeCountries(c, input.countriesLabel);
  if (!stats) return [];
  return composeSummary(c, stats, input.summaryLabel, kind === 'summary' ? 'left' : 'right');
}

function framingSpread(c: ComposeCtx, kind: FramingKind, input: BookDesignInput): DesignedSpread {
  return { spread: innerSpread(c, framingElements(c, kind, input), null), beat: kind, chapter: null, findings: [] };
}

/** The pages of a list of bare stops: as many stations spreads as the stops need. */
function stationsSpreads(c: ComposeCtx, chapter: DesignChapter, input: BookDesignInput): DesignedSpread[] {
  const out: DesignedSpread[] = [];
  let rest = chapter.entries;
  while (rest.length) {
    const set = composeStations(c, rest, input.stationsLabel);
    if (!set.placed) break;
    out.push({ spread: innerSpread(c, set.elements, null), beat: 'stations', chapter: null, findings: [] });
    rest = rest.slice(set.placed);
  }
  return out;
}

const chapterName = (chapter: DesignChapter) => chapter.label ?? chapter.entries[0]?.title ?? null;

/** One planned spread, composed; the story still to set is carried from the opener to its quiet page. */
function composePlanned(c: ComposeCtx, plan: PlannedSpread, hand: 'left' | 'right', carry: string): Composed {
  const entry = plan.entry;
  const entryId = plan.chapter.entries[0]?.id ?? null;
  const [first, ...more] = plan.photos;
  switch (plan.beat) {
    case 'hero':
      if (entry && first) return composeHero(c, entry, first, hand);
      break;
    case 'pano':
      if (entry && first && panoFits(c, first)) return composePano(c, entry, first, more, hand);
      break;
    case 'quiet':
      return composeQuiet(c, entry, carry, first ?? null, hand);
    case 'duo':
      return composeDuo(c, plan.photos, hand, entryId);
    case 'trio':
      return composeTrio(c, plan.photos, hand, entryId);
    case 'grid':
      return composeGrid(c, plan.photos, hand, entryId);
    default:
      break;
  }
  if (entry) return composeOpener(c, entry, first ?? null, hand);
  return composeGrid(c, plan.photos, hand, entryId);
}

/** A chapter's spreads, composed from its plan, the photo page alternating across the book. */
function chapterSpreads(c: ComposeCtx, chapter: DesignChapter, plans: readonly PlannedSpread[], start: number) {
  const out: DesignedSpread[] = [];
  let carry = '';
  plans.forEach((plan, i) => {
    // A quiet page with no words left to set and no photo would be an empty spread: it is left out.
    if (plan.beat === 'quiet' && !carry && !plan.photos.length) return;
    const hand = (start + i + (c.directives.seed ?? 0)) % 2 === 0 ? 'left' : 'right';
    const done = composePlanned(c, plan, hand, carry);
    carry = done.rest;
    const spread: BookSpread = innerSpread(c, done.elements, chapter.entries[0]?.id ?? null);
    out.push({ spread, beat: plan.beat, chapter: chapterName(chapter), findings: [] });
  });
  const entry = chapter.entries[0];
  if (carry && entry && (c.directives.text?.story ?? 'full') === 'full') {
    c.notes.push(`part of the story of entry ${entry.id} found no page within the budget and is left out`);
  }
  return out;
}

/** Every inner page of the designed book, in order. */
export function composeDesignedInner(
  c: ComposeCtx,
  entries: readonly AutoEntry[],
  choice: DesignPhotoChoice,
  input: BookDesignInput,
  needs: FramingNeeds,
): InnerResult {
  const notes: string[] = [];
  const leftOut: BookDesignLeftOut[] = [];
  const cap = innerCap(c, needs);
  const wanted = framingInner(c);
  const framing = fittingFraming(wanted, cap);
  if (framing.length < wanted.length) {
    notes.push(`the page budget leaves no room for: ${wanted.slice(framing.length).join(', ')}`);
  }
  const naturalOf = (ch: DesignChapter) => naturalSpreads(ch, c.directives, needs.perStations);
  let chapters = buildChapters(entries, choice.byEntry, c.directives, input.candidates);
  const natural = chapters.map(naturalOf).reduce((a, b) => a + b, 0);
  const budget = chapterBudget(c, natural, framing.length, cap);
  if (budget < chapters.length) {
    notes.push(`${chapters.length} chapters share ${budget} spreads, so neighbouring chapters are combined`);
    chapters = fitChapters(chapters, budget);
  }
  const shares = shareSpreads(chapters, chapters.map(naturalOf), budget);
  const rhythm = newRhythm();
  const plan = { directives: c.directives, page: c.page, infos: c.infos };
  const body: DesignedSpread[] = [];
  chapters.forEach((chapter, i) => {
    if (chapter.stations) {
      body.push(...stationsSpreads(c, chapter, input));
      return;
    }
    const from = rhythm.beats.length;
    const plans = planChapter(chapter, shares[i] ?? 1, rhythm, plan, leftOut);
    const made = chapterSpreads(c, chapter, plans, body.length);
    settleRhythm(
      rhythm,
      from,
      made.map((d) => d.beat),
    );
    body.push(...made);
  });
  const head = framing.filter((k) => k !== 'closing').map((k) => framingSpread(c, k, input));
  const tail = framing.filter((k) => k === 'closing').map((k) => framingSpread(c, k, input));
  const fitted = withinCap(body, cap - head.length - tail.length, leftOut, notes);
  return { spreads: [...head, ...fitted, ...tail], leftOut, notes };
}
