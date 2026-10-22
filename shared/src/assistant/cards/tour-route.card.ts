import { z } from 'zod';

/**
 * A tour's route: a hike, a city walk, a paddle or a ski plan the assistant proposed, or a saved tour
 * it read. Only its kind so far; the tours cards give it its fields.
 */
export const tourRouteCardSchema = z.object({ kind: z.literal('tourRoute') });
export type TourRouteCard = z.infer<typeof tourRouteCardSchema>;
