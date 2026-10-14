import { PermissionsModule } from '../permissions/permissions.module';
import { FerratasOverpassClient } from './ferratas-overpass.client';
import { FerratasController } from './ferratas.controller';
import { FerratasService } from './ferratas.service';
import { Module } from '@nestjs/common';

/**
 * Via ferratas around a trip, read from OpenStreetMap through Overpass.
 * PermissionsModule brings TripAccessGuard; RuntimeEnvService (the Overpass
 * endpoints and deadline) comes from the global AppConfigModule.
 */
@Module({
  imports: [PermissionsModule],
  controllers: [FerratasController],
  providers: [FerratasService, FerratasOverpassClient],
})
export class FerratasModule {}
