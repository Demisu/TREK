import { z } from 'zod';

/**
 * A public transport journey with its legs and times. Only its kind so far; the road trip cards give
 * it its fields.
 */
export const transitCardSchema = z.object({ kind: z.literal('transit') });
export type TransitCard = z.infer<typeof transitCardSchema>;
