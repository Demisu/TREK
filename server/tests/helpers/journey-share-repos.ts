import { JourneyBooks } from '../../src/db/entities/JourneyBooks.entity';
import { JourneyShareTokens } from '../../src/db/entities/JourneyShareTokens.entity';
import type { JourneyBooksRepository } from '../../src/db/repositories/JourneyBooks.repository';
import type { JourneyShareTokensRepository } from '../../src/db/repositories/JourneyShareTokens.repository';
import { TRIP_MEMBER_DEPARTURE, type TripMemberDeparture } from '../../src/nest/common/trip-member-departure.types';
import { sharedTestOrm } from './test-uow';
import { Global, Module } from '@nestjs/common';

import type Database from 'better-sqlite3';

/**
 * Plan 3g Task 3 (`JourneyShareService`/`JourneyBookService`) test-only
 * repository factories, bound to a suite's own better-sqlite3 handle via the
 * SAME memoised `sharedTestOrm` (`test-uow.ts`) — same precedent
 * `journey-repos.ts` (Task 1) documents for itself.
 *
 * A NEW file rather than an addition to `journey-repos.ts`: that file is
 * Task 1/2's own (`JourneysRepository`/`JourneyContributorsRepository`/
 * `JourneyTripsRepository`/`JourneyEntriesRepository`/`JourneyPhotosRepository`/
 * `JourneyEntryPhotosRepository`), concurrently in flight when this task ran
 * — this file only adds the two share/book-owned tables' factories.
 */
export function createTestJourneyShareTokensRepo(db: Database.Database): Promise<JourneyShareTokensRepository> {
  return sharedTestOrm(db).then((t) => t.repo(JourneyShareTokens));
}

export function createTestJourneyBooksRepo(db: Database.Database): Promise<JourneyBooksRepository> {
  return sharedTestOrm(db).then((t) => t.repo(JourneyBooks));
}

/**
 * The trip roster's departure port for the suites that build TripMembersService
 * without the journey domain: leaving a trip only has to tell the port, and what
 * that does to a linked journal is pinned by the TJL integration tests against
 * the real binding.
 */
export function journalLinksStub(memberLeft: TripMemberDeparture['memberLeft'] = async () => {}): TripMemberDeparture {
  return { memberLeft };
}

/** The same stub bound globally, for a `createTestModule` that imports TripMembersModule. */
@Global()
@Module({
  providers: [{ provide: TRIP_MEMBER_DEPARTURE, useValue: journalLinksStub() }],
  exports: [TRIP_MEMBER_DEPARTURE],
})
export class MemberDepartureStubModule {}
