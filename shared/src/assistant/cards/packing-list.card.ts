import { z } from 'zod';

/**
 * A packing list: the trip's, a tour's or a template's. Only its kind so far; the packing and to-do
 * cards give it its fields.
 */
export const packingListCardSchema = z.object({ kind: z.literal('packingList') });
export type PackingListCard = z.infer<typeof packingListCardSchema>;
