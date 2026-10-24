import { journeyEntriesCardSchema } from './journey-entries.card';
import { journeyHeaderCardSchema } from './journey-header.card';

export * from './journey-entries.card';
export * from './journey-header.card';

/**
 * What the travel journal brings to the assistant chat: the kinds of card it draws,
 * the verbs of its change cards and what an applied change of its
 * touches, beyond the core ones. cards/index.ts and assistant.schema.ts
 * spread these into the card union and the shared enums, so a new kind, verb
 * or entity is added here and nowhere else.
 */
export const JOURNEY_CARD_SCHEMAS = [journeyEntriesCardSchema, journeyHeaderCardSchema] as const;
/**
 * An entry written, changed or deleted; a journal started, renamed, given
 * another status or other settings, deleted; a trip linked or unlinked; its
 * suggestions brought back; the user's own view of it changed.
 */
export const JOURNEY_VERB_KEYS = [
  'addJournalEntry',
  'updateJournalEntry',
  'removeJournalEntry',
  'createJournal',
  'renameJournal',
  'setJournalStatus',
  'updateJournalSettings',
  'deleteJournal',
  'linkJournalTrip',
  'unlinkJournalTrip',
  'restoreJournalSuggestions',
  'setJournalPreferences',
] as const;
/** An entry of a journal, or the journal itself; the receipt opens it there. */
export const JOURNEY_APPLIED_ENTITIES = ['journey_entry', 'journey'] as const;
