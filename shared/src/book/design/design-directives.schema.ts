import { idSchema } from '../../common/primitives.schema';
import { bookCoverTemplateIdSchema } from '../book-ops.schema';
import { BOOK_FONTS_IDS, BOOK_METRICS, MAX_BOOK_TITLE, bookPageSetupSchema } from '../book.schema';

import { z } from 'zod';

/**
 * What the person wants of a whole-book design, as the assistant's
 * `design_book` takes it. The model maps free words ("calm, lots of white",
 * "like a magazine", "only Portugal") to these fields; the engine takes no free
 * text it would have to interpret. Every field is optional and bounded.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pageCount = z.number().int().min(1).max(146);
const ids300 = z.array(idSchema).max(300);
const ids200 = z.array(idSchema).max(200);

export const BOOK_DESIGN_STYLES = ['classic', 'minimal', 'editorial', 'journal', 'bold', 'scrapbook'] as const;
export type BookDesignStyle = (typeof BOOK_DESIGN_STYLES)[number];

export const bookDesignDirectivesSchema = z.strictObject({
  style: z.enum(BOOK_DESIGN_STYLES).default('classic'),
  /** Photos per spread: airy 1 to 2, balanced 2 to 4, rich 4 to 6. */
  density: z.enum(['airy', 'balanced', 'rich']).default('balanced'),
  /** Inner spreads, the covers and the first and last page not counted. */
  pages: z.strictObject({ min: pageCount.optional(), max: pageCount.optional() }).optional(),
  scope: z.strictObject({ entryIds: ids200.optional(), from: isoDate.optional(), to: isoDate.optional() }).optional(),
  chapters: z.enum(['entry', 'day', 'place']).default('entry'),
  photos: z
    .strictObject({
      /** best: the photo-pick groups' best, near duplicates and blurry ones left out; all: every photo. */
      pick: z.enum(['best', 'all']).default('best'),
      perChapterMax: z.number().int().min(1).max(24).optional(),
      include: ids300.optional(),
      exclude: ids300.optional(),
      coverPhotoId: idSchema.optional(),
    })
    .optional(),
  cover: z
    .strictObject({
      template: bookCoverTemplateIdSchema.optional(),
      title: z.string().max(MAX_BOOK_TITLE).optional(),
      subtitle: z.string().max(MAX_BOOK_TITLE).optional(),
    })
    .optional(),
  type: z
    .strictObject({
      heading: z.enum(BOOK_FONTS_IDS).optional(),
      body: z.enum(BOOK_FONTS_IDS).optional(),
      scale: z.number().min(0.8).max(1.3).optional(),
    })
    .optional(),
  /** The book's colours: taken from the photos, ink only, or given; the style's own when absent. */
  palette: z.union([z.enum(['from_photos', 'ink']), z.strictObject({ paper: hex, ink: hex, accent: hex })]).optional(),
  text: z
    .strictObject({
      captions: z.enum(['none', 'entry', 'photo']).default('entry'),
      story: z.enum(['full', 'excerpt', 'none']).default('full'),
      excerptChars: z.number().int().min(80).max(1200).optional(),
    })
    .optional(),
  travel: z
    .strictObject({
      summary: z.boolean().default(true),
      countries: z.boolean().default(true),
      chapterMaps: z.boolean().default(false),
      dayBadges: z.boolean().default(true),
      metrics: z.array(z.enum(BOOK_METRICS)).min(1).max(7).optional(),
    })
    .optional(),
  /** What stays: pages holding a locked element, also hand-made pages, or nothing (a fresh book). */
  keep: z.enum(['nothing', 'locked', 'edited']).default('locked'),
  /** Only honoured for a blank or a new book. */
  preset: bookPageSetupSchema.shape.preset.unwrap().optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
});
export type BookDesignDirectives = z.infer<typeof bookDesignDirectivesSchema>;
export type BookDesignDirectivesInput = z.input<typeof bookDesignDirectivesSchema>;
