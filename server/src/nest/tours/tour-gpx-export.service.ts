import { Places } from '../../db/entities/Places.entity';
import { Tours } from '../../db/entities/Tours.entity';
import type { PlacesRepository } from '../../db/repositories/Places.repository';
import type { ToursRepository } from '../../db/repositories/Tours.repository';
import { DomainError } from '../common/domain-error';
import { toRowId } from '../common/row-id';
import { PlaceImportService } from '../place-import/place-import.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaddleBoatType } from '@trek/shared';

/** What GPX calls the activity in a track's <type>; a paddle tour says what it is paddled in. */
const PADDLE_ACTIVITY: Record<PaddleBoatType, string> = {
  kayak: 'kayaking',
  canoe: 'canoeing',
  sup: 'stand_up_paddling',
  other: 'paddling',
};

export function gpxActivityOf(type: string, boat: string | null): string {
  if (type === 'kayak') return PADDLE_ACTIVITY[(boat ?? 'other') as PaddleBoatType] ?? PADDLE_ACTIVITY.other;
  return type === 'hike' ? 'hiking' : type;
}

/**
 * PR1-06A: one saved tour as a GPX file, its whole saved line with the heights
 * it has. A read: nothing about the tour, its days or where it came from
 * changes, and a tour without a line of its own is refused rather than written
 * as a file that imports as nothing.
 */
@Injectable()
export class TourGpxExportService {
  constructor(
    @InjectRepository(Tours) private readonly toursRepo: ToursRepository,
    @InjectRepository(Places) private readonly placesRepo: PlacesRepository,
    private readonly placeImport: PlaceImportService,
  ) {}

  async export(tripId: string, placeId: string): Promise<{ gpx: string; filename: string }> {
    const tid = toRowId(tripId);
    const pid = toRowId(placeId);
    const tour = tid !== null && pid !== null ? await this.toursRepo.findInTrip(tid, pid) : undefined;
    const place = tour && tid !== null ? await this.placesRepo.findInTrip(tour.place_id, tid) : undefined;
    if (!tour || !place) throw new NotFoundException('Tour not found');

    const gpx = this.placeImport.writeTourGpx({
      name: tour.name,
      description: tour.description ?? null,
      website: tour.website ?? null,
      activity: gpxActivityOf(tour.tour_type, tour.boat_type),
      route_geometry: place.route_geometry ?? null,
      stops: [],
    });
    if (!gpx) {
      throw new DomainError(422, 'This tour has no route to export', { code: 'tour_without_route' });
    }
    return { gpx, filename: this.placeImport.tourGpxFilename(tour.name) };
  }
}
