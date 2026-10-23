import type { AutoEntry, AutoPhoto } from '../auto/auto-types';
import { bookEntryListItems, bookTravelList, bookTravelMap, bookTravelSize } from '../book-travel';
import type { BookElement, BookFrame, BookSpread, BookTextElement } from '../book.schema';
import type { JourneyStats } from '../journey-stats.schema';
import {
  bleedPage,
  bleedSpread,
  frameOf,
  liveBox,
  other,
  pageX,
  photoEl,
  printsAt,
  scaled,
  scrimEl,
  storyEl,
  textEl,
  titleBlock,
  turnOf,
  type ComposeCtx,
  type Side,
} from './design-compose';
import { isLandscape } from './design-photos';
import { paperBackground } from './design-style';

/**
 * The spreads of a chapter, one composer per beat: the opener, the hero, a
 * quiet page for a long story, two, three and four to six photos, and a
 * panorama across the fold. Each takes the photos the plan gave it and the
 * page (left or right) its photos lead on, and hands back the elements and
 * whatever of the story it could not set. An entry's pros and cons go under
 * its words where they leave room: on the opener, the panorama or a quiet
 * page, which also sets them beside its photo when it has no words.
 */

export interface Composed {
  elements: BookElement[];
  /** The part of the story still to be set, for the next quiet page. */
  rest: string;
  /** Whether the entry's pros and cons were set on this page. */
  listed?: boolean;
}

type Hand = 'left' | 'right';

/** A photo's caption under it, when the directives ask for photo captions and it has one. */
function captionFor(c: ComposeCtx, photo: AutoPhoto, frame: BookFrame, entryId: number | null): BookElement | null {
  if ((c.directives.text?.captions ?? 'entry') !== 'photo' || !photo.caption?.trim()) return null;
  const binding = { source: 'photo.caption' as const, photoId: photo.photoId, ...(entryId ? { entryId } : {}) };
  const at = { x: frame.x, y: frame.y + frame.h + 2, w: frame.w };
  return textEl(c, at, photo.caption.trim(), 'caption', { binding });
}

/** The room a caption takes under a photo, when one will be set. */
function captionRoom(c: ComposeCtx, photos: readonly AutoPhoto[]): number {
  if ((c.directives.text?.captions ?? 'entry') !== 'photo') return 0;
  return photos.some((p) => p.caption?.trim()) ? scaled(c, 9) : 0;
}

/** Photos in a page's live area: one, two (stacked or side by side by their shape) or three. */
function pagePhotos(c: ComposeCtx, photos: readonly AutoPhoto[], side: Side, entryId: number | null): BookElement[] {
  const box = liveBox(c, side);
  const g = c.grid.gutter;
  const room = captionRoom(c, photos);
  const cells = cellsFor(photos, box, g, room);
  const out: BookElement[] = [];
  photos.forEach((p, i) => {
    const cell = cells[i];
    if (!cell) return;
    const el = photoEl(c, p, cell, { turn: turnOf(c, i) });
    out.push(el);
    const caption = captionFor(c, p, el.frame, entryId);
    if (caption) out.push(caption);
  });
  return out;
}

/** Cells for up to three photos in a box, the gutter between them and room under each for a caption. */
function cellsFor(photos: readonly AutoPhoto[], box: BookFrame, g: number, room: number): BookFrame[] {
  const n = Math.min(3, photos.length);
  const sideBySide = photos.slice(0, 2).every((p) => !isLandscape(p));
  if (n === 1) return [frameOf(box.x, box.y, box.w, box.h - room)];
  if (n === 2 && sideBySide) {
    const w = (box.w - g) / 2;
    return [frameOf(box.x, box.y, w, box.h - room), frameOf(box.x + w + g, box.y, w, box.h - room)];
  }
  if (n === 2) {
    const h = (box.h - g - room * 2) / 2;
    return [frameOf(box.x, box.y, box.w, h), frameOf(box.x, box.y + h + room + g, box.w, h)];
  }
  const top = (box.h - g - room * 2) * 0.58;
  const low = box.h - g - room * 2 - top;
  const w = (box.w - g) / 2;
  const y2 = box.y + top + room + g;
  return [frameOf(box.x, box.y, box.w, top), frameOf(box.x, y2, w, low), frameOf(box.x + w + g, y2, w, low)];
}

/** Where a column has room left: from under the words set in it (a gutter apart) to its foot. */
interface Foot {
  x: number;
  w: number;
  top: number;
  bottom: number;
}

function footUnder(c: ComposeCtx, words: BookTextElement | null, column: BookFrame): Foot {
  const top = words ? words.frame.y + words.frame.h + c.grid.gutter : column.y;
  return { x: column.x, w: column.w, top, bottom: column.y + column.h };
}

/**
 * An entry's pros and cons as a list in the room under its words, headed in
 * the book's language and set in its look; null when the entry has none or
 * the room is too small. The words are never moved for it.
 */
