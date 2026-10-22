import { JourneyBooks } from '../../db/entities/JourneyBooks.entity';
import { JourneyEntries } from '../../db/entities/JourneyEntries.entity';
import { JourneyEntryPhotos } from '../../db/entities/JourneyEntryPhotos.entity';
import { JourneyPhotos } from '../../db/entities/JourneyPhotos.entity';
import { AddonsModule } from '../addons/addons.module';
import { PhotoSignalsModule } from '../photos/photo-signals.module';
import { JourneyBookEditService } from './journey-book-edit.service';
import { JourneyBookPhotosMcp } from './journey-book-photos.mcp';
import { JourneyBookPhotosService } from './journey-book-photos.service';
import { JourneyBookMcp } from './journey-book.mcp';
import { JourneyBookService } from './journey-book.service';
import { JourneyDomainModule } from './journey-domain.module';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

/**
 * TREK Studio books: storing them (`JourneyBookService`, the REST routes in
 * journey.controller.ts) and changing them page by page through the shared
 * edit engine (`JourneyBookEditService`, the MCP tools in journey-book.mcp.ts),
 * and picking photos for it from the gallery (`JourneyBookPhotosService`,
 * `suggest_book_photos`, on the pixel signals of PhotoSignalsModule).
 *
 * The storing and the editing service are exported: the journey controller
 * saves through the first, and the assistant's Studio chat reads and writes
 * through both.
 */
@Module({
  imports: [
    AddonsModule,
    JourneyDomainModule,
    PhotoSignalsModule,
    // JB1-JB7, the gallery and entries the edit engine checks ids against, and which photos each entry shows.
    MikroOrmModule.forFeature([JourneyBooks, JourneyPhotos, JourneyEntries, JourneyEntryPhotos]),
  ],
  providers: [
    JourneyBookService,
    JourneyBookEditService,
    JourneyBookMcp,
    JourneyBookPhotosService,
    JourneyBookPhotosMcp,
  ],
  exports: [JourneyBookService, JourneyBookEditService],
})
export class JourneyBookModule {}
