import { TRIP_MEMBER_DEPARTURE } from '../trip-members/trip-member-departure.types';
import { TripJournalLinkModule } from './trip-journal-link.module';
import { TripJournalLinkService } from './trip-journal-link.service';
import { Global, Module } from '@nestjs/common';

/**
 * Binds the trip roster's TRIP_MEMBER_DEPARTURE port to TripJournalLinkService,
 * so someone leaving a trip also leaves its journal link. Global so
 * TripMembersModule resolves it without importing the journey domain;
 * AppModule imports it next to the roster.
 */
@Global()
@Module({
  imports: [TripJournalLinkModule],
  providers: [{ provide: TRIP_MEMBER_DEPARTURE, useExisting: TripJournalLinkService }],
  exports: [TRIP_MEMBER_DEPARTURE],
})
export class TripMemberDepartureModule {}
