import { z } from 'zod';

/**
 * A road trip's drive with its days and stops. Only its kind so far; the road trip cards give it its
 * fields.
 */
export const roadtripCardSchema = z.object({ kind: z.literal('roadtrip') });
export type RoadtripCard = z.infer<typeof roadtripCardSchema>;
