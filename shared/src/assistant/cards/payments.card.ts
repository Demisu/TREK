import { z } from 'zod';

/** Payments between the travellers. Only its kind so far; the budget cards give it its fields. */
export const paymentsCardSchema = z.object({ kind: z.literal('payments') });
export type PaymentsCard = z.infer<typeof paymentsCardSchema>;
