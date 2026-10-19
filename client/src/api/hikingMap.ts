import type { AdminFeatureToggleResponse } from '@trek/shared';
import apiClient from './client';

/** MAP-01: the admin's switch for OpenHikingMap in the Tours planner. */
export const hikingMapAdminApi = {
  get: (): Promise<AdminFeatureToggleResponse> => apiClient.get('/admin/tours-hiking-map').then((r) => r.data),
  update: (enabled: boolean): Promise<AdminFeatureToggleResponse> =>
    apiClient.put('/admin/tours-hiking-map', { enabled }).then((r) => r.data),
};
