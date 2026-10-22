import { z } from 'zod';

/** Entries of the bucket list. Only its kind so far; the atlas cards give it its fields. */
export const atlasBucketCardSchema = z.object({ kind: z.literal('atlasBucket') });
export type AtlasBucketCard = z.infer<typeof atlasBucketCardSchema>;
