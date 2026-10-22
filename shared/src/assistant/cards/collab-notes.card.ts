import { z } from 'zod';

/** Shared notes of the trip. Only its kind so far; the trip chat cards give it its fields. */
export const collabNotesCardSchema = z.object({ kind: z.literal('collabNotes') });
export type CollabNotesCard = z.infer<typeof collabNotesCardSchema>;
