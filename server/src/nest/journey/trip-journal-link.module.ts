import { JourneyContributors } from '../../db/entities/JourneyContributors.entity';
import { TripJournalLinks } from '../../db/entities/TripJournalLinks.entity';
import { AddonsModule } from '../addons/addons.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TripMembershipModule } from '../trip-membership/trip-membership.module';
import { JourneyDomainModule } from './journey-domain.module';
import { TripJournalLinkController } from './trip-journal-link.controller';
import { TripJournalLinkMcp } from './trip-journal-link.mcp';
import { TripJournalLinkService } from './trip-journal-link.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

/**
 * A trip showing one journal from the Journey addon: the link, its routes and
 * its MCP tools. Its own module rather than part of JourneyModule, so the
 * binding of the trip roster's departure port (TripMemberDepartureModule) does
 * not pull in the whole journey surface (uploads, memories, both photo
 * providers).
 */
@Module({
  imports: [
    JourneyDomainModule,
    TripMembershipModule,
    PermissionsModule,
    RealtimeModule,
    AddonsModule,
    McpSharedModule,
    MikroOrmModule.forFeature([TripJournalLinks, JourneyContributors]),
  ],
  controllers: [TripJournalLinkController],
  providers: [TripJournalLinkService, TripJournalLinkMcp],
  exports: [TripJournalLinkService],
})
export class TripJournalLinkModule {}
