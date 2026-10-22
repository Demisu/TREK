import { AssistantMessages } from '../../db/entities/AssistantMessages.entity';
import { AssistantThreads } from '../../db/entities/AssistantThreads.entity';
import { AssistantToolCalls } from '../../db/entities/AssistantToolCalls.entity';
import { AddonsModule } from '../addons/addons.module';
import { AiConnectionsModule } from '../ai-connections/ai-connections.module';
import { AirportsModule } from '../airports/airports.module';
import { AuditModule } from '../audit/audit.module';
import { BookingImportModule } from '../booking-import/booking-import.module';
import { CollabModule } from '../collab/collab.module';
import { RateLimitModule } from '../common/rate-limit.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SettingsModule } from '../settings/settings.module';
import { TripMembershipModule } from '../trip-membership/trip-membership.module';
import { AssistantAttachmentsController } from './assistant-attachments.controller';
import { AssistantBookingImportService } from './assistant-booking-import.service';
import { AssistantFoundPlacesService } from './assistant-found-places.service';
import { AssistantRetentionJob } from './assistant-retention.job';
import { AssistantShareService } from './assistant-share.service';
import { AssistantStreamRegistry, InMemoryAssistantStreamRegistry } from './assistant-stream.registry';
import { AssistantToolsService } from './assistant-tools.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantCardContext } from './cards/card-context';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

/**
 * The trip assistant: conversations about a trip, answered by the language
 * model the user's connection reaches (AiConnectionsModule), working the trip
 * through the MCP tools of the global registry. A file attached in the chat
 * is read through the booking import, and an answer shared in the trip's
 * chat is posted through the collab chat. A card names an airport through the
 * airports' data. Its conversations are kept per user and trip and swept by
 * the retention job.
 */
@Module({
  imports: [
    AddonsModule,
    AiConnectionsModule,
    AirportsModule,
    AuditModule,
    BookingImportModule,
    CollabModule,
    McpSharedModule,
    PermissionsModule,
    RateLimitModule,
    SchedulingModule,
    SettingsModule,
    TripMembershipModule,
    MikroOrmModule.forFeature([AssistantThreads, AssistantMessages, AssistantToolCalls]),
  ],
  controllers: [AssistantController, AssistantAttachmentsController],
  // The running turns stay in this process's memory; a registry shared
  // between processes would be provided here instead.
  providers: [
    AssistantService,
    AssistantToolsService,
    AssistantBookingImportService,
    AssistantFoundPlacesService,
    AssistantShareService,
    AssistantRetentionJob,
    AssistantCardContext,
    { provide: AssistantStreamRegistry, useClass: InMemoryAssistantStreamRegistry },
  ],
})
export class AssistantModule {}