function listUnder(c: ComposeCtx, entry: AutoEntry, foot: Foot): BookElement | null {
  const items = bookEntryListItems(entry);
  if (!items.length) return null;
  const pros = items.filter((i) => i.tone === 'pro').length;
  const { h } = bookTravelSize('list', c.page, { rows: Math.max(pros, items.length - pros) });
  if (foot.top + h > foot.bottom) return null;
  const labels = { pros: c.travel.labels.pros, cons: c.travel.labels.cons };
  const list = bookTravelList(labels, { id: c.newId('li'), frame: frameOf(foot.x, foot.top, foot.w, h), items });
  return { ...list, font: c.look.heading, color: c.look.ink, accent: c.look.accent };
}

/**
 * The chapter opens: the title block and the story on one page, a photo to
 * the bleed on the other. Without a photo the story runs on across both pages.
 */
export function composeOpener(c: ComposeCtx, entry: AutoEntry, photo: AutoPhoto | null, hand: Hand): Composed {
  const textSide = photo ? other(hand) : 'left';
  const box = liveBox(c, textSide);
  const head = titleBlock(c, entry, box);
  const els: BookElement[] = [...head.els];
  let bottom = box.y + box.h;
  const map = chapterMap(c, entry, box);
  if (map) {
    els.push(map);
    bottom = map.frame.y - c.grid.gutter;
  }
  const storyBox = frameOf(box.x, head.bottom + 2, box.w, bottom - head.bottom - 2);
  const first = storyEl(c, entry, (entry.story ?? '').trim(), storyBox, true);
  if (first.el) els.push(first.el);
  let rest = first.el ? first.rest : (entry.story ?? '').trim();
  let foot = footUnder(c, first.el, storyBox);
  if (photo) {
    els.unshift(photoEl(c, photo, bleedPage(c, hand), { bleed: { side: hand } }));
  } else if (rest) {
    const right = liveBox(c, 'right');
    const next = storyEl(c, entry, rest, right, false);
    if (next.el) {
      els.push(next.el);
      foot = footUnder(c, next.el, right);
    }
    rest = next.el ? next.rest : rest;
  }
  const list = listUnder(c, entry, foot);
  if (list) els.push(list);
  return { elements: els, rest, listed: list !== null };
}

/** The trip a chapter's stop is on: the stop read from its entry, else the one at its place; null for none. */
export function tripOf(stats: JourneyStats, entry: AutoEntry): number | null {
  const own = stats.points.find((p) => p.entryId === entry.id);
  const stop = own ?? stats.points.find((p) => p.lat === entry.lat && p.lng === entry.lng);
  return stop?.tripId ?? null;
}

/**
 * A small map of the chapter's trip at the foot of the title page, when the
 * directives ask for one. A stored map is of the journey or of one trip, so a
 * map of the trip is current when placed and stays the trip's when refreshed;
 * a stop on no trip gets none (the journey's map is the summary's).
 */
function chapterMap(c: ComposeCtx, entry: AutoEntry, box: BookFrame): BookElement | null {
  const stats = c.travel.stats;
  if (!c.directives.travel?.chapterMaps || !stats) return null;
  const tripId = tripOf(stats, entry);
  if (tripId === null) return null;
  const h = box.h * 0.3;
  const frame = frameOf(box.x, box.y + box.h - h, box.w, h);
  const map = bookTravelMap(c.travel, stats, { id: c.newId('mp'), frame, scope: { tripId } });
  const look = { style: c.look.mapStyle, font: c.look.heading, color: c.look.ink, accent: c.look.accent };
  return { ...map, ...look, pinStyle: 'dot' };
}

/**
 * One photo across the whole spread, the title on a scrim at the foot of a
 * page. The detail is kept off the fold; the story goes to the next page.
 */
export function composeHero(c: ComposeCtx, entry: AutoEntry, photo: AutoPhoto, hand: Hand): Composed {
  const { pageWidth: PW, pageHeight: H, bleed: b, margin: m } = c.grid;
  const sx = c.infos.get(photo.photoId)?.salient?.x;
  const focalX = sx !== undefined && (sx < 0.4 || sx > 0.6) ? sx : 0.62;
  const els: BookElement[] = [photoEl(c, photo, bleedSpread(c), { bleed: { side: 'left' }, focalX })];
  const top = H * 0.55;
  const textSide = other(hand);
  els.push(scrimEl(c, frameOf(textSide === 'left' ? -b : PW, top, PW + b, H - top + b)));
  const box = frameOf(pageX(c, textSide) + m, top + m * 0.6, PW - m * 2, H - top - m * 1.6);
  els.push(...titleBlock(c, entry, box, { onScrim: true }).els);
  return { elements: els, rest: (entry.story ?? '').trim() };
}

/**
 * A long story's next page: the words in a narrow column, a photo on the
 * other page when there is one, and the pros and cons of `list` (the
 * chapter's entry, when they have not found a page yet) under the words, or
 * at the head of the column on a photo's page that sets none.
 */
