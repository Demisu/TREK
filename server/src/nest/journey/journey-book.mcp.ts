import { ADDON_IDS } from '../../addons';
import {
  McpController,
  TOOL_ANNOTATIONS_DELETE,
  TOOL_ANNOTATIONS_NON_IDEMPOTENT,
  TOOL_ANNOTATIONS_READONLY,
  TOOL_ANNOTATIONS_WRITE,
  Tool,
  ok,
  type McpContext,
} from '../../nest-mcp';
import { addonGate } from '../addons/addon-gate';
import { AddonsService } from '../addons/addons.service';
import { JourneyBookEditService } from './journey-book-edit.service';
import {
  addBookPagesArgs,
  BOOK_OP_LIMITS,
  bookPageSetupForPreset,
  createBookArgs,
  deleteBookPagesArgs,
  describeBookPageArgs,
  editBookPageArgs,
  idSchema,
  listBookLayouts,
  listBookLayoutsArgs,
  moveBookPageArgs,
  restoreBookPageArgs,
  setBookCoverArgs,
  type AddBookPagesRequest,
  type CreateBookRequest,
  type DeleteBookPagesRequest,
  type EditBookPageRequest,
  type MoveBookPageRequest,
  type RestoreBookPageRequest,
  type SetBookCoverRequest,
} from '@trek/shared';

const journeyAddonOn = addonGate(ADDON_IDS.JOURNEY);

/** What a layout does to what is on the page, said where a model picks one (list_book_layouts answers it too). */
const LAYOUT_NOTES = listBookLayouts(null, bookPageSetupForPreset('square-210')).notes;

const UNITS =
  'A book is a list of pages (spreads): the cover, the first page, inner double spreads, the last page and the back. ' +
  'Positions and sizes are millimetres from the top left of the page, a double spread being twice the page width ' +
  'with the fold at one page width.';

const WRITE_ANSWER =
  'It answers the new version, the ids of the pages it changed, each of those pages as get_book lists it, their ' +
  'findings (severe ones are faults to fix, such as overlapping photos, words past their frame or in the fold, ' +
  'empty frames) and dropped, the elements whose content left the page. Nothing is written when any part is refused.';

interface OnJourney {
  journeyId: number;
}

/**
 * TREK Studio books over MCP: read a book page by page, and change it with the
 * same edit engine the Studio and the assistant's cards use. The rights are
 * those of PUT /api/journeys/:id/book: any member reads, the owner and editors
 * write, a viewer is refused, an outsider is told the journey is not there.
 * Every write is one transaction against the stored version and sends
 * journey:book:saved to every member's tabs after the commit, the asking one
 * included, like a save from the Studio.
 *
 * Every field comes from the book contracts in @trek/shared, so a bound that
 * changes there changes here.
 */
@McpController()
export class JourneyBookMcp {
  constructor(
    private readonly books: JourneyBookEditService,
    // Read by the addon gate of every tool here.
    readonly addons: AddonsService,
  ) {}

  // ── Read ────────────────────────────────────────────────────────────────

