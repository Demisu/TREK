import type { TripJournalLinkService } from '../../src/nest/journey/trip-journal-link.service';

/**
 * TripJournalLinkService for the suites that hand-build TripMembersService:
 * leaving a trip only has to drop the member from a linked journal, and what
 * that does to the journal's access is pinned by the TJL integration tests
 * against the real service.
 */
export function journalLinksStub(
  dropMember: TripJournalLinkService['dropMember'] = async () => {},
): TripJournalLinkService {
  return { dropMember } as unknown as TripJournalLinkService;
}
