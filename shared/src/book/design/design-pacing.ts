import type { AutoEntry, AutoPhoto } from '../auto/auto-types';
import type { BookPhotoInfo } from '../book-ops-core';
import type { BookPageSetup } from '../book.schema';
import { pickBookPhotos, type PhotoPickCandidate } from '../photo-pick';
import type { BookDesignDirectives } from './design-directives.schema';
import { hasBurst, heroWorthy, isPanorama, pickEntriesOf, type BookDesignLeftOut } from './design-photos';

/**
 * The story of the book before its pages: which chapters, how many spreads
 * each gets, and the beat of every spread (opener or hero, a quiet page for a
 * long story, two, three or a grid of photos, a panorama), paced so the book
 * breathes: never one beat three times running, a loud spread followed by a
 * calm one, at most one hero in four spreads.
 */

export const BOOK_DESIGN_BEATS = [
  'cover',
  'first',
  'summary',
  'countries',
  'opener',
  'hero',
  'story',
  'quiet',
  'grid',
  'duo',
  'trio',
  'pano',
  'map',
  'stations',
  'closing',
  'last',
  'back',
] as const;
export type BookDesignBeat = (typeof BOOK_DESIGN_BEATS)[number];

export interface DesignChapter {
  key: string;
  /** The place or day a chapter is of, when it is not one entry's. */
  label: string | null;
  /** The entries it tells, the first one opening it. */
  entries: AutoEntry[];
  photos: AutoPhoto[];
  /** Runs of bare stops, set as a list. */
  stations: boolean;
  burst: boolean;
}

export interface PlannedSpread {
  beat: BookDesignBeat;
  chapter: DesignChapter;
  /** The entry whose words the spread sets, when it sets any. */
  entry: AutoEntry | null;
  photos: AutoPhoto[];
}

const storyChars = (entries: readonly AutoEntry[]) => entries.reduce((n, e) => n + (e.story ?? '').trim().length, 0);

function entryChapter(entry: AutoEntry, photos: AutoPhoto[], pool: readonly PhotoPickCandidate[]): DesignChapter {
  const burst = hasBurst(photos, pool);
  return { key: `e${entry.id}`, label: null, entries: [entry], photos, stations: false, burst };
}

/** A run of bare stops, set as a list. */
const stationsChapter = (run: AutoEntry[]): DesignChapter => ({
  key: `s${run[0]?.id ?? 0}`,
  label: null,
  entries: run,
  photos: [],
  stations: true,
  burst: false,
});

/** Entries with substance each open a chapter; runs of bare ones become a list of stations. */
function byEntry(
  entries: readonly AutoEntry[],
  photosOf: (e: AutoEntry) => AutoPhoto[],
  candidates: readonly PhotoPickCandidate[],
): DesignChapter[] {
  const out: DesignChapter[] = [];
  let run: AutoEntry[] = [];
  const flush = () => {
    if (run.length) out.push(stationsChapter(run));
    run = [];
  };
  for (const entry of entries) {
    const photos = photosOf(entry);
    if (!photos.length && !(entry.story ?? '').trim()) {
      run.push(entry);
      continue;
    }
    flush();
    out.push(entryChapter(entry, photos, candidates));
  }
  flush();
  return out;
}

/** The entries of one date merged into a chapter, in date order. */
function byDay(
  entries: readonly AutoEntry[],
  photosOf: (e: AutoEntry) => AutoPhoto[],
  candidates: readonly PhotoPickCandidate[],
): DesignChapter[] {
  const days = new Map<string, AutoEntry[]>();
  for (const entry of entries) {
    const key = entry.date ?? `undated-${entry.id}`;
    days.set(key, [...(days.get(key) ?? []), entry]);
  }
  return [...days].map(([day, list]): DesignChapter => {
    const photos = list.flatMap(photosOf);
    const substance = photos.length > 0 || storyChars(list) > 0;
    return {
      key: `d${day}`,
      label: day,
      entries: list,
      photos,
      stations: !substance,
      burst: hasBurst(photos, candidates),
    };
  });
}

/**
 * Chapters by place: the photo picker's groups (photos within 250 m of each
 * other), each labelled by its nearest entry. Entries with words and no
 * photos of their own keep a chapter of their own, in date order.
 */
