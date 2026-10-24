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

/**
 * What the model calls `read_attached_file` with: the attachment, by the id
 * the user's message names. The server adds the file's name and where its
 * text would go to the held call before the user sees it; those are no input.
 */
export const assistantReadAttachedFileArgsSchema = z.object({
  attachmentId: assistantAttachmentIdSchema,
});
export type AssistantReadAttachedFileArgs = z.infer<typeof assistantReadAttachedFileArgsSchema>;
