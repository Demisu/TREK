import { bookSpreadSchema, type BookDocument, type BookSpread } from './book.schema';

import type { z } from 'zod';

/**
 * What the book edit engine answers with, and the pieces its page and spread
 * operations share. A refusal is a value, never an exception: nothing thrown
 * in here leaves `caught`.
 */

export const BOOK_OP_ERROR_CODES = [
  'invalid_op',
  'spread_not_found',
  'element_not_found',
  'wrong_kind',
  'locked',
  'protected_spread',
  'index_out_of_range',
  'photo_not_in_gallery',
  'entry_not_found',
  'slot_not_found',
  'layout_not_found',
  'layout_role',
  'too_many_elements',
  'too_many_spreads',
  'parked_full',
  'empty_frame',
  'caption_missing',
  'text_required',
  'no_cover',
] as const;
export type BookOpErrorCode = (typeof BOOK_OP_ERROR_CODES)[number];

export interface BookOpError {
  code: BookOpErrorCode;
  /** One sentence a model can act on. */
  message: string;
  /** Which operation of the call, from 0; null when the call as a whole was refused. */
  opIndex: number | null;
  elementId?: string;
}

/** What the engine knows about a gallery photo. */
export interface BookPhotoInfo {
  photoId: number;
  /** The original's size in pixels when known. Never a thumbnail's: the print check reads it. */
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  /** A photo by another contributor, drawn as an empty frame in a page image. */
  hidden?: boolean;
}

/** The journey's words a text can be bound to. */
export interface BookJourneyWords {
  title: string;
  subtitle?: string | null;
  entries?: readonly { id: number; title?: string | null; story?: string | null; location?: string | null }[];
}

export interface BookOpsContext {
  /** The journey gallery. When given, a photo an operation brings in must be in it. */
  photos?: readonly BookPhotoInfo[];
  journey?: BookJourneyWords;
  /** Mints element and spread ids; tests pass a counter. */
  newId?: (prefix: string) => string;
}

/**
 * `created` names the elements and pages a call made. `dropped` names the
 * elements whose content was on the page or parked with it before and is in
 * neither place after (`droppedIds`): deleted by a `remove` with `park: false`,
 * or left out by a layout, which carries photos and texts and drops shapes,
 * maps, badges, stats, lists and icons, exactly as the Studio's layout picker
 * does. The operations on whole pages (add, move, delete, restore) answer an
 * empty list; a deleted page is named in `spreadIds`.
 */
export type BookEditResult =
  | { ok: true; doc: BookDocument; spreadIds: string[]; created: string[]; dropped: string[] }
  | { ok: false; error: BookOpError };

/** A refusal on its way out of an operation, to `caught`. */
class BookOpFailure extends Error {
  constructor(readonly error: BookOpError) {
    super(error.message);
  }
}

export const failOp = (code: BookOpErrorCode, message: string, opIndex: number | null, elementId?: string): Error =>
  new BookOpFailure({ code, message, opIndex, ...(elementId ? { elementId } : {}) });

/** Run `fn`, turning a refusal into a result. Anything else is a bug and is not swallowed. */
export function caught(fn: () => BookEditResult): BookEditResult {
  try {
    return fn();
  } catch (e) {
    if (e instanceof BookOpFailure) return { ok: false, error: e.error };
    throw e;
  }
}

/** The first issue of a failed parse, as a refusal; `opAt` is where the operation's index sits in the path. */
export function invalidOp(error: z.ZodError, opAt: number | null): BookOpError {
  const issue = error.issues[0];
  const path = issue?.path ?? [];
  const at = path.length ? ` at ${path.map(String).join('.')}` : '';
  const index = opAt === null ? undefined : path[opAt];
  return {
    code: 'invalid_op',
    message: `${issue?.message ?? 'invalid operation'}${at}`,
    opIndex: typeof index === 'number' ? index : null,
  };
}

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Ids present in `after` and in no spread of `before`: the elements and pages a call made. */
export function createdIds(before: readonly BookSpread[], after: readonly BookSpread[]): string[] {
  const ids = (list: readonly BookSpread[]) =>
    list.flatMap((s) => [s.id, ...[...s.elements, ...s.parked].map((e) => e.id)]);
  const old = new Set(ids(before));
  return ids(after).filter((id) => !old.has(id));
}

/**
 * Ids of elements in `before` whose content no spread of `after` holds any
 * more, placed or parked: kept by id, or for a photo by its picture and for a
 * text by its words, since a layout carries those into new frames with new
 * ids. An empty frame or a blank text carries nothing and is never named.
 */
export function droppedIds(before: readonly BookSpread[], after: readonly BookSpread[]): string[] {
  const all = (list: readonly BookSpread[]) => list.flatMap((s) => [...s.elements, ...s.parked]);
  const kept = all(after);
  const ids = new Set(kept.map((e) => e.id));
  const photos = new Set(kept.flatMap((e) => (e.kind === 'photo' && e.photoId != null ? [e.photoId] : [])));
  const words = new Set(kept.flatMap((e) => (e.kind === 'text' ? [e.text] : [])));
  return all(before)
    .filter((e) => {
      if (ids.has(e.id)) return false;
      if (e.kind === 'photo') return e.photoId != null && !photos.has(e.photoId);
      if (e.kind === 'text') return e.text.trim() !== '' && !words.has(e.text);
      return true;
    })
    .map((e) => e.id);
}

/**
 * A page the engine is about to hand back, checked against the document's own
 * schema, so a call can never answer with a page the save route would refuse.
 * The page itself goes back as it was built; the parse only judges it.
 */
export function checkedSpread(spread: BookSpread, opIndex: number | null): BookSpread {
  const parsed = bookSpreadSchema.safeParse(spread);
  if (parsed.success) return spread;
  const issue = parsed.error.issues[0];
  const at = issue?.path.length ? ` at ${issue.path.map(String).join('.')}` : '';
  throw failOp('invalid_op', `the page would not be valid: ${issue?.message ?? 'invalid page'}${at}`, opIndex);
}

/** A journey entry an operation refers to, checked against the journey when the context lists its entries. */
export function journeyEntry(entryId: number, ctx: BookOpsContext, opIndex: number | null): void {
  const entries = ctx.journey?.entries;
  if (entries && !entries.some((e) => e.id === entryId)) {
    throw failOp('entry_not_found', `entry ${entryId} is not in this journey`, opIndex);
  }
}

/** A photo an operation brings in, checked against the gallery when the context has one. */
export function galleryPhoto(photoId: number, ctx: BookOpsContext, opIndex: number | null): BookPhotoInfo | undefined {
  if (!ctx.photos) return undefined;
  const info = ctx.photos.find((p) => p.photoId === photoId);
  if (!info) throw failOp('photo_not_in_gallery', `photo ${photoId} is not in this journey's gallery`, opIndex);
  return info;
}
