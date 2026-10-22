import { idSchema } from '../common/primitives.schema';
import { BOOK_GRIDS } from './book-grids';
import { BOOK_COVER_TEMPLATES, BOOK_TEMPLATES } from './book-layouts';
import {
  MAX_BOOK_TITLE,
  MAX_SPREADS,
  MAX_SPREAD_ELEMENTS,
  bookPageSetupSchema,
  bookPhotoElementSchema,
  bookSpreadSchema,
  bookTextElementSchema,
} from './book.schema';

import { z } from 'zod';

/**
 * Edits to a book, as the assistant's book tools take them and as a chat card
 * carries them.
 *
 * One page per call, a bounded list of operations on it, every field bounded,
 * nothing open: the tool arguments are what a model sends, and a shape that
 * accepts any object accepts whatever it imagines. The fields come from the
 * document's own schema (book.schema.ts) with its defaults taken off, so an
 * operation that does not name a field leaves that field as it is rather than
 * resetting it.
 *
 * Units are the document's: millimetres from the top-left of the spread, a
 * double spread twice the page width with the fold at one page width.
 */

/** Ids as the document has them (`sp-...`, `p-...`): never invented by the model, bounded. */
export const bookSpreadIdSchema = z.string().regex(/^[\w-]{1,40}$/);
export const bookElementIdSchema = z.string().regex(/^[\w-]{1,40}$/);

export const BOOK_OP_LIMITS = {
  /** Operations in one `edit_book_page` call. */
  opsPerCall: 20,
  /** Pages one call adds or deletes. */
  pagesPerCall: 10,
  /** Words one text operation sets. */
  text: 2000,
  /** Words one caption sets. */
  caption: 300,
  /** Elements one `remove` takes off a page. */
  removePerOp: 30,
  /** Findings one answer carries. */
  findings: 40,
} as const;

const idsOf = (list: readonly { id: string }[]) => list.map((t) => t.id) as [string, ...string[]];

/** The spread layouts, by id. */
export const bookTemplateIdSchema = z.enum(idsOf(BOOK_TEMPLATES));
/** The single-page (cover and back) layouts, by id. */
export const bookCoverTemplateIdSchema = z.enum(idsOf(BOOK_COVER_TEMPLATES));
/** Either set: which one fits is the page's question, answered when the operation runs. */
export const bookAnyTemplateIdSchema = z.enum([...idsOf(BOOK_TEMPLATES), ...idsOf(BOOK_COVER_TEMPLATES)]);
export const bookGridIdSchema = z.enum(idsOf(BOOK_GRIDS));

const photo = bookPhotoElementSchema.shape;
const text = bookTextElementSchema.shape;

/** A position in millimetres, inside the bounds the document takes. */
const mmIn = z.number().finite().min(-10000).max(10000);
/** A size the document keeps after rounding to hundredths: anything under that rounds to 0, which no frame may be. */
const sizeIn = z.number().finite().min(0.01).max(10000);
const unit01 = z.number().min(0).max(1);

const has = (value: object, keys: readonly string[]) =>
  keys.some((k) => (value as Record<string, unknown>)[k] !== undefined);

const LOOK_KEYS = ['fit', 'focalX', 'focalY', 'mask', 'frameStyle', 'filter', 'radius'] as const;
const FRAME_KEYS = ['x', 'y', 'w', 'h', 'rotation'] as const;
const LAYOUT_KEYS = ['template', 'grid', 'saved'] as const;

/**
 * An entry's words need the entry and a photo's caption needs the photo: a
 * binding that names neither reads nothing, and the ids it names are checked
 * against the journey when the engine runs.
 */
function bindingNamesItsSource(b: { source: string; entryId?: number; photoId?: number } | null | undefined): boolean {
  if (!b) return true;
  if (b.source.startsWith('entry.') && b.entryId === undefined) return false;
  return b.source !== 'photo.caption' || b.photoId !== undefined;
}

