import { cityWalkStationSchema } from './tour-walk-briefing.schema';
import { stationKeySchema } from './tours.schema';

import { z } from 'zod';

/**
 * MCP-T02: a change to a saved tour an assistant prepares for the traveller to
 * review. Preparing it reads only: the answer shows the plan as it would be
 * after the change, set against the saved plan, with the effects worked out
 * and what could not be. Every change names the stations it touches by their
 * keys, the same across saves, so it cannot drift onto another station. A
 * spontaneous stop is a change like any other: an `add` after the station the
 * traveller is at.
 */

/** The most changes one proposal carries: enough to rework a walk, few enough to review at once. */
export const TOUR_CHANGE_MAX = 10;

/** The operations a proposal can hold; which of them a tour type takes is the server's rule. */
export const TOUR_CHANGE_OPS = ['add', 'remove', 'replace', 'move'] as const;
export type TourChangeOp = (typeof TOUR_CHANGE_OPS)[number];

const key = stationKeySchema.describe('The key of a station of the saved tour, as get_tour_plan gives it');
const afterKey = stationKeySchema.describe(
  'The key of the saved station it comes after; stops added after the same station keep the order they are given in',
);
const station = cityWalkStationSchema.describe(
  'The new station: its position, name, stay in minutes (0 passed through, null not known), importance, protected, opening hours as OpenStreetMap writes them, and the place of this trip it stands for',
);

export const tourChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), station, after_key: afterKey }).strict(),
  z.object({ op: z.literal('remove'), key }).strict(),
  z.object({ op: z.literal('replace'), key, station }).strict(),
  z.object({ op: z.literal('move'), key, after_key: afterKey }).strict(),
]);
export type TourChange = z.infer<typeof tourChangeSchema>;

export const tourChangeRequestSchema = z
  .object({
    changes: z
      .array(tourChangeSchema)
      .min(1)
      .max(TOUR_CHANGE_MAX)
      .describe('The changes in the order they apply, each to the plan the ones before it left'),
  })
  .strict();
export type TourChangeRequest = z.infer<typeof tourChangeRequestSchema>;
