import { z } from 'zod';

/** One day's route between its places. Only its kind so far; the road trip cards give it its fields. */
export const dayRouteCardSchema = z.object({ kind: z.literal('dayRoute') });
export type DayRouteCard = z.infer<typeof dayRouteCardSchema>;
