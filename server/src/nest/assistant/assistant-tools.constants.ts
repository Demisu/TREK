import type { AssistantApplied, AssistantChangeVerbKey } from '@trek/shared';

/**
 * Model calls per turn before the loop stops and asks the user whether to go
 * on. Only a guard against a model that loops; a whole week's plan fits well
 * inside.
 */
export const MAX_STEPS = 30;

/** Changes one step may propose at once (a week with places, notes and times); more come back as an error. */
export const MAX_WRITES_PER_STEP = 50;

/** Lookups one step may run; the rest come back to the model as an error (searches bill the instance's maps key). */
export const MAX_READS_PER_STEP = 30;

/** What a tool answer may cost the conversation, as JSON text, after it was cut down to its structure. */
export const MAX_TOOL_OUTPUT_CHARS = 40_000;

/** How long an applied change can be undone. */
export const UNDO_WINDOW_MS = 15 * 60_000;

/** How long a proposed change waits for a decision before it expires. */
export const APPROVAL_TTL_MS = 24 * 60 * 60_000;

/** Turns (chat, decisions, undo) a user may start per minute. */
export const TURNS_PER_MINUTE = 30;

/**
 * What an assistant session may do, as the scopes an MCP client would hold:
 * everything a user can reach through MCP but deleting trips, share and
 * invite links (trips:share, journey:share), file contents and plugin tools,
 * whose tools the registry then never attaches. assistant-tool-offer.ts
 * denies the few tools inside these scopes that no approval makes safe.
 */
export const ASSISTANT_SCOPES: readonly string[] = [
  'trips:read',
  'trips:write',
  'places:read',
  'places:write',
  'collections:read',
  'collections:write',
  'atlas:read',
  'atlas:write',
  'packing:read',
  'packing:write',
  'todos:read',
  'todos:write',
  'budget:read',
  'budget:write',
  'reservations:read',
  'reservations:write',
  'collab:read',
  'collab:write',
  'notifications:read',
  'notifications:write',
  'vacay:read',
  'vacay:write',
  'geo:read',
  'weather:read',
  'journey:read',
  'journey:write',
  'files:read',
  'files:write',
  'settings:read',
  'settings:write',
];

/**
 * A writing tool: the verb its change card names, and what it touches once
 * applied. A `quiet` one is decided without a model turn after it: the user
 * proposed it, so there is nothing for the model to carry on with.
 */
interface AssistantWriteTool {
  verbKey: AssistantChangeVerbKey;
  entity: AssistantApplied['entity'];
  quiet?: boolean;
}

/**
 * The writing tools with a change card of their own: its verb and what it
 * touches once applied. Every other writing tool is held as a card too, one
 * built from its arguments (tool-call-generic.helpers.ts).
 */
export const ASSISTANT_WRITE_TOOLS: Readonly<Record<string, AssistantWriteTool>> = {
  create_place: { verbKey: 'addPlace', entity: 'place' },
  create_and_assign_place: { verbKey: 'addPlaceToDay', entity: 'place' },
  update_place: { verbKey: 'updatePlace', entity: 'place' },
  assign_place_to_day: { verbKey: 'assignPlace', entity: 'assignment' },
  move_assignment: { verbKey: 'moveAssignment', entity: 'assignment' },
  unassign_place: { verbKey: 'removeFromDay', entity: 'assignment' },
  create_day_note: { verbKey: 'addDayNote', entity: 'day_note' },
  update_day_note: { verbKey: 'updateDayNote', entity: 'day_note' },
  create_packing_item: { verbKey: 'addPackingItem', entity: 'packing' },
  update_packing_item: { verbKey: 'updatePackingItem', entity: 'packing' },
  create_todo: { verbKey: 'addTodo', entity: 'todo' },
  create_budget_item: { verbKey: 'addBudgetItem', entity: 'budget' },
  update_budget_item: { verbKey: 'updateBudgetItem', entity: 'budget' },
  create_reservation: { verbKey: 'addReservation', entity: 'reservation' },
};

/**
 * The step that reads a file the user attached. The server runs it itself
 * when the file arrives; it is no MCP tool and the model is never offered it.
 */
export const READ_BOOKING_FILE_TOOL = 'read_booking_file';

/** A booking read from an attached file, held as a change card like any write. */
export const IMPORT_BOOKING_TOOL = 'import_booking';

/**
 * A place from the search results of an answer, suggested for a day by the
 * user ("+ Day 3"). Held as a change card like any write, without a model turn.
 */
export const ADD_FOUND_PLACE_TOOL = 'add_found_place';

/**
 * A fact or wish the user wants kept for this trip ("we are two"). It is no
 * MCP tool: the server offers it to the model itself, holds it as a change
 * card like any write and, once applied, adds it to the user's trip notes,
 * which come along with every later turn about the trip.
 */
export const REMEMBER_TOOL = 'remember_for_trip';

/** The model's tools a found place is added through: a new place for the day, or one the trip has already. */
const FOUND_PLACE_VIA: ReadonlySet<string> = new Set(['create_and_assign_place', 'assign_place_to_day']);

