import { z } from 'zod';

/**
 * Polls of the trip chat with their options. Only its kind so far; the trip chat cards give it its
 * fields.
 */
export const collabPollsCardSchema = z.object({ kind: z.literal('collabPolls') });
export type CollabPollsCard = z.infer<typeof collabPollsCardSchema>;
