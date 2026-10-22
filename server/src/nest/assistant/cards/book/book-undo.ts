import type { ToolArgs, ToolCards, UndoSnapshot } from '../card-types';
import { readKey, recordOf } from '../card-values';

/**
 * The way back from an applied book change. Edits, the cover and deleted
 * pages go back with `restore_book_page`, which puts the pages the change
 * answered under `previous_spreads` back as they were and only while the book
 * is still at the version the change left: anything saved since makes it
 * refuse, and the undo answers "changed since". New pages are deleted again
 * and a moved page moved back, both only while `get_book` still reads the
 * version the change left, and the call itself names that version, so a save
 * landing between the check and the call is refused rather than overwritten.
 *
 * The version is the whole book's: an undo after any later save to the book
 * answers "changed since", a page the save never touched included. "Undo
 * all" over several book changes therefore takes back the newest one only,
 * the older ones then being behind the version it left.
 */

type BookUndo = NonNullable<ToolCards['undo']>;

/** The version a write's answer left the book at; null for an answer that names none. */
function versionOf(result: unknown): number | null {
  const version = recordOf(result).version;
  return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : null;
}

/** The pages a write kept as they were before it; none when it kept none. */
function previousOf(result: unknown): unknown[] {
  const pages = recordOf(result).previous_spreads;
  return Array.isArray(pages) ? pages : [];
}

/** The book as the undo reads it before it checks: its summary, whatever the change was. */
const BOOK_READ = { tool: 'get_book', args: {} } as const;

/** Nothing was saved to the book since the change: `get_book` still reads the version it left. */
function bookUnmoved(result: unknown, snapshot: UndoSnapshot): boolean {
  const left = versionOf(result);
  return left !== null && versionOf(snapshot.reads.get(readKey(BOOK_READ.tool, BOOK_READ.args))) === left;
}

/**
 * Pages put back as the change found them. The restore itself refuses unless
 * the book is still at the version the change left, so the check only asks
 * that the answer holds what the restore needs.
 */
export const RESTORE_PREVIOUS: BookUndo = {
  tool: 'restore_book_page',
  args: (_args, result) => {
    const pages = previousOf(result);
    const expectedVersion = versionOf(result);
    return pages.length > 0 && expectedVersion !== null ? { pages, expectedVersion } : null;
  },
  unchanged: (result) => previousOf(result).length > 0 && versionOf(result) !== null,
};

/** New pages deleted again, while nothing was saved to the book since they were added. */
export const DELETE_ADDED: BookUndo = {
  tool: 'delete_book_pages',
  args: (_args, result) => {
    const ids = recordOf(result).spread_ids;
    const spreadIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
    const expectedVersion = versionOf(result);
    return spreadIds.length > 0 && expectedVersion !== null ? { spreadIds, expectedVersion } : null;
  },
  reads: () => [BOOK_READ],
  unchanged: bookUnmoved,
};

/** A moved page moved back to where it stood, while nothing was saved to the book since. */
export const MOVE_BACK: BookUndo = {
  tool: 'move_book_page',
  args: (args: ToolArgs, result) => {
    const from = recordOf(result).from_index;
    const spreadId = args.spreadId;
    const expectedVersion = versionOf(result);
    if (typeof spreadId !== 'string' || typeof from !== 'number' || expectedVersion === null) return null;
    return { spreadId, toIndex: from, expectedVersion };
  },
  reads: () => [BOOK_READ],
  unchanged: bookUnmoved,
};
