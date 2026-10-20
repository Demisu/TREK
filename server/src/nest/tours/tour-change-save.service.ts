import { TourChangeSteps } from '../../db/entities/TourChangeSteps.entity';
import { TOUR_CHANGE_STEP_BEFORE, TOUR_CHANGE_STEP_CHANGES } from '../../db/json-columns';
import type { TourChangeStepsRepository } from '../../db/repositories/TourChangeSteps.repository';
import { encodeJson } from '../../utils/json-column';
import { DomainError } from '../common/domain-error';
import { UnitOfWork } from '../database/unit-of-work';
import type { FootWay } from './city-walk-briefing.helpers';
import { CityWalkFootWayService } from './city-walk-foot-way.service';
import type { DraftPoint } from './tour-change-apply';
import { asWaypoint } from './tour-change-effects';
import { TourChangePreviewService } from './tour-change-preview.service';
import { proposalIdOf } from './tour-change-proposal';
import { ToursService, type TourCreateCommand } from './tours.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import {
  plannableTourTypeSchema,
  walkStationsOf,
  type TourChangeSaveRequest,
  type TourDetailResponse,
  type TourListItem,
  type TourWaypoint,
} from '@trek/shared';

/** The refusal of a save naming a proposal other than the one these changes were prepared as. */
export const TOUR_CHANGE_NOT_PREPARED = 'tour_change_not_prepared';

/** What a save writes: the tour as read, the points after the changes and the way on foot through them. */
interface ChangedTour {
  tour: TourListItem;
  points: readonly DraftPoint[];
  way: FootWay;
  preparedOn: number;
}

/** The step a save recorded: its id and the revision it raised the tour to. */
interface SavedStep {
  id: number;
  revision: number;
}

/**
 * The write of a confirmed change: the points after it, the way on foot the
 * router planned through them, and the tour's own name, type and options as
 * they are, so a change of stations changes nothing else. Without a way the
 * walk keeps its stations only, as a created one does (CW-11): no line, no
 * distance and no walking time until the planner plans the way.
 */
function writeOf({ tour, points, way, preparedOn }: ChangedTour): TourCreateCommand {
  const routed = way.kind === 'routed' ? way : null;
  return {
    name: tour.name,
    // Only a type that takes changes gets here, and each of them is one the planner draws.
    tour_type: plannableTourTypeSchema.parse(tour.tour_type),
    route_geometry: routed?.line ?? null,
    duration_seconds: routed?.seconds ?? null,
    waypoints: points.map(asWaypoint),
    max_hiking_difficulty: tour.max_hiking_difficulty,
    hiking_preferences: tour.hiking_preferences,
    bike_profile: tour.bike_profile,
    boat_type: tour.boat_type,
    water_context: tour.water_context,
    paddle_speed_kmh: tour.paddle_speed_kmh,
    portage_speed_kmh: tour.portage_speed_kmh,
    paddle_lake_style: tour.paddle_lake_style,
    expected_revision: preparedOn,
  };
}

/** The saved tour as the answer gives it, read back through the read the app uses. */
function savedAnswer(detail: TourDetailResponse, step: SavedStep, { way, preparedOn }: ChangedTour) {
  return {
    saved: true as const,
    step: { id: step.id, base_revision: preparedOn, revision: step.revision },
    tour: {
      place_id: detail.tour.place_id,
      name: detail.tour.name,
      tour_type: detail.tour.tour_type,
      revision: step.revision,
      distance_km: detail.tour.distance,
      walking_minutes: detail.tour.duration,
      route_pending: detail.tour.route_pending === true,
    },
    foot_way:
      way.kind === 'routed'
        ? { planned: true as const }
        : { planned: false as const, why: way.why, position: way.position },
    stations: walkStationsOf(detail.waypoints).map((station, index) => ({
      position: index + 1,
      key: station.key ?? null,
      name: station.name ?? null,
    })),
  };
}

/**
 * MCP-T03: a prepared change the traveller confirmed, saved whole or not at
 * all through the write the planner's save uses. The save names the revision
 * the proposal was prepared on (P2C-03, the one revision a tour has) and the
 * proposal's id, so only the very proposal shown is saved, and never over a
 * tour that has moved on. The changes are laid again on the tour as it is, by
 * the same rules: first to plan the way on foot, then once more inside the
 * write, so a station visited or a place gone in between refuses the save
 * instead of being written over, and a failure leaves the tour as it was.
 *
 * The write records the step: the proposal, both revisions, the changes and
 * the tour as it was before them (its line, its points, its measures), so it
 * can be followed and taken back (MCP-T04). Nothing of the conversation is
 * kept. A new city walk has no revision to name: it is created through
 * create_city_walk (CW-11), never saved as a change.
 */
@Injectable()
export class TourChangeSaveService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tours: ToursService,
    private readonly preview: TourChangePreviewService,
    private readonly footWays: CityWalkFootWayService,
    @InjectRepository(TourChangeSteps) private readonly stepsRepo: TourChangeStepsRepository,
  ) {}

  async save(tripId: number, placeId: number, userId: number, request: TourChangeSaveRequest) {
    const { changes, expected_revision: preparedOn, proposal_id: proposalId } = request;
    if (proposalId !== proposalIdOf({ tripId, placeId, revision: preparedOn, changes })) {
      throw new DomainError(
        422,
        'These changes are not the proposal that was prepared. Nothing was saved: save the changes and the revision exactly as prepare_tour_change answered them, or prepare the change again.',
        { code: TOUR_CHANGE_NOT_PREPARED },
      );
    }
    const laid = await this.preview.lay(tripId, placeId, changes, preparedOn);
    const way = await this.footWays.plan(userId, tripId, laid.outcome.points);
    const changed: ChangedTour = { tour: laid.tour, points: laid.outcome.points, way, preparedOn };
    const write = await this.tours.routeWrite(writeOf(changed));
    const saved = await this.uow.transactional(async () => {
      // Laid once more on the tour as it is now: a tour moved on, a station done or a place gone refuses here.
      const now = await this.preview.lay(tripId, placeId, changes, preparedOn);
      const before = await this.beforeState(tripId, placeId, now);
      const { revision, visitsDropped } = await this.tours.replaceRoute(tripId, placeId, write);
      const id = await this.stepsRepo.record({
        place_id: placeId,
        proposal_id: proposalId,
        base_revision: preparedOn,
        revision,
        changes: encodeJson(TOUR_CHANGE_STEP_CHANGES, changes),
        before_state: before,
        saved_by: userId,
      });
      return { step: { id, revision }, visitsDropped };
    });
    const detail = await this.tours.announceRouteUpdate(String(tripId), placeId, saved.visitsDropped);
    return savedAnswer(detail, saved.step, changed);
  }

  /** The tour as it is before the change, as the step keeps it: its line, its points and its measures. */
  private async beforeState(
    tripId: number,
    placeId: number,
    { tour, waypoints }: { tour: TourListItem; waypoints: TourWaypoint[] },
  ): Promise<string> {
    const line = await this.tours.savedLine(tripId, placeId);
    return encodeJson(TOUR_CHANGE_STEP_BEFORE, {
      route_geometry: line.length > 0 ? line : null,
      waypoints,
      distance: tour.distance,
      duration: tour.duration,
      elevation_gain: tour.elevation_gain,
      elevation_loss: tour.elevation_loss,
    });
  }
}
