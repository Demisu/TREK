import { z } from 'zod';

/**
 * A file the user attached in the trip chat, as the conversation knows it.
 *
 * The server keeps the file with the thread under a random id, which the
 * message's `attachment` part carries. The id never reaches anything but the
 * thread it was attached in: every read answers an id of another thread or
 * another user the way it answers one that does not exist.
 */
export const assistantAttachmentIdSchema = z.uuid();
export type AssistantAttachmentId = z.infer<typeof assistantAttachmentIdSchema>;
