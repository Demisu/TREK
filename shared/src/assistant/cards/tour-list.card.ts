import { z } from 'zod';

/** The tours of a trip or of one of its days. Only its kind so far; the tours cards give it its fields. */
export const tourListCardSchema = z.object({ kind: z.literal('tourList') });
export type TourListCard = z.infer<typeof tourListCardSchema>;
