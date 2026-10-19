import { decodeJson, encodeJson } from '../../utils/json-column';
import type { TourWaypoints } from '../entities/TourWaypoints.entity';
import { TOUR_WAYPOINT_FIXED_LEG, TOUR_WAYPOINT_LOCK } from '../json-columns';
import type { DB } from '../kysely/db';
import { TrekRepository } from './_shared/trek-repository';
import type { PaddleLock, TourFixedLeg } from '@trek/shared';

/** One saved routing control point of a tour, in route order. */
export interface TourWaypointRow {
  lat: number;
  lng: number;
  role: 'start' | 'via' | 'end';
  sequence: number;
  /** The leg to the next waypoint as a fixed line; absent for a routed leg. */
  fixed_leg?: TourFixedLeg | null;
  /** A lock at this point of a paddle tour; absent where there is none. */
  lock?: PaddleLock | null;
  /** P2A-03: a shaping point, steering the route only; absent for a stop. */
  shaping?: boolean;
  /** PR1-10: the place of the trip this point stands for; absent for a free point. */
  linked_place_id?: number | null;
}

/** The row as stored, the fixed leg still JSON text. */
interface StoredWaypoint {
  lat: number;
  lng: number;
  role: TourWaypointRow['role'];
  sequence: number;
  fixed_leg: string | null;
  lock: string | null;
  shaping: number;
  linked_place_id: number | null;
}

/** A stored row as callers read it: the fixed leg, the lock and the shaping flag, each left out entirely where there is none. */
function readWaypoint({ fixed_leg, lock, shaping, linked_place_id, ...point }: StoredWaypoint): TourWaypointRow {
  const leg = decodeJson(TOUR_WAYPOINT_FIXED_LEG, fixed_leg, 'tour waypoint');
  const stop = decodeJson(TOUR_WAYPOINT_LOCK, lock, 'tour waypoint');
  return {
    ...point,
    ...(leg ? { fixed_leg: leg } : {}),
    ...(stop ? { lock: stop } : {}),
    ...(shaping ? { shaping: true } : {}),
    ...(linked_place_id != null ? { linked_place_id } : {}),
  };
}

/** {@link TourWaypointRow} plus the tour it belongs to, as the trip copy reads it. */
export interface TourWaypointWithPlaceRow extends TourWaypointRow {
  place_id: number;
}

/** `role` narrowed to the three values the column's CHECK constraint allows. */
type TourWaypointsKyselyDB = Pick<DB, 'places' | 'tours'> & {
  tour_waypoints: Omit<DB['tour_waypoints'], 'role'> & { role: TourWaypointRow['role'] };
};

/**
 * `tour_waypoints` — the start, via and end points the route editor saved
 * for a tour, so reopening it restores the controls rather than only the
 * derived line. Rows hang off `tours(place_id)` and go with the tour.
 */
export class TourWaypointsRepository extends TrekRepository<TourWaypoints> {
  private db() {
    return this.kysely<TourWaypointsKyselyDB>();
  }

  /** TW1 — `SELECT lat, lng, role, sequence, fixed_leg, lock, shaping FROM tour_waypoints WHERE place_id = ? ORDER BY sequence`. */
  async listForPlace(place_id: number): Promise<TourWaypointRow[]> {
    const rows = await this.db()
      .selectFrom('tour_waypoints')
      .select(['lat', 'lng', 'role', 'sequence', 'fixed_leg', 'lock', 'shaping', 'linked_place_id'])
      .where('place_id', '=', place_id)
      .orderBy('sequence', 'asc')
      .execute();
    return rows.map(readWaypoint);
  }

  /** TW2 — every waypoint of a trip's tours, for the trip copy to remap by place. */
  async listForTrip(trip_id: number): Promise<TourWaypointWithPlaceRow[]> {
    const rows = await this.db()
      .selectFrom('tour_waypoints as tw')
      .innerJoin('places as p', 'p.id', 'tw.place_id')
      .select([
        'tw.place_id',
        'tw.lat',
        'tw.lng',
        'tw.role',
        'tw.sequence',
        'tw.fixed_leg',
        'tw.lock',
        'tw.shaping',
        'tw.linked_place_id',
      ])
      .where('p.trip_id', '=', trip_id)
      .orderBy('tw.place_id', 'asc')
      .orderBy('tw.sequence', 'asc')
      .execute();
    return rows.map(({ place_id, ...point }) => ({ place_id, ...readWaypoint(point) }));
  }

  /**
   * TW3 — `INSERT INTO tour_waypoints (place_id, lat, lng, role, sequence, fixed_leg, lock, shaping)
   * VALUES (...)` for each point. The caller owns the transaction: a create
   * writes the tour first, an edit clears the old points first.
   */
  async insertForPlace(place_id: number, waypoints: readonly TourWaypointRow[]): Promise<void> {
    if (waypoints.length === 0) return;
    await this.insertMany(
      waypoints.map((w) => ({
        place: place_id,
        lat: w.lat,
        lng: w.lng,
        role: w.role,
        sequence: w.sequence,
        fixed_leg: w.fixed_leg ? encodeJson(TOUR_WAYPOINT_FIXED_LEG, w.fixed_leg) : null,
        lock: w.lock ? encodeJson(TOUR_WAYPOINT_LOCK, w.lock) : null,
        shaping: w.shaping ? 1 : 0,
        linkedPlace: w.linked_place_id ?? null,
      })),
    );
  }

  /**
   * PR1-10: which of these ids name a place of the trip a waypoint may stand
   * for: a place of that trip that is not itself a tour. An id of another
   * trip, of no place or of a tour is left out alike.
   */
  async linkablePlaceIds(trip_id: number, ids: readonly number[]): Promise<Set<number>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db()
      .selectFrom('places as p')
      .select('p.id')
      .where('p.trip_id', '=', trip_id)
      .where('p.id', 'in', [...new Set(ids)])
      .where((eb) =>
        eb.not(eb.exists(eb.selectFrom('tours as t').select('t.place_id').whereRef('t.place_id', '=', 'p.id'))),
      )
      .execute();
    return new Set(rows.map((row) => row.id));
  }

  /** PR1-10: the names of the places of a trip the given ids stand for, for a reader of the tour. */
  async placeNames(trip_id: number, ids: readonly number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db()
      .selectFrom('places as p')
      .select(['p.id', 'p.name'])
      .where('p.trip_id', '=', trip_id)
      .where('p.id', 'in', [...new Set(ids)])
      .execute();
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** TW4 — `DELETE FROM tour_waypoints WHERE place_id = ?`. */
  async deleteForPlace(place_id: number): Promise<void> {
    await this.nativeDelete({ place: place_id });
  }
}
