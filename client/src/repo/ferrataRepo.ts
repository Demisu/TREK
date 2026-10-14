import { type FerratasResponse, ferratasResponseSchema } from '@trek/shared';

import { ferratasApi } from '../api/ferratas';
import { isEffectivelyOffline } from '../sync/networkMode';

/**
 * Via ferratas from OpenStreetMap, for the map layer.
 *
 * **Deliberately online-only, and no Dexie table.** The answer is a live read
 * of OpenStreetMap through Overpass for whatever area the map shows; a cached
 * copy would be stale data for an area the user has long panned away from, and
 * the server keeps nothing either. Same shape and reason as
 * `roadtripHazardsRepo` and `pluginPoiRepo`.
 *
 * Offline (by circumstance or by the manual switch) the request is not made at
 * all. The answer is parsed against the shared contract rather than cast,
 * because its names and grades go on to be drawn on the map.
 */
export const ferrataRepo = {
  async list(tripId: number, bbox: string, signal: AbortSignal): Promise<FerratasResponse> {
    if (isEffectivelyOffline()) throw new Error('Via ferratas need a connection');
    return ferratasResponseSchema.parse(await ferratasApi.list(tripId, bbox, signal));
  },
};
