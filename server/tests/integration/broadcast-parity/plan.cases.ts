import type { CaseGroup } from './types';

const CATALOG = "the admin's category catalog is global: no trip room, and the registry has no event for it";

/**
 * The planner: places, the day plan, days, day notes, categories, and the
 * collection places copied into a trip.
 */
export const plan: CaseGroup = {
  name: 'plan',
  prefix: 'BCP-PLAN',
  cases: [
    {
      tool: 'create_place',
      args: (s) => ({ tripId: s.trip.id, name: 'Sacré-Cœur', lat: 48.8867, lng: 2.3431 }),
      rest: {
        method: 'post',
        path: (s) => `/api/trips/${s.trip.id}/places`,
        body: () => ({ name: 'Sacré-Cœur', lat: 48.8867, lng: 2.3431 }),
      },
      expect: ['place:created'],
    },
    {
      // The assistant's way to book a hotel the trip does not have yet (handoff
      // section 8): every tab, the asking one included, gets the new place, the
      // stay with its partner booking and the check-in stop.
      tool: 'create_place_accommodation',
      args: (s) => ({
        tripId: s.trip.id,
        name: 'Mercure Hotel Berlin City',
        lat: 52.5306,
        lng: 13.3846,
        start_day_id: s.days[0].id,
        end_day_id: s.days[2].id,
        check_in: '15:00',
        check_out: '11:00',
      }),
      twin: 'POST /api/trips/:tripId/places, then POST /api/trips/:tripId/accommodations',
      // The place goes out once, already typed as lodging: the stamp the stay
      // puts on it is not sent again as place:updated.
      expect: [
        'place:created',
        'accommodation:created',
        'reservation:created',
        { event: 'assignment:created', all: true },
        { event: 'assignment:reordered', all: true },
      ],
    },
  ],
  exempt: [
    {
      tool: 'create_category',
      reason: CATALOG,
      actor: 'admin',
      args: (s) => ({ name: `Rooftop bars ${s.n}` }),
    },
    {
      tool: 'update_category',
      reason: CATALOG,
      actor: 'admin',
      needs: ['category'],
      args: (s) => ({ categoryId: s.category.id, name: `Night markets ${s.n}` }),
    },
    {
      tool: 'delete_category',
      reason: CATALOG,
      actor: 'admin',
      needs: ['category'],
      args: (s) => ({ categoryId: s.category.id }),
    },
  ],
  pending: [
    'assign_place_to_day',
    'set_assignment_end_day',
    'unassign_place',
    'clear_day_assignments',
    'update_assignment_time',
    'update_assignment_notes',
    'set_leg_transport_mode',
    'set_assignment_route_excluded',
    'move_assignment',
    'set_assignment_participants',
    'reorder_day_assignments',
    'copy_collection_places_to_trip',
    'create_day_note',
    'update_day_note',
    'delete_day_note',
    'update_day',
    'create_day',
    'reorder_days',
    'delete_day',
    'set_day_default_transport_mode',
    'create_and_assign_place',
    'update_place',
    'set_place_image_from_file',
    'rate_place',
    'delete_place',
    'import_places_from_url',
    'import_trip_gpx',
    'bulk_delete_places',
    'bulk_update_places',
  ],
};
