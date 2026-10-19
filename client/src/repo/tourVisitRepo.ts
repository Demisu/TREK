import type { TourVisitListResponse, TourVisitUpdateRequest } from '@trek/shared';
import { tourVisitsApi } from '../api/tourVisits';
import { requireOnline } from './onlineOnly';

/**
 * CW-03, online only for now: a station checked off is the server's at once,
 * so everyone on the trip sees the same day. Offline the station says so and
 * waits; the client keeps no copy of its own.
 */
export const tourVisitRepo = {
  async list(tripId: number | string): Promise<TourVisitListResponse> {
    requireOnline();
    return await tourVisitsApi.list(tripId);
  },
  async update(
    tripId: number | string,
    assignmentId: number,
    stationKey: string,
    body: TourVisitUpdateRequest
  ): Promise<TourVisitListResponse> {
    requireOnline();
    return await tourVisitsApi.update(tripId, assignmentId, stationKey, body);
  },
};