export function composeQuiet(
  c: ComposeCtx,
  entry: AutoEntry | null,
  words: string,
  photo: AutoPhoto | null,
  hand: Hand,
  list: AutoEntry | null = null,
): Composed {
  const textSide = photo ? other(hand) : 'left';
  const box = liveBox(c, textSide);
  const inset = box.w * 0.08;
  const column = frameOf(box.x + inset, box.y, box.w - inset * 2, box.h);
  const els: BookElement[] = [];
  let rest = words;
  let set: BookTextElement | null = null;
  if (entry && words) {
    const story = storyEl(c, entry, words, column, false);
    set = story.el;
    if (set) els.push(set);
    rest = set ? story.rest : words;
  }
  const pros = list ? listUnder(c, list, footUnder(c, set, column)) : null;
  if (pros) els.push(pros);
  if (photo) els.push(...pagePhotos(c, [photo], hand, entry?.id ?? null));
  return { elements: els, rest, listed: pros !== null };
}

/** Two photos: one to the bleed of its page, the other framed on the facing page. */
export function composeDuo(c: ComposeCtx, list: readonly AutoPhoto[], hand: Hand, entryId: number | null): Composed {
  const [a, ...rest] = list;
  const els: BookElement[] = [];
  if (a) els.push(photoEl(c, a, bleedPage(c, hand), { bleed: { side: hand } }));
  els.push(...pagePhotos(c, rest.slice(0, 1), other(hand), entryId));
  return { elements: els, rest: '' };
}

/** Three photos: one to the bleed of its page, two framed on the facing page. */
export function composeTrio(c: ComposeCtx, list: readonly AutoPhoto[], hand: Hand, entryId: number | null): Composed {
  const [a, ...rest] = list;
  const els: BookElement[] = [];
  if (a) els.push(photoEl(c, a, bleedPage(c, hand), { bleed: { side: hand } }));
  els.push(...pagePhotos(c, rest.slice(0, 2), other(hand), entryId));
  return { elements: els, rest: '' };
}

/** Four to six photos, framed on both pages, the fuller page on the leading side. */
export function composeGrid(c: ComposeCtx, list: readonly AutoPhoto[], hand: Hand, entryId: number | null): Composed {
  const lead = Math.min(3, Math.ceil(list.length / 2));
  const els = [
    ...pagePhotos(c, list.slice(0, lead), hand, entryId),
    ...pagePhotos(c, list.slice(lead, lead + 3), other(hand), entryId),
  ];
  return { elements: els, rest: '' };
}

/**
 * A panorama across the top of the spread, the title and the story under it
 * on one page, up to two photos under it on the other.
 */
export function composePano(
  c: ComposeCtx,
  entry: AutoEntry,
  pano: AutoPhoto,
  others: readonly AutoPhoto[],
  hand: Hand,
): Composed {
  const { pageWidth: PW, pageHeight: H, bleed: b, margin: m, gutter: g } = c.grid;
  const band = frameOf(-b, -b, PW * 2 + b * 2, H * 0.5 + b);
  const els: BookElement[] = [photoEl(c, pano, band, { bleed: { side: 'left' }, focalX: 0.35 })];
  const top = H * 0.5 + g;
  const textSide = other(hand);
  const box = frameOf(pageX(c, textSide) + m, top, PW - m * 2, H - m - top);
  const head = titleBlock(c, entry, box);
  els.push(...head.els);
  const storyBox = frameOf(box.x, head.bottom + 2, box.w, box.y + box.h - head.bottom - 2);
  const set = storyEl(c, entry, (entry.story ?? '').trim(), storyBox, true);
  if (set.el) els.push(set.el);
  const list = listUnder(c, entry, footUnder(c, set.el, storyBox));
  if (list) els.push(list);
  const row = others.slice(0, 2);
  const cell = frameOf(pageX(c, hand) + m, top, PW - m * 2, H - m - top);
  const w = row.length > 1 ? (cell.w - g) / 2 : cell.w;
  row.forEach((p, i) => {
    const frame = frameOf(cell.x + i * (w + g), cell.y, w, cell.h);
    els.push(photoEl(c, p, frame, { turn: turnOf(c, i) }));
  });
  return { elements: els, rest: set.el ? set.rest : (entry.story ?? '').trim(), listed: list !== null };
}

/** Whether a panorama can run across the top of the spread at print resolution. */
export function panoFits(c: ComposeCtx, pano: AutoPhoto): boolean {
  const { pageWidth: PW, pageHeight: H, bleed: b } = c.grid;
  return printsAt(c, pano, frameOf(-b, -b, PW * 2 + b * 2, H * 0.5 + b));
}

/** An inner spread holding the composed elements, on the book's paper. */
export function innerSpread(c: ComposeCtx, elements: BookElement[], entryId: number | null): BookSpread {
  return { id: c.newId('sp'), role: 'inner', background: paperBackground(c.look), elements, parked: [], entryId };
}