/**
 * Changes the server applies itself: a booking from an attached file, a search
 * result the user picked, a note the user wants kept. They are held, decided
 * and recorded like the writes above, and no MCP tool has their names; only the
 * note is offered to the model, by the session itself (REMEMBER_SPEC). A booking is applied by the server
 * itself; a found place deliberately goes through the MCP tool named in its
 * `via` argument, so it is applied with the user's rights, broadcast and
 * undone exactly like the same change proposed by the model.
 */
export const ASSISTANT_SERVER_WRITE_TOOLS: Readonly<Record<string, AssistantWriteTool>> = {
  [IMPORT_BOOKING_TOOL]: { verbKey: 'importBooking', entity: 'reservation' },
  // The card names the verb of the `via` tool; these are its fallbacks.
  [ADD_FOUND_PLACE_TOOL]: { verbKey: 'addPlaceToDay', entity: 'place', quiet: true },
  [REMEMBER_TOOL]: { verbKey: 'rememberNote', entity: 'memory' },
};

/**
 * The tool a held call runs as: for a found place the model's tool in its
 * `via` argument, for anything else the call's own. A `via` that is not one of
 * the two is returned as it is, so it finds no card, run or undo.
 */
export function writeToolOf(toolName: string, args: Record<string, unknown>): string {
  if (toolName !== ADD_FOUND_PLACE_TOOL) return toolName;
  return typeof args.via === 'string' && FOUND_PLACE_VIA.has(args.via) ? args.via : toolName;
}

/** The arguments a found place runs its `via` tool with: what that tool takes, nothing else. */
export function foundPlaceArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (args.via === 'assign_place_to_day') return { dayId: args.dayId, placeId: args.placeId };
  const { via: _via, ...rest } = args;
  return rest;
}

/** Calls the server makes on its own: replayed to the model as a note, never as a call of an unknown tool. */
export const ASSISTANT_SERVER_TOOLS: ReadonlySet<string> = new Set([
  READ_BOOKING_FILE_TOOL,
  ...Object.keys(ASSISTANT_SERVER_WRITE_TOOLS),
]);

/** Bookings one attached file may propose; the rest are left out, as a step holds no more changes. */
export const MAX_BOOKINGS_PER_FILE = MAX_WRITES_PER_STEP;

/** The largest file the assistant reads. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** The argument every trip tool takes; the server sets it to the trip the conversation is about. */
export const PINNED_ARG = 'tripId';

/**
 * Arguments the model never chooses. `forced` ones are set to a fixed value
 * (place details stay on the cheap lookup, which the instance pays for);
 * `stripped` ones are taken away (a picture URL would be loaded by every
 * member's browser, a tracking pixel the model could plant). Neither appears
 * in the schema the model sees.
 */
export const ASSISTANT_ARG_POLICY: Readonly<
  Record<string, { forced?: Readonly<Record<string, unknown>>; stripped?: readonly string[] }>
> = {
  get_place_details: { forced: { expand: false, refresh: false } },
  create_place: { stripped: ['image_url'] },
  create_and_assign_place: { stripped: ['image_url'] },
  update_place: { stripped: ['image_url'] },
  bulk_update_places: { stripped: ['image_url'] },
  update_trip: { stripped: ['cover_image'] },
};

type ToolArgs = Record<string, unknown>;

function idIn(value: unknown, key: string): number | null {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  const id = record && typeof record === 'object' ? (record as Record<string, unknown>).id : undefined;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

function argId(args: ToolArgs, key: string): number | null {
  const id = args[key];
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The way back from an applied change, for the server only: the tool that
 * removes what the change created, and its arguments, from the arguments the
 * change ran with and the result it gave. Null when the result does not name
 * what was created, which offers no undo. The model is never offered these
 * tools, except the removal it may also propose itself; they run in a session
 * of their own that holds nothing else.
 */
interface AssistantUndo {
  tool: string;
  args: (args: ToolArgs, result: unknown) => ToolArgs | null;
}

export const ASSISTANT_UNDO_MAP: Readonly<Record<string, AssistantUndo>> = {
  create_place: {
    tool: 'delete_place',
    args: (_args, result) => {
      const placeId = idIn(result, 'place');
      return placeId ? { placeId } : null;
    },
  },
  create_and_assign_place: {
    tool: 'delete_place',
    args: (_args, result) => {
      const placeId = idIn(result, 'place');
      return placeId ? { placeId } : null;
    },
  },
  assign_place_to_day: {
    tool: 'unassign_place',
    args: (args, result) => {
      const assignmentId = idIn(result, 'assignment');
      const dayId = argId(args, 'dayId');
      return assignmentId && dayId ? { dayId, assignmentId } : null;
    },
  },
  create_day_note: {
    tool: 'delete_day_note',
    args: (args, result) => {
      const noteId = idIn(result, 'note');
      const dayId = argId(args, 'dayId');
      return noteId && dayId ? { dayId, noteId } : null;
    },
  },
  create_packing_item: {
    tool: 'delete_packing_item',
    args: (_args, result) => {
      const itemId = idIn(result, 'item');
      return itemId ? { itemId } : null;
    },
  },
  create_todo: {
    tool: 'delete_todo',
    args: (_args, result) => {
      const itemId = idIn(result, 'item');
      return itemId ? { itemId } : null;
    },
  },
  create_budget_item: {
    tool: 'delete_budget_item',
    args: (_args, result) => {
      const itemId = idIn(result, 'item');
      return itemId ? { itemId } : null;
    },
  },
};
