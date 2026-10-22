import { z } from 'zod';

/**
 * Charging stops for an electric car along a drive. Only its kind so far; the road trip cards give it
 * its fields.
 */
export const chargingCardSchema = z.object({ kind: z.literal('charging') });
export type ChargingCard = z.infer<typeof chargingCardSchema>;
