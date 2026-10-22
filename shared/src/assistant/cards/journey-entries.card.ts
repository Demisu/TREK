import { z } from 'zod';

/** Entries of a travel journal. Only its kind so far; the travel journal cards give it its fields. */
export const journeyEntriesCardSchema = z.object({ kind: z.literal('journeyEntries') });
export type JourneyEntriesCard = z.infer<typeof journeyEntriesCardSchema>;
