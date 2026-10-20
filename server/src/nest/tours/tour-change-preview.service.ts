import { TourStationVisits } from '../../db/entities/TourStationVisits.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import type { TourStationVisitsRepository } from '../../db/repositories/TourStationVisits.repository';
import type { TourWaypointsRepository } from '../../db/repositories/TourWaypoints.repository';
import { DomainError } from '../common/domain-error';
import { CityWalkFootWayService } from './city-walk-foot-way.service';
import { applyChanges, refusalText, type StationDone } from './tour-change-apply';
import { describeChange } from './tour-change-effects';
import { ToursService } from './tours.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import type { TourChange, TourChangeRequest } from '@trek/shared';

/** The refusal of a proposal the rules of its tour do not allow; its text names every change and why. */
export const TOUR_CHANGE_REFUSED = 'tour_change_refused';

/** The places of the trip the new stations of a proposal name. */
function linkedIds(changes: readonly TourChange[]): number[] {
  return changes.flatMap((change) => {
    const id = 'station' in change ? change.station.linked_place_id : null;
    return id ? [id] : [];
  });
}

/** The stations visited or skipped on any day of the walk, by key, each with the days. */
function doneByKey(visits: ReadonlyArray<StationDone & { station_key: string }>): Map<string, StationDone[]> {
  const done = new Map<string, StationDone[]>();
  for (const { station_key, day_id, status } of visits) {
    done.set(station_key, [...(done.get(station_key) ?? []), { day_id, status }]);
  }
  return done;
}

/**
 * MCP-T02: a change to a saved tour prepared for the traveller to review.
 * It reads the saved tour, the visits of all its days and the places the new
 * stations name, lays the changes onto the saved points by the rules of the
 * tour's type and works out the effects with the way on foot the router
 * plans before and after. It writes nothing: no tour, station, visit or day
 * plan changes, and turning the proposal down leaves the plan as it is. The
 * proposal names the revision it was prepared on, so a save of it can be
 * refused once the tour has moved on.
 */
@Injectable()
export class TourChangePreviewService {
  constructor(
    private readonly tours: ToursService,
    private readonly footWays: CityWalkFootWayService,
    @InjectRepository(TourStationVisits) private readonly visitsRepo: TourStationVisitsRepository,
    @InjectRepository(TourWaypoints) private readonly waypointsRepo: TourWaypointsRepository,
  ) {}

  async prepare(tripId: number, placeId: number, userId: number, { changes }: TourChangeRequest) {
    const { tour, waypoints } = await this.tours.getTour(String(tripId), String(placeId));
    const [visits, linkable] = await Promise.all([
      this.visitsRepo.listForPlace(tripId, placeId),
      this.waypointsRepo.linkablePlaceIds(tripId, linkedIds(changes)),
    ]);
    const outcome = applyChanges(
      {
        tourType: tour.tour_type,
        recorded: tour.has_waypoints !== true,
        points: waypoints,
        done: doneByKey(visits),
        linkable,
      },
      changes,
    );
    if (outcome.kind === 'refused') {
      throw new DomainError(422, refusalText(outcome.refused), {
        code: TOUR_CHANGE_REFUSED,
        details: { refused: outcome.refused },
      });
    }
    const [wayBefore, wayAfter] = await Promise.all([
      this.footWays.plan(userId, tripId, waypoints),
      this.footWays.plan(userId, tripId, outcome.points),
    ]);
    return {
      prepared_only: true,
      base: { place_id: tour.place_id, name: tour.name, tour_type: tour.tour_type, revision: tour.revision ?? null },
      changes,
      ...describeChange({
        saved: waypoints,
        after: outcome.points,
        removed: outcome.removed,
        replaced: outcome.replaced,
        wayBefore,
        wayAfter,
        stored: { distance_km: tour.distance, walking_minutes: tour.duration },
      }),
    };
  }
}
