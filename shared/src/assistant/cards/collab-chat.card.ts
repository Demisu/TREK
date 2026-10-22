import { z } from 'zod';

/**
 * Messages of the trip chat, as the chat shows them. Only its kind so far; the trip chat cards give it
 * its fields.
 */
export const collabChatCardSchema = z.object({ kind: z.literal('collabChat') });
export type CollabChatCard = z.infer<typeof collabChatCardSchema>;