/** One edit of one page. Discriminated on `op`. */
export const bookPageOpSchema = z.discriminatedUnion('op', [
  /** Lay the page out again: a built-in layout, a photo grid, or one of the book's own layouts. */
  z
    .strictObject({
      op: z.literal('layout'),
      template: bookAnyTemplateIdSchema.optional(),
      grid: bookGridIdSchema.optional(),
      saved: z.string().min(1).max(40).optional(),
    })
    .refine((v) => LAYOUT_KEYS.filter((k) => v[k] !== undefined).length === 1, {
      message: 'give exactly one of template, grid or saved',
    }),
  /** Put a gallery photo into a frame: by element id, by its place among the page's frames, or a new frame. */
  z.strictObject({
    op: z.literal('place_photo'),
    photoId: idSchema,
    target: z.union([
      z.strictObject({ elementId: bookElementIdSchema }),
      z.strictObject({
        slot: z
          .number()
          .int()
          .min(0)
          .max(MAX_SPREAD_ELEMENTS - 1),
      }),
      z.literal('new'),
    ]),
    fit: photo.fit.unwrap().optional(),
    focalX: unit01.optional(),
    focalY: unit01.optional(),
  }),
  /** How a placed photo looks: the crop (fit and focal point) and the look around it. */
  z
    .strictObject({
      op: z.literal('photo_look'),
      elementId: bookElementIdSchema,
      fit: photo.fit.unwrap().optional(),
      focalX: unit01.optional(),
      focalY: unit01.optional(),
      mask: photo.mask.unwrap().optional(),
      frameStyle: photo.frameStyle.unwrap().optional(),
      filter: photo.filter.unwrap().optional(),
      radius: z.number().finite().min(0).max(500).optional(),
    })
    .refine((v) => has(v, LOOK_KEYS), { message: 'name at least one of the look fields' }),
  /** Exchange the pictures of two frames; the frames stay where they are. */
  z
    .strictObject({ op: z.literal('swap_photos'), a: bookElementIdSchema, b: bookElementIdSchema })
    .refine((v) => v.a !== v.b, { message: 'a and b must be two different frames' }),
  /**
   * Set or create a text. Addressed by element id, or by the role it plays on the
   * page (the largest type is the heading, the longest of the rest the body, the
   * next the meta line); a role the page has no text for creates one.
   */
  z
    .strictObject({
      op: z.literal('text'),
      elementId: bookElementIdSchema.optional(),
      role: z.enum(['heading', 'body', 'meta']).optional(),
      text: z.string().max(BOOK_OP_LIMITS.text).optional(),
      binding: text.binding.unwrap().optional(),
      font: text.font.unwrap().optional(),
      size: text.size.unwrap().optional(),
      weight: text.weight.unwrap().optional(),
      align: text.align.unwrap().optional(),
      color: text.color.unwrap().optional(),
    })
    .refine((v) => v.elementId !== undefined || v.role !== undefined, { message: 'name an elementId or a role' })
    .refine((v) => bindingNamesItsSource(v.binding), {
      message: 'an entry binding needs its entryId and a photo.caption binding its photoId',
      path: ['binding'],
    }),
  /** A caption under a photo, bound to the photo's caption in the journey unless words are given. */
  z.strictObject({
    op: z.literal('caption'),
    photoElementId: bookElementIdSchema,
    text: z.string().max(BOOK_OP_LIMITS.caption).optional(),
  }),
  /** Move, resize or turn an element. */
  z
    .strictObject({
      op: z.literal('frame'),
      elementId: bookElementIdSchema,
      x: mmIn.optional(),
      y: mmIn.optional(),
      w: sizeIn.optional(),
      h: sizeIn.optional(),
      rotation: z.number().finite().min(-360).max(360).optional(),
    })
    .refine((v) => has(v, FRAME_KEYS), { message: 'name at least one of x, y, w, h or rotation' }),
  /** Take elements off the page: parked by default (kept with the page, back on the next layout), or deleted. */
  z.strictObject({
    op: z.literal('remove'),
    elementIds: z.array(bookElementIdSchema).min(1).max(BOOK_OP_LIMITS.removePerOp),
    park: z.boolean().default(true),
  }),
  /** The page colour; null is the paper. */
  z.strictObject({ op: z.literal('background'), color: bookSpreadSchema.shape.background.unwrap() }),
]);
export type BookPageOp = z.infer<typeof bookPageOpSchema>;
export type BookPageOpInput = z.input<typeof bookPageOpSchema>;