function byPlace(
  entries: readonly AutoEntry[],
  photosOf: (e: AutoEntry) => AutoPhoto[],
  candidates: readonly PhotoPickCandidate[],
): DesignChapter[] {
  const all = new Map(entries.flatMap(photosOf).map((p) => [p.photoId, p]));
  const result = pickBookPhotos(candidates, pickEntriesOf(entries, candidates), { limit: 60 });
  const out: { day: string; chapter: DesignChapter }[] = [];
  const placed = new Set<number>();
  for (const group of result.groups) {
    const photos = group.picks.flatMap((p) => all.get(p.photoId) ?? []).filter((p) => !placed.has(p.photoId));
    if (!photos.length) continue;
    photos.forEach((p) => placed.add(p.photoId));
    const entry = entries.find((e) => e.id === group.entryId);
    const chapter = {
      key: `p${out.length}`,
      label: group.place,
      entries: entry ? [entry] : [],
      photos,
      stations: false,
      burst: hasBurst(photos, candidates),
    };
    out.push({ day: group.day, chapter });
  }
  for (const entry of entries) {
    const rest = photosOf(entry).filter((p) => !placed.has(p.photoId));
    rest.forEach((p) => placed.add(p.photoId));
    const told = out.some((o) => o.chapter.entries.includes(entry));
    if (told && !rest.length) continue;
    if (!rest.length && !(entry.story ?? '').trim()) continue;
    out.push({ day: entry.date ?? '9999', chapter: entryChapter(entry, rest, candidates) });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day)).map((o) => o.chapter);
}

/** The book's chapters, as the directives ask. */
export function buildChapters(
  entries: readonly AutoEntry[],
  byEntryPhotos: ReadonlyMap<number, AutoPhoto[]>,
  directives: BookDesignDirectives,
  candidates: readonly PhotoPickCandidate[],
): DesignChapter[] {
  const photosOf = (e: AutoEntry) => byEntryPhotos.get(e.id) ?? [];
  if (directives.chapters === 'day') return byDay(entries, photosOf, candidates);
  if (directives.chapters === 'place' && candidates.length) return byPlace(entries, photosOf, candidates);
  return byEntry(entries, photosOf, candidates);
}

/** Photos per spread the density aims at, and the most a spread takes. */
const DENSITY = { airy: { aim: 1.5, max: 2 }, balanced: { aim: 3, max: 4 }, rich: { aim: 5, max: 6 } } as const;

/** Characters an opener's text page holds before the story needs a page of its own. */
const OPENER_STORY_CHARS = 1400;

/** The spreads a chapter wants with nothing holding it back. */
export function naturalSpreads(chapter: DesignChapter, directives: BookDesignDirectives, perStations: number): number {
  if (chapter.stations) return Math.max(1, Math.ceil(chapter.entries.length / perStations));
  const aim = DENSITY[directives.density].aim;
  const rest = Math.max(0, chapter.photos.length - 1);
  const words = storyChars(chapter.entries) > OPENER_STORY_CHARS && directives.text?.story !== 'excerpt' ? 1 : 0;
  return 1 + Math.ceil(rest / aim) + words;
}

/** The most spreads a chapter can fill: one photo each, a quiet page for its words. */
const fullest = (chapter: DesignChapter) => (chapter.stations ? 1 : 1 + Math.max(0, chapter.photos.length - 1) + 1);

/**
 * Spreads per chapter for a total, by largest remainder on the chapters'
 * weight (photos and words), every chapter at least one, none more than it
 * can fill.
 */
export function shareSpreads(chapters: readonly DesignChapter[], natural: readonly number[], total: number): number[] {
  const want = natural.reduce((a, b) => a + b, 0);
  if (total === want) return [...natural];
  const weight = chapters.map((c) => c.photos.length + storyChars(c.entries) / 600 + 1);
  const sum = weight.reduce((a, b) => a + b, 0) || 1;
  const floor = chapters.map(() => 1);
  const room = Math.max(0, total - chapters.length);
  const raw = weight.map((w) => (room * w) / sum);
  const out = raw.map((r, i) => Math.min((floor[i] ?? 1) + Math.floor(r), fullest(chapters[i] as DesignChapter)));
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let pass = 0; left > 0 && pass < 4; pass++) {
    for (const { i } of order) {
      const chapter = chapters[i] as DesignChapter;
      if (left <= 0) break;
      if ((out[i] ?? 0) >= fullest(chapter)) continue;
      out[i] = (out[i] ?? 0) + 1;
      left--;
    }
  }
  return out;
}

