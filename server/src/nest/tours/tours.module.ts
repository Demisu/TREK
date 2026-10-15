import { Places } from '../../db/entities/Places.entity';
import { TourSources } from '../../db/entities/TourSources.entity';
import { TourTypes } from '../../db/entities/TourTypes.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import { AddonsModule } from '../addons/addons.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PlaceImportModule } from '../place-import/place-import.module';
import { PlacesModule } from '../places/places.module';
import { TripMembershipModule } from '../trip-membership/trip-membership.module';
import { WandererModule } from '../wanderer/wanderer.module';
import { ToursImportController } from './tours-import.controller';
import { ToursWandererController } from './tours-wanderer.controller';
import { ToursWandererService } from './tours-wanderer.service';
import { ToursController } from './tours.controller';
import { ToursMcp } from './tours.mcp';
import { ToursService } from './tours.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

/**
 * Tours domain: an isolated bounded context that reads GPX through PlaceImportModule and
 * persists the places through PlacesService (PlacesModule). The tour SQL lives in
 * the Tours and TourWaypoints repositories; the owning place's route columns go
 * through PlacesRepository, registered here because forFeature only reaches
 * this module's own providers.
 */
@Module({
  imports: [
    PlacesModule,
    PlaceImportModule,
    PermissionsModule,
    TripMembershipModule,

    AddonsModule,
    // The wanderer import reads trails through the caller's own connection.
    WandererModule,
    MikroOrmModule.forFeature([Tours, TourTypes, TourWaypoints, TourSources, Places]),
  ],
  controllers: [ToursController, ToursImportController, ToursWandererController],
  providers: [ToursService, ToursWandererService, ToursMcp],
})
export class ToursModule {}
