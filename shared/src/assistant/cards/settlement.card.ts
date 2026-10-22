import { z } from 'zod';

/** Who pays whom to settle up. Only its kind so far; the budget cards give it its fields. */
export const settlementCardSchema = z.object({ kind: z.literal('settlement') });
export type SettlementCard = z.infer<typeof settlementCardSchema>;
