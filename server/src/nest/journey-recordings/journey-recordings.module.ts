import { AddonsModule } from '../addons/addons.module';
import { DawarichModule } from '../integrations/dawarich.module';
import { JourneyDomainModule } from '../journey/journey-domain.module';
import { JourneyRecordingsController } from './journey-recordings.controller';
import { JourneyRecordingsMcp } from './journey-recordings.mcp';
import { JourneyRecordingsService } from './journey-recordings.service';
import { Module } from '@nestjs/common';

/**
 * A journey keeping the route recorded on its days (JRN-01): taking a day over
 * from the caller's Dawarich connection, its routes and its MCP tools. The
 * days themselves belong to the journey domain; this module only brings them
 * in from Dawarich, so neither of the two has to import the other.
 */
@Module({
  imports: [JourneyDomainModule, DawarichModule, AddonsModule],
  controllers: [JourneyRecordingsController],
  providers: [JourneyRecordingsService, JourneyRecordingsMcp],
})
export class JourneyRecordingsModule {}
