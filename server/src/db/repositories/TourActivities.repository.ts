import type { TourActivities } from '../entities/TourActivities.entity';
import type { DB } from '../kysely/db';
import { TrekRepository } from './_shared/trek-repository';

type ActivitiesDB = Pick<DB, 'tour_activities' | 'tours' | 'places' | 'day_assignments'>;

/** One assignment of a recording to a tour, as the trip's tour list names it. */
export interface TourActivityRefRow {
  id: number;
  place_id: number;
  track_place_id: number;
  assignment_id: number | null;
}

/**
 * One assignment with what the detail shows of its recording: the name and
 * provenance it has in the trip, its line (the place's, or the line it kept
 * when it was planned over since), and the times the import read off it.
 */
export interface TourActivityRow extends TourActivityRefRow {
  day_id: number | null;
  assigned_at: string;
  track_name: string;
  track_origin: string;
  track_file_name: string | null;
  track_created_at: string | null;
  track_route_geometry: string | null;
  track_recorded_route_geometry: string | null;
  track_started_at: string | null;
  track_ended_at: string | null;
}

/** What an assignment writes: the tour, its recording, the execution and who confirmed it. */
interface TourActivityInsert {
  place_id: number;
  track_place_id: number;
  assignment_id: number | null;
  assigned_by: number | null;
}

/**
 * `tour_activities` (ACT-01): the recordings assigned to the tours of a trip.
 * Every read here is scoped to one trip through both tours' places, so a row
 * never reaches across trips even if an id does. Kysely throughout: the reads
 * join the tours and places of both sides.
 */
export class TourActivitiesRepository extends TrekRepository<TourActivities> {
  private db() {
    return this.kysely<ActivitiesDB>();
  }

  /** The assignments of one tour of the trip, with their recordings, oldest first. */
  async listForPlace(trip_id: number, place_id: number): Promise<TourActivityRow[]> {
    return await this.db()
      .selectFrom('tour_activities as a')
      .innerJoin('places as p', 'p.id', 'a.place_id')
      .innerJoin('places as tp', 'tp.id', 'a.track_place_id')
      .innerJoin('tours as tt', 'tt.place_id', 'a.track_place_id')
      .leftJoin('day_assignments as da', 'da.id', 'a.assignment_id')
      .select([
        'a.id as id',
        'a.place_id as place_id',
        'a.track_place_id as track_place_id',
        'a.assignment_id as assignment_id',
        'da.day_id as day_id',
        'a.assigned_at as assigned_at',
        'tp.name as track_name',
        'tt.origin as track_origin',
        'tt.origin_file_name as track_file_name',
        'tt.created_at as track_created_at',
        'tp.route_geometry as track_route_geometry',
        'tt.recorded_route_geometry as track_recorded_route_geometry',
        'tt.track_started_at as track_started_at',
        'tt.track_ended_at as track_ended_at',
      ])
      .where('a.place_id', '=', place_id)
      .where('p.trip_id', '=', trip_id)
      .where('tp.trip_id', '=', trip_id)
      .orderBy('a.id', 'asc')
      .execute();
  }

  /** Every assignment between tours of the trip, for its tour list. */
  async listForTrip(trip_id: number): Promise<TourActivityRefRow[]> {
    return await this.db()
      .selectFrom('tour_activities as a')
      .innerJoin('places as p', 'p.id', 'a.place_id')
      .select(['a.id', 'a.place_id', 'a.track_place_id', 'a.assignment_id'])
      .where('p.trip_id', '=', trip_id)
      .orderBy('a.id', 'asc')
      .execute();
  }

  /** The assignment a recording is part of, whichever tour it documents; undefined while it documents none. */
  async findByTrack(track_place_id: number): Promise<TourActivityRefRow | undefined> {
    return await this.db()
      .selectFrom('tour_activities')
      .select(['id', 'place_id', 'track_place_id', 'assignment_id'])
      .where('track_place_id', '=', track_place_id)
      .executeTakeFirst();
  }

  /** Whether a tour has any recording assigned to it. */
  async hasActivities(place_id: number): Promise<boolean> {
    const row = await this.db()
      .selectFrom('tour_activities')
      .select('id')
      .where('place_id', '=', place_id)
      .executeTakeFirst();
    return !!row;
  }

  /**
   * Clears the way for a new assignment of `track_place_id` to this execution
   * of the tour: the recording the execution had, and the execution this
   * recording had on the same tour. Inside the caller's transaction, before
   * {@link insertActivity}.
   */
  async clearFor(place_id: number, track_place_id: number, assignment_id: number | null): Promise<void> {
    await this.db()
      .deleteFrom('tour_activities')
      .where('place_id', '=', place_id)
      .where((eb) =>
        eb.or([
          assignment_id === null ? eb('assignment_id', 'is', null) : eb('assignment_id', '=', assignment_id),
          eb('track_place_id', '=', track_place_id),
        ]),
      )
      .execute();
  }

  /** Writes one assignment and answers its id. */
  async insertActivity(input: TourActivityInsert): Promise<number> {
    const row = await this.db().insertInto('tour_activities').values(input).returning('id').executeTakeFirstOrThrow();
    return row.id;
  }

  /** Removes one assignment of this tour; answers whether there was one. */
  async removeFromPlace(place_id: number, id: number): Promise<boolean> {
    const result = await this.db()
      .deleteFrom('tour_activities')
      .where('id', '=', id)
      .where('place_id', '=', place_id)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }
}
