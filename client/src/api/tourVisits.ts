import type { TourVisitListResponse, TourVisitUpdateRequest } from '@trek/shared';
import apiClient from './client';

/** CW-03: the stations of a trip's city walks visited or skipped on their days. */
export const tourVisitsApi = {
  list: (tripId: number | string): Promise<TourVisitListResponse> =>
    apiClient.get(`/trips/${tripId}/tour-visits`).then((r) => r.data),
  update: (
    tripId: number | string,
    assignmentId: number,
    stationKey: string,
    body: TourVisitUpdateRequest
  ): Promise<TourVisitListResponse> =>
    apiClient
      .put(`/trips/${tripId}/tour-visits/${assignmentId}/${encodeURIComponent(stationKey)}`, body)
      .then((r) => r.data),
};
