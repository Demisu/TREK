import { JourneyEntries } from '../../db/entities/JourneyEntries.entity';
import { JourneyPhotos } from '../../db/entities/JourneyPhotos.entity';
import type { JourneyEntriesRepository } from '../../db/repositories/JourneyEntries.repository';
import type { JourneyPhotosRepository } from '../../db/repositories/JourneyPhotos.repository';
import { DomainError } from '../common/domain-error';
import { JourneyBookService } from './journey-book.service';
import { JourneyDomainService } from './journey-domain.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import {
  addBookPages,
  applyBookOps,
  blankBook,
  BOOK_OP_LIMITS,
  bookPageSetupSchema,
  deleteBookPages,
  describeSpread,
  listBookLayouts,
  moveBookPage,
  restoreBookPage,
  setBookCover,
  spreadFindings,
  summarizeBook,
  summarizeSpread,
  type AddBookPagesRequest,
  type BookDocument,
  type BookEditResult,
  type BookOpError,
  type BookOpsContext,
  type BookOverview,
  type BookPageDescription,
  type BookPreviousSpread,
  type BookSpreadSummary,
  type BookWriteResult,
  type CreateBookRequest,
  type DeleteBookPagesRequest,
  type EditBookPageRequest,
  type MoveBookPageRequest,
  type RestoreBookPageRequest,
  type SetBookCoverRequest,
} from '@trek/shared';

/** A book write's answer, in the shared result's shape. */
export type BookWriteAnswer = BookWriteResult;

/** One write as the engine runs it: the stored document (null without a book) and the journey in, a result out. */
type BookChange = (doc: BookDocument | null, ctx: BookOpsContext) => BookEditResult;

/** A successful engine result. */
type BookMade = Extract<BookEditResult, { ok: true }>;

/** What of the journey a binding reads. */
interface JourneyWords {
  title: string;
  subtitle?: string | null;
}

/** How one write answers beyond the pages it touched. */
interface WriteOptions {
  returnPrevious?: boolean;
  expectedVersion?: number;
  /** More of the answer, from the book as it was before the write. */
  extra?: (before: BookDocument | null) => Partial<BookWriteResult>;
}

/**
 * The assistant's and every MCP client's way to read and change a TREK Studio
 * book (journey-book.mcp.ts), one page at a time.
 *
 * The edits themselves are the shared engine (shared/src/book/), pure and the
 * same one the Studio previews and a chat card draws with. What needs I/O
 * stays here: the journey's access, its gallery and entries for the engine to
 * check ids against, and the answer a model reads. Every write goes through
 * `JourneyBookService.editBook`, so it is one transaction against the stored
 * version, refused whole when an operation is refused, and announced after the
 * commit like a save from the Studio.
 *
 * The rights are the save route's: any member reads, the owner and editors
 * write, a viewer is refused (403), an outsider is told the journey is not
 * there (404). Unlike the save route a tool may only bring in photos of the
 * journey's own gallery: the REST save stays as it is.
 */
