import { z } from 'zod';

/** Places of a collection. Only its kind so far; the collections cards give it its fields. */
export const collectionPlacesCardSchema = z.object({ kind: z.literal('collectionPlaces') });
export type CollectionPlacesCard = z.infer<typeof collectionPlacesCardSchema>;
