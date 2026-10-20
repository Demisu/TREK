import { TourActivities } from '../../db/entities/TourActivities.entity';
import { TourActivityExclusions } from '../../db/entities/TourActivityExclusions.entity';
import { Tours } from '../../db/entities/Tours.entity';
import type { TourActivitiesRepository } from '../../db/repositories/TourActivities.repository';
import type { TourActivityExclusionsRepository } from '../../db/repositories/TourActivityExclusions.repository';
import type { ToursRepository } from '../../db/repositories/Tours.repository';
import { TripMembershipService } from '../trip-membership/trip-membership.service';
import { buildActivityStats } from './tour-activity-stats.helpers';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { TourActivityExclusionRequest, TourActivityStatsResponse } from '@trek/shared';

/**
 * STA-02: the user's own tour activities for the Atlas, across every trip the
 * user can open, and leaving one out of them. Reads only, apart from the
 * user's own exclusions: no tour, day or plan changes here. Every answer is
 * bounded by the trips the user owns or is a member of, read anew for each
 * call; within them only the user's own part counts (see
 * `buildActivityStats`). REST and MCP call these two methods.
 */
@Injectable()
export class TourActivityStatsService {
  constructor(
    private readonly membership: TripMembershipService,
    @InjectRepository(Tours) private readonly toursRepo: ToursRepository,
    @InjectRepository(TourActivities) private readonly activitiesRepo: TourActivitiesRepository,
    @InjectRepository(TourActivityExclusions) private readonly exclusionsRepo: TourActivityExclusionsRepository,
  ) {}

  async stats(userId: number): Promise<TourActivityStatsResponse> {
    const tripIds = await this.membership.listAccessibleTripIds(userId);
    const [executions, tracks, excluded] = await Promise.all([
      this.activitiesRepo.listExecutionsForStats(tripIds, userId),
      this.activitiesRepo.listTracksForStats(tripIds),
      this.exclusionsRepo.listPlaceIds(userId),
    ]);
    return buildActivityStats({ userId, executions, tracks, excluded: new Set(excluded) });
  }

  /**
   * Leaves a tour out of the user's sums, or counts it again, and answers the
   * sums as they are then. The tour must be in a trip the user can open; any
   * other id reads as missing. Only the user's own sums change.
   */
  async setExcluded(userId: number, input: TourActivityExclusionRequest): Promise<TourActivityStatsResponse> {
    const tripIds = await this.membership.listAccessibleTripIds(userId);
    if (!(await this.toursRepo.findForLibrary(tripIds, input.place_id))) throw new NotFoundException('Tour not found');
    if (input.excluded) await this.exclusionsRepo.exclude(userId, input.place_id);
    else await this.exclusionsRepo.include(userId, input.place_id);
    return await this.stats(userId);
  }
}
