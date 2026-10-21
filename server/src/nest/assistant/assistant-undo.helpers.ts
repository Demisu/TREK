/**
 * Whether an applied change may still be taken back: what it created must be
 * as it was then. An undo removes the created row with everything that hangs
 * off it, so a place someone planned on another day since, or booked, or
 * linked an expense to, is not removed by an undo the user meant for the bare
 * place. The trip is read as the tools answer it (`get_trip_summary` raw, and
 * `list_places` for places).
 */

type Row = Record<string, unknown>;

export interface TripSnapshot {
  summary: unknown;
  places: unknown;
}

function recordOf(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(recordOf) : [];
}

/** The fields that say a row is still the one that was created; a field either side lacks is not compared. */
const STABLE_FIELDS = {
  place: ['name', 'updated_at', 'lat', 'lng', 'address', 'category_id', 'description', 'notes'],
  assignment: ['day_id', 'place_id'],
  note: ['text', 'time', 'icon', 'color'],
  packing: ['name', 'updated_at', 'checked', 'quantity', 'category'],
  todo: ['name', 'checked', 'due_date', 'description', 'priority', 'assigned_user_id', 'category'],
  budget: ['name', 'total_price', 'currency', 'category', 'note', 'expense_date'],
} as const;

function same(created: Row, current: Row | undefined, fields: readonly string[]): boolean {
  if (!current) return false;
  return fields.every((field) => !(field in created) || !(field in current) || created[field] === current[field]);
}

function byId(rows: Row[], id: unknown): Row | undefined {
  return rows.find((row) => row.id === id);
}

function days(snapshot: TripSnapshot): Row[] {
  return rowsOf(recordOf(snapshot.summary).days);
}

function assignments(snapshot: TripSnapshot): Row[] {
  return days(snapshot).flatMap((day) => rowsOf(day.assignments));
}

/** A created place, unchanged and still only where the change put it: on no other day, in no booking or expense. */
function placeUnchanged(result: Row, snapshot: TripSnapshot): boolean {
  const created = recordOf(result.place);
  const current = byId(rowsOf(recordOf(snapshot.places).places), created.id);
  if (!same(created, current, STABLE_FIELDS.place)) return false;
  const ownAssignment = recordOf(result.assignment).id;
  const plannedElsewhere = assignments(snapshot).some((a) => a.place_id === created.id && a.id !== ownAssignment);
  const summary = recordOf(snapshot.summary);
  const referenced = [
    ...rowsOf(summary.reservations),
    ...rowsOf(summary.accommodations),
    ...rowsOf(recordOf(summary.budget).items),
  ].some((row) => row.place_id === created.id);
  return !plannedElsewhere && !referenced;
}

const CHECKS: Readonly<Record<string, (result: Row, snapshot: TripSnapshot) => boolean>> = {
  create_place: placeUnchanged,
  create_and_assign_place: placeUnchanged,
  assign_place_to_day: (result, snapshot) => {
    const created = recordOf(result.assignment);
    return same(created, byId(assignments(snapshot), created.id), STABLE_FIELDS.assignment);
  },
  create_day_note: (result, snapshot) => {
    const created = recordOf(result.note);
    const notes = days(snapshot).flatMap((day) => rowsOf(day.notes));
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

/** True when the change `toolName` made (its stored `result`) is still as it left it. */
export function unchangedSinceApplied(toolName: string, result: unknown, snapshot: TripSnapshot): boolean {
  const check = CHECKS[toolName];
  return !!check && check(recordOf(result), snapshot);
}
