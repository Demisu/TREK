import { idSchema } from '../common/primitives.schema';
import { cityWalkStationSchema } from './tour-walk-briefing.schema';
import { stationKeySchema, tourRevisionSchema } from './tours.schema';

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

/**
 * MCP-T03: the proposal_id a preparation answers, binding a save to the very
 * proposal the traveller was shown: the same tour, revision and changes.
 */
export const tourChangeProposalIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .describe('The proposal_id prepare_tour_change answered with the proposal the traveller confirmed');

/**
 * MCP-T03: a prepared change the traveller confirmed, sent to be saved. It
 * repeats the changes and the revision of the proposal they were shown, names
 * that proposal and says yes in so many words: a save without the yes, or of
 * anything other than what was prepared, is refused.
 */
export const tourChangeSaveRequestSchema = tourChangeRequestSchema
  .extend({
    expected_revision: tourRevisionSchema.describe(
      'base.revision of the proposal: the revision of the tour it was prepared on',
    ),
    proposal_id: tourChangeProposalIdSchema,
    confirmed: z
      .literal(true)
      .describe('true only once the traveller said yes to exactly this proposal as it was shown to them'),
  })
  .strict();
export type TourChangeSaveRequest = z.infer<typeof tourChangeSaveRequestSchema>;

/**
 * MCP-T04: a saved step the traveller confirmed to take back. It names the
 * step, the revision of the tour the preview of it was read at and says yes
 * in so many words. Taking back restores the tour exactly as the step kept it
 * before, so there is nothing more to send: no changes, no state.
 */
export const tourChangeUndoRequestSchema = z
  .object({
    step_id: idSchema.describe('The id of the saved step, as list_tour_change_steps gives it'),
    expected_revision: tourRevisionSchema.describe(
      'undo.expected_revision of prepare_tour_undo: the revision of the tour the step was shown to be taken back from',
    ),
    confirmed: z
      .literal(true)
      .describe('true only once the traveller said yes to taking back exactly this step as the preview showed it'),
  })
  .strict();
export type TourChangeUndoRequest = z.infer<typeof tourChangeUndoRequestSchema>;
