import { z } from 'zod';

/** The collections a user keeps. Only its kind so far; the collections cards give it its fields. */
export const collectionListsCardSchema = z.object({ kind: z.literal('collectionLists') });
export type CollectionListsCard = z.infer<typeof collectionListsCardSchema>;
