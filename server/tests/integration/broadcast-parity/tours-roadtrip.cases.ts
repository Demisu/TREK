import type { CaseGroup } from './types';

/** Tours and road trips: city walks, hikes and their library, route vias, day boundaries and the Google route import. */
export const toursRoadtrip: CaseGroup = {
  name: 'tours-roadtrip',
  prefix: 'BCP-TOURS',
  cases: [],
  exempt: [],
  pending: [
    'set_day_boundary',
    'import_google_maps_route',
    'update_roadtrip_settings',
    'add_route_via',
    'add_route_vias',
    'reanchor_route_vias',
    'remove_route_via',
    'update_route_via',
    'create_city_walk',
    'save_tour_to_collection',
    'take_over_collection_tour',
    'delete_collection_tour',
    'assign_tour_track',
    'unassign_tour_track',
    'set_tour_activity_excluded',
    'undo_tour_change',
    'save_tour_change',
    'take_over_tour',
    'link_tour_packing',
    'unlink_tour_packing',
    'create_hike',
    'update_tour',
    'import_tour_gpx',
  ],
};
