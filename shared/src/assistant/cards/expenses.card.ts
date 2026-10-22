import { z } from 'zod';

/**
 * Expenses of the trip, with who paid and who shares them. Only its kind so far; the budget cards give
 * it its fields.
 */
export const expensesCardSchema = z.object({ kind: z.literal('expenses') });
export type ExpensesCard = z.infer<typeof expensesCardSchema>;
