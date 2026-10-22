import type { AssistantToolSession } from './assistant-tools.service';
import type { ToolArgs, UndoSnapshot } from './cards/card-types';
import { readKey, recordOf, type Row } from './cards/card-values';
import { TOOL_CARDS, undoReadsOf } from './cards/registry';
import {
  byId,
  placeUnchanged,
  rowsOf,
  same,
  snapshotAssignments,
  snapshotDays,
  STABLE_FIELDS,
} from './cards/undo-snapshot';

/**
 * Whether an applied change may still be taken back: what it created must be
 * as it was then. An undo removes the created row with everything that hangs
 * off it, so a place someone planned on another day since, or booked, or
 * linked an expense to, is not removed by an undo the user meant for the bare
 * place. The trip is read as the tools answer it (`get_trip_summary` raw, and
 * `list_places` for places), plus the reads a package's undo asks for.
 */

/** The trip as an undo reads it; the package reads are left out where none were made. */
export type TripSnapshot = Omit<UndoSnapshot, 'reads'> & { reads?: UndoSnapshot['reads'] };

/** The trip reads every undo makes before it checks. */
const TRIP_READS = ['get_trip_summary', 'list_places'] as const;

const CORE_CHECKS: Readonly<Record<string, (result: Row, snapshot: UndoSnapshot) => boolean>> = {
  create_place: placeUnchanged,
  create_and_assign_place: placeUnchanged,
  assign_place_to_day: (result, snapshot) => {
    const created = recordOf(result.assignment);
    return same(created, byId(snapshotAssignments(snapshot), created.id), STABLE_FIELDS.assignment);
  },
  create_day_note: (result, snapshot) => {
    const created = recordOf(result.note);
    const notes = snapshotDays(snapshot).flatMap((day) => rowsOf(day.notes));
    return same(created, byId(notes, created.id), STABLE_FIELDS.note);
  },
  create_packing_item: (result, snapshot) => {
    const created = recordOf(result.item);
    const items = rowsOf(recordOf(recordOf(snapshot.summary).packing).items);
    return same(created, byId(items, created.id), STABLE_FIELDS.packing);
  },
  create_todo: (result, snapshot) => {
    const created = recordOf(result.item);
    return same(created, byId(rowsOf(recordOf(snapshot.summary).todos), created.id), STABLE_FIELDS.todo);
  },
  create_budget_item: (result, snapshot) => {
    const created = recordOf(result.item);
    const items = rowsOf(recordOf(recordOf(snapshot.summary).budget).items);
    return same(created, byId(items, created.id), STABLE_FIELDS.budget);
  },
};

/**
 * The core checks and each package's `undo.unchanged`, which the registry
 * guards (one that throws reads as changed) and keeps off the core's tools.
 */
const CHECKS: Readonly<Record<string, (result: Row, snapshot: UndoSnapshot) => boolean>> = {
  ...CORE_CHECKS,
  ...Object.fromEntries(
    Object.entries(TOOL_CARDS).flatMap(([tool, cards]) => {
      const undo = cards.undo;
      return undo ? [[tool, (result: Row, snapshot: UndoSnapshot) => undo.unchanged(result, snapshot)]] : [];
    }),
  ),
};

/** True when the change `toolName` made (its stored `result`) is still as it left it. */
export function unchangedSinceApplied(toolName: string, result: unknown, snapshot: TripSnapshot): boolean {
  const check = CHECKS[toolName];
  return !!check && check(recordOf(result), { ...snapshot, reads: snapshot.reads ?? new Map() });
}

/** The tools an undo's session holds: the removing tool, the trip reads and what the change's package reads. */
export function undoTargetsOf(undoTool: string, toolName: string, args: ToolArgs, result: unknown): Set<string> {
  return new Set([undoTool, ...TRIP_READS, ...undoReadsOf(toolName, args, result).map((read) => read.tool)]);
}

/** The trip as the undo checks it, read through the undo's session; null when a trip read failed. */
export async function undoSnapshotOf(
  session: Pick<AssistantToolSession, 'read'>,
  toolName: string,
  args: ToolArgs,
  result: unknown,
  reads = undoReadsOf(toolName, args, result),
): Promise<UndoSnapshot | null> {
  const summary = await session.read('get_trip_summary');
  const places = await session.read('list_places');
  if (!summary.ok || !places.ok) return null;
  const extra = await Promise.all(
    reads.map(async (read): Promise<[string, unknown]> => {
      const run = await session.read(read.tool, read.args);
      return [readKey(read.tool, read.args), run.ok ? run.value : null];
    }),
  );
  return { summary: summary.value, places: places.value, reads: new Map(extra) };
}