/*
 * ── Tool arguments ──────────────────────────────────────────────────────
 *
 * Plain shapes, so a `*.mcp.ts` spreads them after its own `journeyId`
 * (`inputSchema: { journeyId: idSchema, ...editBookPageArgs }`) and holds no
 * `z.` of its own. Each also exists as a strict `*RequestSchema`, which is what
 * `contracts:open` measures: none of them may hold an open shape.
 */

const returnPrevious = z.boolean().optional();

export const editBookPageArgs = {
  spreadId: bookSpreadIdSchema,
  ops: z.array(bookPageOpSchema).min(1).max(BOOK_OP_LIMITS.opsPerCall),
  returnPrevious,
};
export const addBookPagesArgs = {
  /** The new pages go after this one, kept inside the covers. */
  afterSpreadId: bookSpreadIdSchema,
  count: z.number().int().min(1).max(BOOK_OP_LIMITS.pagesPerCall).optional(),
  template: bookTemplateIdSchema.optional(),
  entryId: idSchema.optional(),
};
export const moveBookPageArgs = {
  spreadId: bookSpreadIdSchema,
  toIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_SPREADS - 1),
};
export const deleteBookPagesArgs = {
  spreadIds: z.array(bookSpreadIdSchema).min(1).max(BOOK_OP_LIMITS.pagesPerCall),
  returnPrevious,
};
export const setBookCoverArgs = {
  template: bookCoverTemplateIdSchema.optional(),
  photoId: idSchema.optional(),
  title: z.string().max(MAX_BOOK_TITLE).optional(),
  subtitle: z.string().max(MAX_BOOK_TITLE).optional(),
  returnPrevious,
};
export const createBookArgs = {
  title: z.string().max(MAX_BOOK_TITLE).optional(),
  preset: bookPageSetupSchema.shape.preset.unwrap().optional(),
};
export const restoreBookPageArgs = {
  spread: bookSpreadSchema,
  /** Where it goes back when it is gone; a page still in the book is replaced where it is. */
  index: z
    .number()
    .int()
    .min(0)
    .max(MAX_SPREADS - 1),
  expectedVersion: z.number().int().nonnegative(),
};
export const describeBookPageArgs = { spreadId: bookSpreadIdSchema };
export const listBookLayoutsArgs = { role: z.enum(['inner', 'single']).optional() };
export const suggestBookPhotosArgs = {
  entryId: idSchema.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  purpose: z.enum(['page', 'cover']).optional(),
  limit: z.number().int().min(1).max(60).optional(),
};

export const editBookPageRequestSchema = z.strictObject(editBookPageArgs);
export const addBookPagesRequestSchema = z.strictObject(addBookPagesArgs);
export const moveBookPageRequestSchema = z.strictObject(moveBookPageArgs);
export const deleteBookPagesRequestSchema = z.strictObject(deleteBookPagesArgs);
export const setBookCoverRequestSchema = z.strictObject(setBookCoverArgs);
export const createBookRequestSchema = z.strictObject(createBookArgs);
export const restoreBookPageRequestSchema = z.strictObject(restoreBookPageArgs);
export const describeBookPageRequestSchema = z.strictObject(describeBookPageArgs);
export const listBookLayoutsRequestSchema = z.strictObject(listBookLayoutsArgs);
export const suggestBookPhotosRequestSchema = z.strictObject(suggestBookPhotosArgs);

export type EditBookPageRequest = z.infer<typeof editBookPageRequestSchema>;
export type AddBookPagesRequest = z.infer<typeof addBookPagesRequestSchema>;
export type MoveBookPageRequest = z.infer<typeof moveBookPageRequestSchema>;
export type DeleteBookPagesRequest = z.infer<typeof deleteBookPagesRequestSchema>;
export type SetBookCoverRequest = z.infer<typeof setBookCoverRequestSchema>;
export type CreateBookRequest = z.infer<typeof createBookRequestSchema>;
export type RestoreBookPageRequest = z.infer<typeof restoreBookPageRequestSchema>;
export type SuggestBookPhotosRequest = z.infer<typeof suggestBookPhotosRequestSchema>;

