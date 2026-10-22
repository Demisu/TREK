import { z } from 'zod';

/** What the trip costs each traveller. Only its kind so far; the budget cards give it its fields. */
export const costPerPersonCardSchema = z.object({ kind: z.literal('costPerPerson') });
export type CostPerPersonCard = z.infer<typeof costPerPersonCardSchema>;
