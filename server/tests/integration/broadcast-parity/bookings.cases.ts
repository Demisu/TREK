import type { CaseGroup } from './types';

/** Bookings: reservations, transports, transit, stays and the AirTrail import. */
export const bookings: CaseGroup = {
  name: 'bookings',
  prefix: 'BCP-BOOK',
  cases: [
    {
      tool: 'create_accommodation',
      needs: ['place'],
      args: (s) => ({
        tripId: s.trip.id,
        place_id: s.place.id,
        start_day_id: s.days[0].id,
        end_day_id: s.days[1].id,
      }),
      rest: {
        method: 'post',
        path: (s) => `/api/trips/${s.trip.id}/accommodations`,
        body: (s) => ({ place_id: s.place.id, start_day_id: s.days[0].id, end_day_id: s.days[1].id }),
      },
      // The stay, the ping for its partner hotel booking, then the check-in stop
      // the day plan gains (with the stop's time stamped on the hotel place),
      // which the booking tab has not drawn yet either.
      expect: [
        'accommodation:created',
        'reservation:created',
        { event: 'assignment:created', all: true },
        { event: 'place:updated', all: true },
        { event: 'assignment:reordered', all: true },
      ],
    },
  ],
  exempt: [],
  pending: [
    'update_accommodation',
    'delete_accommodation',
    'import_airtrail_flights',
    'create_reservation',
    'update_reservation',
    'delete_reservation',
    'set_reservation_travelers',
    'reorder_reservations',
    'link_hotel_accommodation',
    'create_transport',
    'update_transport',
    'delete_transport',
    'create_transit_journey',
  ],
};
