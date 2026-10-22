import { z } from 'zod';

/**
 * What lies along a drive, within reach of its route. Only its kind so far; the road trip cards give
 * it its fields.
 */
export const corridorCardSchema = z.object({ kind: z.literal('corridor') });
export type CorridorCard = z.infer<typeof corridorCardSchema>;
