import { Places } from '../../db/entities/Places.entity';
import { TourObstacleReviews } from '../../db/entities/TourObstacleReviews.entity';
import { TourSources } from '../../db/entities/TourSources.entity';
import { TourStationVisits } from '../../db/entities/TourStationVisits.entity';
import { TourTypes } from '../../db/entities/TourTypes.entity';
import { TourWaypoints } from '../../db/entities/TourWaypoints.entity';
import { Tours } from '../../db/entities/Tours.entity';
import { AddonsModule } from '../addons/addons.module';
import { MapsModule } from '../maps/maps.module';
import { McpSharedModule } from '../mcp-shared/mcp-shared.module';
import { OverpassModule } from '../overpass/overpass.module';
import { PaddleObstaclesModule } from '../paddle-obstacles/paddle-obstacles.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PlaceImportModule } from '../place-import/place-import.module';
import { PlacesModule } from '../places/places.module';
import { RoadtripModule } from '../roadtrip/roadtrip.module';
import { TripMembershipModule } from '../trip-membership/trip-membership.module';
import { WandererModule } from '../wanderer/wanderer.module';
import { CityWalkBriefingService } from './city-walk-briefing.service';
import { CityWalkMcp } from './city-walk.mcp';
import { TourGpxExportService } from './tour-gpx-export.service';
import { TourLibraryController, TourTakeOverController } from './tour-library.controller';
import { TourLibraryMcp } from './tour-library.mcp';
import { TourLibraryService } from './tour-library.service';
import { TourObstacleReviewsService } from './tour-obstacle-reviews.service';
import { PaddleCheckCache } from './tour-paddle-check.cache';
import { TourPaddleCheckService } from './tour-paddle-check.service';
import { TourPaddlePlanService } from './tour-paddle-plan.service';
import { TourPoiSearchController } from './tour-poi-search.controller';
import { TourPoiSearchService } from './tour-poi-search.service';
import { TourTrailGradeController } from './tour-trail-grade.controller';
import { TourTrailGradeService } from './tour-trail-grade.service';
import { TourVisitsController } from './tour-visits.controller';
import { TourVisitsService } from './tour-visits.service';
import { TourWalkImportController } from './tour-walk-import.controller';
import { TourWalkImportMcp } from './tour-walk-import.mcp';
import { TourWalkImportService } from './tour-walk-import.service';
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
 * this module's own providers. A Google Maps walking route is read into the
 * stops of a city walk through PlaceImportModule as well (CW-07), its short
 * link followed by the narrow resolver there (CW-06). A city walk an assistant
 * prepares from a briefing reads the day and places of the trip through the
 * tours' own repositories, is planned on foot by RoadtripModule's router and
 * is created through ToursService (CW-11).
 */
@Module({
  imports: [
    PlacesModule,
    PlaceImportModule,
    PermissionsModule,
    TripMembershipModule,
    // The take-over tool checks 'place_edit' on the trip it writes into (LIB-02).
    McpSharedModule,
    // PLN-02 searches places along a tour through the map search.
    MapsModule,
    // BIK-05 reads the trail grades along a mountain bike tour from OpenStreetMap.
    OverpassModule,
    AddonsModule,
    // The wanderer import reads trails through the caller's own connection.
    WandererModule,
    // The obstacle data a paddle tour's checklist reads (PAD-06, PAD-09).
    PaddleObstaclesModule,
    // A city walk prepared over MCP is planned on foot by the router the road trip uses (CW-11).
    RoadtripModule,
    MikroOrmModule.forFeature([
      Tours,
      TourTypes,
      TourWaypoints,
      TourSources,
      TourObstacleReviews,
      TourStationVisits,
      Places,
    ]),
  ],
  controllers: [
    TourTakeOverController,
    TourPoiSearchController,
    TourTrailGradeController,
    TourVisitsController,
    TourWalkImportController,
    ToursController,
    ToursImportController,
    ToursWandererController,
    TourLibraryController,
  ],
  providers: [
    ToursService,
    TourPaddlePlanService,
    PaddleCheckCache,
    TourPaddleCheckService,
    TourObstacleReviewsService,
    TourGpxExportService,
    ToursWandererService,
    TourLibraryService,
    TourPoiSearchService,
    TourTrailGradeService,
    TourVisitsService,
    TourWalkImportService,
    CityWalkBriefingService,
    ToursMcp,
    TourLibraryMcp,
    TourWalkImportMcp,
    CityWalkMcp,
  ],
})
export class ToursModule {}
