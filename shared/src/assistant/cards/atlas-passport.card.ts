import { z } from 'zod';

/**
 * The countries and regions a user has been to. Only its kind so far; the atlas cards give it its
 * fields.
 */
export const atlasPassportCardSchema = z.object({ kind: z.literal('atlasPassport') });
export type AtlasPassportCard = z.infer<typeof atlasPassportCardSchema>;
