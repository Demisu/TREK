import type { ToolCards, UndoSnapshot } from '../card-types';
import { recordOf } from '../card-values';
import { byId, placeUnchanged, snapshotPlaces } from '../undo-snapshot';

/** The place id of a tour a create answered with (`{ tour: { place_id } }`). */
function tourIdIn(value: unknown): number | null {
  const id = recordOf(recordOf(value).tour).place_id;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * A created tour, unchanged and on no day: its place still has the name and
 * description it was created with, has not been written since it was made,
 * and nothing plans, books or pays for it. Every write of a tour's route or
 * name (a change over MCP, the planner's save, a rename) stamps its place's
 * `updated_at`, which the create left equal to `created_at`; the revision is
 * not in the snapshot. A tour planned on a day since is kept too.
 */
function tourUnchanged(result: unknown, snapshot: UndoSnapshot): boolean {
  const tour = recordOf(recordOf(result).tour);
  const current = byId(snapshotPlaces(snapshot), tour.place_id);
  const untouched = typeof current?.created_at === 'string' && current.updated_at === current.created_at;
  return (
    untouched &&
    placeUnchanged({ place: { id: tour.place_id, name: tour.name, description: tour.description ?? null } }, snapshot)
  );
}

/** A created tour taken back with its place, which takes its route and points along. */
export const DELETE_CREATED_TOUR: NonNullable<ToolCards['undo']> = {
  tool: 'delete_place',
  args: (_args, result) => {
    const placeId = tourIdIn(result);
    return placeId ? { placeId } : null;
  },
  unchanged: tourUnchanged,
};
