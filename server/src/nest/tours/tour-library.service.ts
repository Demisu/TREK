import { Tours } from '../../db/entities/Tours.entity';
import type { ToursRepository, TourLibraryRow } from '../../db/repositories/Tours.repository';
import { TripMembershipService } from '../trip-membership/trip-membership.service';
import { parseRouteGeometry } from './tours.helpers';
import { ToursService } from './tours.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TOUR_LIBRARY_LIMIT,
  TOUR_LIBRARY_PREVIEW_POINTS,
  type TourCreateResponse,
  type TourLibraryDetailResponse,
  type TourLibraryItem,
  type TourLibraryQuery,
  type TourLibraryResponse,
  type TourOrigin,
  type TourTakeOverRequest,
  type TourTypeKey,
} from '@trek/shared';

/** The most rows one list reads before the name is matched; past it the answer says it was cut. */
const LIBRARY_READ_LIMIT = 2000;

function toItem(row: TourLibraryRow): TourLibraryItem {
  return {
    place_id: row.place_id,
    name: row.name,
    description: row.description,
    tour_type: row.tour_type as TourTypeKey,
    distance: row.distance,
    elevation_gain: row.elevation_gain,
    elevation_loss: row.elevation_loss,
    duration: row.duration,
    planned_duration_minutes: row.planned_duration_minutes,
    break_additional_minutes: row.break_additional_minutes,
    max_hiking_difficulty: row.max_hiking_difficulty,
    has_waypoints: row.has_waypoints === 1,
    origin: row.origin as TourOrigin,
    trip: { id: row.trip_id, title: row.trip_title },
  };
}

/** Every `step`-th point of a line, its last point always kept, so a preview draws the whole tour lightly. */
function thinned(line: Array<[number, number]>, most: number): Array<[number, number]> {
  if (line.length <= most) return line;
  const step = (line.length - 1) / (most - 1);
  return Array.from({ length: most }, (_, index) => Math.min(line.length - 1, Math.round(index * step))).flatMap(
    (index) => {
      const point = line[index];
      return point ? [point] : [];
    },
  );
}

/**
 * LIB-02: the tours of every other trip the user can open, to take one over
 * into the trip they are planning. Listing and previewing read only. Every
 * answer is bounded by the trips the user owns or is a member of, read anew
 * for each call: a tour of a trip out of reach is "not found", never a hint
 * that it exists. Heights, times and distances are passed on as they are
 * stored, null staying null.
 */
@Injectable()
export class TourLibraryService {
  constructor(
    @InjectRepository(Tours) private readonly toursRepo: ToursRepository,
    private readonly membership: TripMembershipService,
    private readonly tours: ToursService,
  ) {}

  private async reachableTrips(userId: number, exclude?: number): Promise<number[]> {
    const ids = await this.membership.listAccessibleTripIds(userId);
    return exclude === undefined ? ids : ids.filter((id) => id !== exclude);
  }

  /**
   * The name is matched here, ignoring case, so a "%" or "_" in it is just a
   * character; the read below it is bounded, and the answer says when the
   * list was cut.
   */
  async list(userId: number, query: TourLibraryQuery): Promise<TourLibraryResponse> {
    const tripIds = await this.reachableTrips(userId, query.exclude_trip_id);
    const [rows, trips] = await Promise.all([
      this.toursRepo.listForLibrary(tripIds, { tour_type: query.type, trip_id: query.trip_id }, LIBRARY_READ_LIMIT),
      this.toursRepo.countForLibrary(tripIds),
    ]);
    const needle = query.q?.toLocaleLowerCase();
    const matching = needle ? rows.filter((row) => row.name.toLocaleLowerCase().includes(needle)) : rows;
    return {
      tours: matching.slice(0, TOUR_LIBRARY_LIMIT).map(toItem),
      trips,
      truncated: matching.length > TOUR_LIBRARY_LIMIT || rows.length === LIBRARY_READ_LIMIT,
    };
  }

  async detail(userId: number, placeId: number): Promise<TourLibraryDetailResponse> {
    const row = await this.toursRepo.findForLibrary(await this.reachableTrips(userId), placeId);
    if (!row) throw new NotFoundException('Tour not found');
    const line = parseRouteGeometry(row.route_geometry).map((point): [number, number] => [point[0], point[1]]);
    return { tour: toItem(row), line: thinned(line, TOUR_LIBRARY_PREVIEW_POINTS), waypoint_count: row.waypoint_count };
  }

  /**
   * The copy into `tripId`, whose access and write permission the caller's
   * guard has checked; the source trip's access is checked here, against the
   * user's trips as they are now, not as they were when the list was read.
   */
  async takeOver(
    tripId: string,
    userId: number,
    body: TourTakeOverRequest,
    socketId?: string,
  ): Promise<TourCreateResponse> {
    const reachable = await this.reachableTrips(userId);
    const source = reachable.includes(body.source_trip_id)
      ? await this.toursRepo.findForLibrary([body.source_trip_id], body.source_place_id)
      : undefined;
    if (!source) throw new NotFoundException('Tour not found');
    return await this.tours.takeOverTour(
      tripId,
      { tripId: source.trip_id, placeId: source.place_id, tripTitle: source.trip_title, tourName: source.name },
      body.name ?? source.name,
      socketId,
    );
  }
}
