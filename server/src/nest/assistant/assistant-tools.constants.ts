import type { AssistantApplied, AssistantChangeVerbKey } from '@trek/shared';

/** Model calls per turn before the loop stops and asks the user whether to go on. */
export const MAX_STEPS = 8;

/** Changes one step may propose at once; more come back to the model as an error. */
export const MAX_WRITES_PER_STEP = 12;

/** Lookups one step may run; the rest come back to the model as an error (searches bill the instance's maps key). */
export const MAX_READS_PER_STEP = 12;

/** What a tool answer may cost the conversation, as JSON text, after it was cut down to its structure. */
export const MAX_TOOL_OUTPUT_CHARS = 12_000;

/** How long an applied change can be undone. */
export const UNDO_WINDOW_MS = 15 * 60_000;

/** How long a proposed change waits for a decision before it expires. */
export const APPROVAL_TTL_MS = 24 * 60 * 60_000;

/** Turns (chat, decisions, undo) a user may start per minute. */
export const TURNS_PER_MINUTE = 10;

/**
 * What an assistant session may do, as the scopes an MCP client would hold.
 * Day notes sit in the `trips` group and day assignments in `places`; the
 * allowlist below, not these scopes, is what decides which tools exist.
 */
export const ASSISTANT_SCOPES: readonly string[] = [
  'trips:read',
  'trips:write',
  'places:read',
  'places:write',
  'packing:read',
  'packing:write',
  'todos:read',
  'todos:write',
  'budget:read',
  'budget:write',
  'reservations:read',
  'reservations:write',
  'geo:read',
  'weather:read',
];

/** Tools that only read: they run as soon as the model calls them. */
export const ASSISTANT_READ_TOOLS: readonly string[] = [
  'get_trip_summary',
  'list_places',
  'search_place',
  'get_place_details',
  'search_nearby_places',
  'search_pois',
  'list_categories',
  'get_weather',
  'list_todos',
  'get_settlement_summary',
  'search_help',
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

/** Tools that change the trip: each call is held as a change card until the user applies it. */
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

/** The model's tools a found place is added through: a new place for the day, or one the trip has already. */
const FOUND_PLACE_VIA: ReadonlySet<string> = new Set(['create_and_assign_place', 'assign_place_to_day']);

/**
 * Changes the server proposes itself, from an attached file or a search result
 * the user picked rather than from the model. They are held, decided and
 * recorded like the writes above, and they are not on the allowlist, so no
 * session ever offers them to the model. A booking is applied by the server
 * itself; a found place deliberately goes through the MCP tool named in its
 * `via` argument, so it is applied with the user's rights, broadcast and
 * undone exactly like the same change proposed by the model.
 */
export const ASSISTANT_SERVER_WRITE_TOOLS: Readonly<Record<string, AssistantWriteTool>> = {
  [IMPORT_BOOKING_TOOL]: { verbKey: 'importBooking', entity: 'reservation' },
  // The card names the verb of the `via` tool; these are its fallbacks.
  [ADD_FOUND_PLACE_TOOL]: { verbKey: 'addPlaceToDay', entity: 'place', quiet: true },
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

/**
 * The one removal the model may propose: taking a place off a day. The tool
 * is annotated destructive because the assignment row goes, but the place
 * stays in the trip, so it is offered like any other change card. Without it
 * the model "replaced" a day's plan by renaming the place that was on it.
 */
export const ASSISTANT_REMOVAL_TOOLS: ReadonlySet<string> = new Set(['unassign_place']);

/** Every tool the model is offered. Nothing outside this list is attached to an assistant session. */
export const ASSISTANT_TOOL_ALLOWLIST: ReadonlySet<string> = new Set([
  ...ASSISTANT_READ_TOOLS,
  ...Object.keys(ASSISTANT_WRITE_TOOLS),
]);

/**
 * Tools the assistant must never be offered, kept as a list so a test can
 * hold the allowlist apart from it: whatever reaches beyond the trip
 * (members, sharing, invitations, feeds, files, other trips), fetches an
 * address of the model's choosing, or deletes (taking a place off a day is
 * the one removal offered, see ASSISTANT_REMOVAL_TOOLS). `isDeniedTool` adds every name
 * that shares, invites or publishes a feed.
 */
const ASSISTANT_TOOL_DENYLIST: ReadonlySet<string> = new Set([
  'import_places_from_url',
  'resolve_maps_url',
  'add_trip_member',
  'remove_trip_member',
  'leave_trip',
  'delete_trip',
  'copy_trip',
  'read_trip_file',
  'upload_trip_file',
  'invite_to_collection',
  'send_vacay_invite',
  'share_vacay_calendar',
  'update_display_settings',
  'send_collab_message',
  'list_upcoming_reservations',
  'delete_place',
  'delete_day_note',
  'delete_packing_item',
  'delete_todo',
  'delete_budget_item',
]);

const DENIED_NAME = /share|invite|feed/;

export function isDeniedTool(name: string): boolean {
  return ASSISTANT_TOOL_DENYLIST.has(name) || DENIED_NAME.test(name);
}

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
