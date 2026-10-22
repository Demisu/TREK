import { z } from 'zod';

/** One country of the atlas. Only its kind so far; the atlas cards give it its fields. */
export const atlasCountryCardSchema = z.object({ kind: z.literal('atlasCountry') });
export type AtlasCountryCard = z.infer<typeof atlasCountryCardSchema>;