/** Merge the two smallest neighbouring chapters until the book has no more chapters than spreads. */
export function fitChapters(chapters: readonly DesignChapter[], total: number): DesignChapter[] {
  const list = [...chapters];
  while (list.length > Math.max(1, total)) {
    let best = 0;
    let bestSize = Infinity;
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i] as DesignChapter;
      const b = list[i + 1] as DesignChapter;
      const size = a.photos.length + b.photos.length + a.entries.length + b.entries.length;
      if (size < bestSize) {
        best = i;
        bestSize = size;
      }
    }
    const a = list[best] as DesignChapter;
    const b = list[best + 1] as DesignChapter;
    const merged = {
      key: `${a.key}+${b.key}`,
      label: a.label,
      entries: [...a.entries, ...b.entries],
      photos: [...a.photos, ...b.photos],
      stations: a.stations && b.stations,
      burst: a.burst || b.burst,
    };
    list.splice(best, 2, merged);
  }
  return list;
}

interface Rhythm {
  beats: BookDesignBeat[];
  lastHero: number;
}

const LOUD = new Set<BookDesignBeat>(['hero', 'pano']);

/** Whether a loud beat may come now: the spread before it was calm, and no hero in the last three. */
function loudAllowed(rhythm: Rhythm, beat: BookDesignBeat): boolean {
  const last = rhythm.beats[rhythm.beats.length - 1];
  if (last && (LOUD.has(last) || last === 'grid')) return false;
  return beat !== 'hero' || rhythm.beats.length - rhythm.lastHero >= 4;
}

/** The beat a run of photos makes on its own spread. */
function photoBeat(count: number): BookDesignBeat {
  if (count <= 1) return 'quiet';
  if (count === 2) return 'duo';
  if (count === 3) return 'trio';
  return 'grid';
}

interface PlanInput {
  directives: BookDesignDirectives;
  page: BookPageSetup;
  infos: ReadonlyMap<number, BookPhotoInfo>;
}

/** The chapter's opening spread: a hero when it has a photo for one and the rhythm allows, else the opener. */
function opening(chapter: DesignChapter, photos: AutoPhoto[], rhythm: Rhythm, input: PlanInput): PlannedSpread {
  const entry = chapter.entries[0] ?? null;
  const hero = photos.find((p) => heroWorthy(p, input.infos.get(p.photoId), input.page));
  if (entry && hero && loudAllowed(rhythm, 'hero')) {
    photos.splice(photos.indexOf(hero), 1);
    return { beat: 'hero', chapter, entry, photos: [hero] };
  }
  const pano = photos[0] && isPanorama(photos[0]) && loudAllowed(rhythm, 'pano') ? photos[0] : null;
  if (entry && pano) return { beat: 'pano', chapter, entry, photos: photos.splice(0, 3) };
  const first = photos.shift();
  return { beat: first ? 'opener' : 'story', chapter, entry, photos: first ? [first] : [] };
}

/**
 * The spreads of one chapter for its share of the budget: the opening, a
 * quiet page when the words run long, then the photos spread evenly over
 * what is left, at most the density's maximum a spread; photos that find no
 * spread are left out and said.
 */
export function planChapter(
  chapter: DesignChapter,
  spreads: number,
  rhythm: Rhythm,
  input: PlanInput,
  leftOut: BookDesignLeftOut[],
): PlannedSpread[] {
  if (chapter.stations) return [{ beat: 'stations', chapter, entry: null, photos: [] }];
  const photos = [...chapter.photos];
  const out: PlannedSpread[] = [];
  const push = (s: PlannedSpread) => {
    out.push(s);
    if (s.beat === 'hero') rhythm.lastHero = rhythm.beats.length;
    rhythm.beats.push(s.beat);
  };
  push(opening(chapter, photos, rhythm, input));
  const long = storyChars(chapter.entries.slice(0, 1)) > OPENER_STORY_CHARS || out[0]?.beat === 'hero';
  const wantsWords = long && (input.directives.text?.story ?? 'full') === 'full';
  let left = spreads - 1;
  if (wantsWords && left > 0 && storyChars(chapter.entries.slice(0, 1)) > 0) {
    push({ beat: 'quiet', chapter, entry: chapter.entries[0] ?? null, photos: photos.splice(0, left > 1 ? 0 : 1) });
    left--;
  }
  const max = DENSITY[input.directives.density].max;
  while (left > 0 && photos.length) {
    const count = Math.min(max, Math.ceil(photos.length / left));
    let take = count >= 6 && !loudAllowed(rhythm, 'grid') ? 5 : count;
    const prev = rhythm.beats.slice(-2);
    if (take > 1 && prev.length === 2 && prev.every((b) => b === photoBeat(take))) take = Math.max(1, take - 1);
    push({ beat: photoBeat(take), chapter, entry: null, photos: photos.splice(0, take) });
    left--;
  }
  for (const p of photos) leftOut.push({ photoId: p.photoId, reason: 'page_budget' });
  return out;
}

export function newRhythm(): Rhythm {
  return { beats: [], lastHero: -10 };
}
