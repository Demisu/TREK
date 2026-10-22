import type { DomainCards } from '../card-types';
import { TOUR_DESCRIBERS } from './tour-describe';
import { DELETE_CREATED_TOUR } from './tour-undo';

/**
 * The tours in the assistant chat. A tour is a place with a route: its id is
 * its place's, so a created one is taken back by deleting that place.
 */
export const TOUR_CARDS: DomainCards = {
  id: 'tour',
  tools: {
    create_hike: {
      write: { verbKey: 'addTour', entity: 'tour' },
      describe: TOUR_DESCRIBERS.create_hike,
      undo: DELETE_CREATED_TOUR,
    },
    create_city_walk: {
      write: { verbKey: 'addTour', entity: 'tour' },
      describe: TOUR_DESCRIBERS.create_city_walk,
      undo: DELETE_CREATED_TOUR,
    },
    update_tour: { write: { verbKey: 'updateTour', entity: 'tour' }, describe: TOUR_DESCRIBERS.update_tour },
    import_tour_gpx: { write: { verbKey: 'importTour', entity: 'tour' }, describe: TOUR_DESCRIBERS.import_tour_gpx },
  },
};