@Injectable()
export class JourneyBookEditService {
  constructor(
    private readonly books: JourneyBookService,
    private readonly journey: JourneyDomainService,
    @InjectRepository(JourneyPhotos) private readonly photosRepo: JourneyPhotosRepository,
    @InjectRepository(JourneyEntries) private readonly entriesRepo: JourneyEntriesRepository,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  /** `get_book`: the book without its document; a journey without one answers `exists: false`. */
  async overview(journeyId: number, userId: number): Promise<BookOverview> {
    const { record } = await this.readable(journeyId, userId);
    return summarizeBook(record?.document ?? null, record?.version ?? null);
  }

  /** `describe_book_page`: one page in words, with its findings and its elements. */
  async describePage(journeyId: number, userId: number, spreadId: string): Promise<BookPageDescription> {
    const { journey, record } = await this.readable(journeyId, userId);
    if (!record) throw noBook();
    const ctx = await this.context(journeyId, journey);
    const described = describeSpread(record.document, spreadId, ctx.photos);
    if (!described) throw pageNotFound(spreadId);
    return described;
  }

  /** `list_book_layouts`: the layouts a page can take, with what each does to what is on it. */
  async layouts(journeyId: number, userId: number, role?: 'inner' | 'single') {
    const { record } = await this.readable(journeyId, userId);
    const doc = record?.document ?? null;
    return listBookLayouts(doc, doc?.page ?? bookPageSetupSchema.parse({}), role);
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  /** A blank book (cover, first page, one spread, last page, back) for a journey that has none. */
  async createBook(journeyId: number, userId: number, args: CreateBookRequest): Promise<BookWriteAnswer> {
    return this.write(journeyId, userId, (doc, ctx) => {
      if (doc) {
        throw new DomainError(409, 'This journey has a book already', {
          code: 'book_exists',
          mcpMessage: 'This journey has a book already: read it with get_book and change it instead.',
        });
      }
      const title = args.title?.trim() || ctx.journey?.title || '';
      const book = blankBook({ title, preset: args.preset });
      const ids = book.spreads.map((s) => s.id);
      return { ok: true, doc: book, spreadIds: ids, created: ids, dropped: [] };
    });
  }

  async addPages(journeyId: number, userId: number, args: AddBookPagesRequest): Promise<BookWriteAnswer> {
    return this.write(journeyId, userId, (doc, ctx) => addBookPages(stored(doc), args, ctx));
  }

  /** The answer's `from_index` is where the page stood, so the assistant's undo can move it back. */
  async movePage(journeyId: number, userId: number, args: MoveBookPageRequest): Promise<BookWriteAnswer> {
    return this.write(journeyId, userId, (doc) => moveBookPage(stored(doc), args), {
      extra: (before) => {
        const from = before?.spreads.findIndex((s) => s.id === args.spreadId) ?? -1;
        return from >= 0 ? { from_index: from } : {};
      },
    });
  }

  async deletePages(journeyId: number, userId: number, args: DeleteBookPagesRequest): Promise<BookWriteAnswer> {
    return this.write(journeyId, userId, (doc) => deleteBookPages(stored(doc), args), {
      returnPrevious: args.returnPrevious,
    });
  }

  async editPage(journeyId: number, userId: number, args: EditBookPageRequest): Promise<BookWriteAnswer> {
    const edit = { spreadId: args.spreadId, ops: args.ops };
    return this.write(journeyId, userId, (doc, ctx) => applyBookOps(stored(doc), edit, ctx), {
      returnPrevious: args.returnPrevious,
    });
  }

  async setCover(journeyId: number, userId: number, args: SetBookCoverRequest): Promise<BookWriteAnswer> {
    return this.write(journeyId, userId, (doc, ctx) => setBookCover(stored(doc), args, ctx), {
      returnPrevious: args.returnPrevious,
    });
  }

  /**
   * Pages put back as they were, for the assistant's undo: all the pages one
   * change answered under `previous_spreads` in one call, and only while the
   * book is still at `expectedVersion`, so an undo never overwrites what anyone
   * saved after the change it takes back (409 instead). The engine holds a
   * restore to an edit's rules: photos from the gallery or the book, locked
   * elements as they are.
   */
  async restorePage(journeyId: number, userId: number, args: RestoreBookPageRequest): Promise<BookWriteAnswer> {
    return this.write(journeyId, userId, (doc, ctx) => restoreBookPage(stored(doc), args, ctx), {
      expectedVersion: args.expectedVersion,
    });
  }

  // ── The pieces ───────────────────────────────────────────────────────────

  /** The journey as a member sees it and its book. 404 for anyone else. */
  private async readable(journeyId: number, userId: number) {
    const journey = await this.journey.canAccessJourney(journeyId, userId);
    if (!journey) throw journeyNotFound();
    const record = await this.books.getBook(journeyId, userId);
    return { journey, record };
  }

  /**
   * The gallery and the entries, for the engine: a photo an operation brings in
   * must be in the gallery, an entry a page or a binding names must be the
   * journey's. Sizes are left out on purpose: `trek_photos.width/height` hold
   * a thumbnail's size for an uploaded photo and nothing for a provider's, and
   * the print check must read the original's or say nothing.
   */
  private async context(journeyId: number, journey: JourneyWords): Promise<BookOpsContext> {
    const gallery = await this.photosRepo.galleryRead(journeyId);
    const entries = await this.entriesRepo.listForJourney(journeyId);
    return {
      photos: gallery.map((p) => ({ photoId: p.photo_id, caption: p.caption ?? null })),
      journey: {
        title: journey.title,
        subtitle: journey.subtitle ?? null,
        entries: entries.map((e) => ({
          id: e.id,
          title: e.title ?? null,
          story: e.story ?? null,
          location: e.location_name ?? null,
        })),
      },
    };
  }

  /**
   * One write: the change run on the stored document inside `editBook`'s
   * transaction, with the gallery and the entries read in that same
   * transaction, so a photo taken out of the gallery a moment before cannot be
   * placed. A refusal from the engine throws there, so the transaction rolls
   * back with nothing written or sent. An engine answer that is the stored
   * document itself changed nothing, and nothing is written.
   */
  private async write(
    journeyId: number,
    userId: number,
    change: BookChange,
    options: WriteOptions = {},
  ): Promise<BookWriteAnswer> {
    const journey = await this.journey.canAccessJourney(journeyId, userId);
    if (!journey) throw journeyNotFound();
    const { record, result } = await this.books.editBook(
      journeyId,
      userId,
      async (current) => {
        const ctx = await this.context(journeyId, journey);
        const before = current?.document ?? null;
        const made = change(before, ctx);
        if (made.ok === false) throw refused(made.error);
        const unchanged = before !== null && made.doc === before;
        const title = current?.title ?? made.doc.title;
        return { title, document: made.doc, unchanged, result: { before, made, ctx } };
      },
      { expectedVersion: options.expectedVersion },
    );
    const answer = pagesOf(record.document, result.made, result.ctx);
    return {
      version: record.version,
      spread_ids: result.made.spreadIds,
      pages: answer.pages,
      findings: answer.findings,
      dropped: result.made.dropped,
      ...(options.returnPrevious ? { previous_spreads: previousOf(result.before, result.made.spreadIds) } : {}),
      ...options.extra?.(result.before),
    };
  }
}

/** The pages a write touched as they are stored now, with their findings, severe first and capped. */
function pagesOf(doc: BookDocument, made: BookMade, ctx: BookOpsContext) {
  const pages: BookSpreadSummary[] = [];
  const findings: BookWriteResult['findings'] = [];
  for (const id of made.spreadIds) {
    const index = doc.spreads.findIndex((s) => s.id === id);
    const spread = doc.spreads[index];
    if (!spread) continue;
    pages.push(summarizeSpread(spread, index));
    findings.push(...spreadFindings(spread, doc.page, ctx.photos));
  }
  const order = { severe: 0, warn: 1, info: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { pages, findings: findings.slice(0, BOOK_OP_LIMITS.findings) };
}

/**
 * The pages as they were before the write, lowest index first, for the
 * assistant's undo (`restore_book_page` puts them back in that order, so each
 * index means what it meant before). Only pages that existed before.
 */
function previousOf(before: BookDocument | null, spreadIds: readonly string[]): BookPreviousSpread[] {
  if (!before) return [];
  return before.spreads.flatMap((spread, index) => (spreadIds.includes(spread.id) ? [{ index, spread }] : []));
}

/** Every write but `create_book` needs a book to change. */
function stored(doc: BookDocument | null): BookDocument {
  if (!doc) throw noBook();
  return doc;
}

function journeyNotFound(): DomainError {
  return new DomainError(404, 'Journey not found', { mcpMessage: 'Journey not found or access denied.' });
}

function noBook(): DomainError {
  return new DomainError(404, 'This journey has no book yet', {
    code: 'book_missing',
    mcpMessage: 'This journey has no book yet: create_book makes one.',
  });
}

function pageNotFound(spreadId: string): DomainError {
  return new DomainError(404, `No page ${spreadId} in this book`, {
    code: 'book_page_missing',
    mcpMessage: `The book has no page ${spreadId}: get_book lists the pages with their ids.`,
  });
}

/**
 * An operation the engine refused, as a 422 that names it: which of the
 * call's operations (from 0) and the engine's sentence, which says what to do.
 */
function refused(error: BookOpError): DomainError {
  const message = error.opIndex === null ? error.message : `ops[${error.opIndex}]: ${error.message}`;
  return new DomainError(422, message, {
    code: `book_${error.code}`,
    details: {
      code: error.code,
      opIndex: error.opIndex,
      ...(error.elementId ? { elementId: error.elementId } : {}),
    },
  });
}