/*
 * ── Answers ─────────────────────────────────────────────────────────────
 *
 * What the tools answer with, for the server's tests and the assistant's card
 * builders. A summary of a page rather than the page: a book reaches megabytes
 * and a tool answer is cut at 40 000 characters.
 */

export const BOOK_FINDING_CODES = [
  'overlap',
  'fold',
  'trim',
  'empty_frame',
  'low_dpi',
  'focal_cut',
  'text_overflow',
  'parked',
  'hidden_photo',
  'not_in_gallery',
] as const;
export type BookFindingCode = (typeof BOOK_FINDING_CODES)[number];

/** `severe` is what the assistant fixes before it proposes; `warn` it should mention; `info` is context. */
export const bookFindingSchema = z.object({
  code: z.enum(BOOK_FINDING_CODES),
  severity: z.enum(['severe', 'warn', 'info']),
  elementIds: z.array(z.string()).max(8),
  message: z.string().max(300),
});
export type BookFinding = z.infer<typeof bookFindingSchema>;

/** One page as `get_book` lists it and a write answers with it. */
export const bookSpreadSummarySchema = z.object({
  index: z.number().int().nonnegative(),
  id: z.string(),
  role: bookSpreadSchema.shape.role.unwrap(),
  entryId: z.number().int().nullable(),
  background: z.string().nullable(),
  photoIds: z.array(z.number().int()),
  /** The first 60 characters of each text, in paint order. */
  texts: z.array(z.string().max(60)),
  elements: z.number().int().nonnegative(),
  emptyFrames: z.number().int().nonnegative(),
  parked: z.number().int().nonnegative(),
});
export type BookSpreadSummary = z.infer<typeof bookSpreadSummarySchema>;

/** `get_book`: the book without its document. */
export const bookOverviewSchema = z.object({
  exists: z.boolean(),
  version: z.number().int().nonnegative().nullable(),
  title: z.string(),
  page: bookPageSetupSchema.pick({ preset: true, pageWidth: true, pageHeight: true, bleed: true, safe: true }),
  spreads: z.array(bookSpreadSummarySchema),
  layouts: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(['inner', 'single']) })),
});
export type BookOverview = z.infer<typeof bookOverviewSchema>;

/** One element as `describe_book_page` lists it, back to front. */
export const bookElementSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  frame: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  rotation: z.number(),
  locked: z.boolean(),
  photoId: z.number().int().nullable().optional(),
  text: z.string().max(80).optional(),
  binding: z.string().optional(),
});
export type BookElementSummary = z.infer<typeof bookElementSummarySchema>;

/** `describe_book_page`: the words a model without eyes checks a page by. */
export const bookPageDescriptionSchema = z.object({
  spreadId: z.string(),
  index: z.number().int().nonnegative(),
  role: bookSpreadSchema.shape.role.unwrap(),
  text: z.string(),
  findings: z.array(bookFindingSchema).max(BOOK_OP_LIMITS.findings),
  elements: z.array(bookElementSummarySchema),
});
export type BookPageDescription = z.infer<typeof bookPageDescriptionSchema>;

/** A page as it was before a write, for the assistant's undo. */
export const bookPreviousSpreadSchema = z.object({
  index: z.number().int().nonnegative(),
  spread: bookSpreadSchema,
});

/** What a book write answers. `previous_spreads` only when the call asked with `returnPrevious`. */
export const bookWriteResultSchema = z.object({
  version: z.number().int().nonnegative(),
  spread_ids: z.array(z.string()),
  pages: z.array(bookSpreadSummarySchema),
  findings: z.array(bookFindingSchema).max(BOOK_OP_LIMITS.findings),
  previous_spreads: z.array(bookPreviousSpreadSchema).optional(),
});
export type BookWriteResult = z.infer<typeof bookWriteResultSchema>;