  @Tool({
    name: 'get_book',
    description: `The TREK Studio book of a journey, without its document: whether it exists, its version, title and page setup, every page with its index, id, role, entry, photo ids, the first words of each text and how many elements, empty frames and parked elements it holds, and the book's own saved layouts. ${UNITS} Read it before changing the book: page and element ids are never invented, they come from here and from describe_book_page.`,
    inputSchema: { journeyId: idSchema },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'read' },
  })
  async getBook({ journeyId }: OnJourney, ctx: McpContext) {
    return ok(await this.books.overview(journeyId, ctx.userId));
  }

  @Tool({
    name: 'describe_book_page',
    description: `One page of a journey's book in words: its size and role, every element back to front with its id, kind, frame in mm, rotation, lock, photo id or first words and binding, then the findings (overlaps, content in the fold or past the trim, empty frames, low print resolution, words past their frame, parked elements). ${UNITS} Read it before editing a page and again after, to check the result.`,
    inputSchema: { journeyId: idSchema, ...describeBookPageArgs },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'read' },
  })
  async describeBookPage({ journeyId, spreadId }: OnJourney & { spreadId: string }, ctx: McpContext) {
    return ok(await this.books.describePage(journeyId, ctx.userId, spreadId));
  }

  @Tool({
    name: 'list_book_layouts',
    description: `The layouts a page of a journey's book can take: the templates for inner double spreads and for single pages (the cover, first, last and back) with their photo and text slots, the photo grids with their cell count, and the book's own saved layouts. role narrows the answer to inner or single. ${LAYOUT_NOTES.templates} ${LAYOUT_NOTES.grids}`,
    inputSchema: { journeyId: idSchema, ...listBookLayoutsArgs },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'read' },
  })
  async listLayouts({ journeyId, role }: OnJourney & { role?: 'inner' | 'single' }, ctx: McpContext) {
    return ok(await this.books.layouts(journeyId, ctx.userId, role));
  }

  // ── Write ───────────────────────────────────────────────────────────────

  @Tool({
    name: 'create_book',
    description: `Lay down a blank book for a journey that has none yet: a cover, the first page, one empty double spread, the last page and the back, in the page format preset names (a 21 cm square unless told otherwise), titled title or else the journey's title. A journey that has a book already is refused. ${WRITE_ANSWER}`,
    inputSchema: { journeyId: idSchema, ...createBookArgs },
    annotations: TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'write' },
  })
  async createBook({ journeyId, ...args }: OnJourney & CreateBookRequest, ctx: McpContext) {
    return ok(await this.books.createBook(journeyId, ctx.userId, args));
  }

  @Tool({
    name: 'add_book_pages',
    description: `Add 1 to ${BOOK_OP_LIMITS.pagesPerCall} empty double spreads after afterSpreadId, always kept between the first and the last page, laid out on template when one is named and tied to the journey entry entryId when given. ${WRITE_ANSWER}`,
    inputSchema: { journeyId: idSchema, ...addBookPagesArgs },
    annotations: TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'write' },
  })
  async addBookPages({ journeyId, ...args }: OnJourney & AddBookPagesRequest, ctx: McpContext) {
    return ok(await this.books.addPages(journeyId, ctx.userId, args));
  }

  @Tool({
    name: 'move_book_page',
    description: `Move one inner double spread to toIndex, which must lie between the first and the last page (get_book gives the indexes). The cover, first, last and back pages keep their place. The answer also says where the page stood, under from_index; a move to where the page already is writes nothing. ${WRITE_ANSWER}`,
    inputSchema: { journeyId: idSchema, ...moveBookPageArgs },
    annotations: TOOL_ANNOTATIONS_WRITE,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'write' },
  })
  async moveBookPage({ journeyId, ...args }: OnJourney & MoveBookPageRequest, ctx: McpContext) {
    return ok(await this.books.movePage(journeyId, ctx.userId, args));
  }

  @Tool({
    name: 'delete_book_pages',
    description: `Delete 1 to ${BOOK_OP_LIMITS.pagesPerCall} inner double spreads with everything on them. The cover, first, last and back pages cannot be deleted. Only when the person asked for it. With returnPrevious the answer also holds the deleted pages as they were, under previous_spreads. ${WRITE_ANSWER}`,
    inputSchema: { journeyId: idSchema, ...deleteBookPagesArgs },
    annotations: TOOL_ANNOTATIONS_DELETE,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'write' },
  })
  async deleteBookPages({ journeyId, ...args }: OnJourney & DeleteBookPagesRequest, ctx: McpContext) {
    return ok(await this.books.deletePages(journeyId, ctx.userId, args));
  }

  @Tool({
    name: 'edit_book_page',
    description: `Change one page with 1 to ${BOOK_OP_LIMITS.opsPerCall} operations, run in order, all or nothing: layout (a template, grid or saved layout), place_photo (a photo of the journey's gallery into a frame by elementId, by its slot among the page's frames, or into a new frame), photo_look (the crop as fit and focal point, mask, frame style, filter, radius), swap_photos, text (by elementId, or by role heading, body or meta, which creates the text when the page has none), caption (under a photo, bound to its caption in the journal unless words are given), frame (move, resize, turn), remove (parked with the page by default, park false deletes) and background (null is the paper). A locked element refuses any operation that would change it. ${LAYOUT_NOTES.templates} ${LAYOUT_NOTES.grids} ${UNITS} With returnPrevious the answer also holds the page as it was, under previous_spreads. ${WRITE_ANSWER}`,
    inputSchema: { journeyId: idSchema, ...editBookPageArgs },
    annotations: TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'write' },
  })
  async editBookPage({ journeyId, ...args }: OnJourney & EditBookPageRequest, ctx: McpContext) {
    return ok(await this.books.editPage(journeyId, ctx.userId, args));
  }

  @Tool({
    name: 'set_book_cover',
    description: `The cover of a journey's book: its layout (a single page template), its photo (from the journey's gallery, into a free frame, else a full bleed one behind everything), its title and its subtitle. A title or subtitle bound to the journey's own stays bound unless other words are given. With returnPrevious the answer also holds the cover as it was, under previous_spreads. ${WRITE_ANSWER}`,
    inputSchema: { journeyId: idSchema, ...setBookCoverArgs },
    annotations: TOOL_ANNOTATIONS_WRITE,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'write' },
  })
  async setBookCover({ journeyId, ...args }: OnJourney & SetBookCoverRequest, ctx: McpContext) {
    return ok(await this.books.setCover(journeyId, ctx.userId, args));
  }

  @Tool({
    name: 'restore_book_page',
    description: `Put pages of a journey's book back exactly as pages gives them, all in one call: each in its place when the book still has a page with its id, else at its index, lowest index first. Refused unless the book is still at expectedVersion, so nothing saved since is overwritten. A photo must be in the journey's gallery or already in the book, and a locked element stays as it is. This takes back an earlier change (pages is that change's previous_spreads, whole); it is not a way to edit a page. ${WRITE_ANSWER}`,
    inputSchema: { journeyId: idSchema, ...restoreBookPageArgs },
    annotations: TOOL_ANNOTATIONS_WRITE,
    when: journeyAddonOn,
    access: { group: 'journey', mode: 'write' },
  })
  async restoreBookPage({ journeyId, ...args }: OnJourney & RestoreBookPageRequest, ctx: McpContext) {
    return ok(await this.books.restorePage(journeyId, ctx.userId, args));
  }
}
