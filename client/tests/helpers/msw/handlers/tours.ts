import { tourPackingLinkResponseSchema, tourVisitListResponseSchema } from '@trek/shared';
import { contractHandler } from '../contract';

export const toursHandlers = [
  // CW-03: a trip opened with Tours on reads the visits of its city walks; none is checked off unless a test says so.
  contractHandler('get', '/api/trips/:id/tour-visits', { response: tourVisitListResponseSchema }, () => ({
    visits: [],
  })),
  // P2D-XD-01: a tour's detail reads its packing link; a tour points at none unless a test says so.
  contractHandler('get', '/api/trips/:id/tours/:placeId/packing-link', { response: tourPackingLinkResponseSchema }, () => ({
    packing_link: null,
  })),
];
