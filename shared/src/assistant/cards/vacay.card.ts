import { z } from 'zod';

/**
 * Vacation days on a month calendar, with the days left. Only its kind so far; the vacation planner
 * cards give it its fields.
 */
export const vacayCardSchema = z.object({ kind: z.literal('vacay') });
export type VacayCard = z.infer<typeof vacayCardSchema>;
