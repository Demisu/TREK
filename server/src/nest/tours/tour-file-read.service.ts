import { PlaceImportService } from '../place-import/place-import.service';
import type { PreparedGpxPlace } from '../place-import/place-import.types';
import { PlacesService } from '../places/places.service';
import { readTourFile } from './tour-file-import.helpers';
import { gpxOfLine, splitGpxTracks } from './tour-file-split.helpers';
import { computeTourMetrics, parseRouteGeometry } from './tours.helpers';
import { Injectable } from '@nestjs/common';
import { TOUR_GPX_TEXT_MAX, type TourFileLeftOut } from '@trek/shared';

/** One track or route of an attached file, ready for import_tour_gpx. */
export interface TourFileTrack {
  name: string;
  /** Its own GPX text; null where it is longer than one import takes. */
  gpx: string | null;
  point_count: number;
  distance_km: number;
  has_heights: boolean;
  /** A track already in the trip under the same name and start, which the import would skip. */
  duplicate: boolean;
}

/** What an attached route file holds, track by track. */
interface TourFileTracks {
  tracks: TourFileTrack[];
  /**
   * True where a GPX file could not be cut into its tracks: its one entry is
   * then the whole file, which comes in as one import of all its tracks.
   */
  whole: boolean;
  /** What a KML or KMZ file holds besides its lines (pins, areas), never taken in. */
  left_out?: TourFileLeftOut;
}

const GPX_OPTIONS = { importWaypoints: false, importRoutes: true, importTracks: true } as const;

function isGpxName(fileName: string): boolean {
  const ext = fileName.toLowerCase().split('.').pop();
  return ext !== 'kml' && ext !== 'kmz';
}

/**
 * P7: a route file the user attached in the assistant's chat, read the way
 * the Tours import reads it (readTourFile: GPX by its tracks and routes, KML
 * and KMZ by their lines) and cut into one GPX text per track, so each one is
 * proposed and taken in as a tour of its own and taken back on its own.
 * Reads only: nothing is stored here, the import is import_tour_gpx's.
 */
@Injectable()
export class TourFileReadService {
  constructor(
    private readonly placeImport: PlaceImportService,
    private readonly places: PlacesService,
  ) {}

  async read(tripId: number, buffer: Buffer, fileName: string): Promise<TourFileTracks> {
    const { rows, leftOut } = await readTourFile(this.placeImport, buffer, fileName);
    if (rows.length === 0) return { tracks: [], whole: false };
    const duplicates = await this.places.gpxDuplicates(String(tripId), rows);
    const texts = isGpxName(fileName) ? this.cutGpx(buffer.toString('utf8'), rows.length, fileName) : null;
    const extra = leftOut ? { left_out: leftOut } : {};
    if (isGpxName(fileName) && !texts) {
      return { tracks: [this.wholeFile(buffer.toString('utf8'), rows, fileName)], whole: true, ...extra };
    }
    const tracks = rows.map((row, index) => {
      const own = texts?.[index] ?? gpxOfLine(row.name, row.description, parseRouteGeometry(row.routeGeometry));
      return this.trackOf(row, own, duplicates[index] ?? false);
    });
    return { tracks, whole: false, ...extra };
  }

  /** A GPX text cut into its tracks; null where a piece does not read back as exactly the one it should. */
  private cutGpx(text: string, count: number, fileName: string): string[] | null {
    const pieces = splitGpxTracks(text);
    if (pieces.length !== count) return null;
    const readable = pieces.every((piece) => {
      const rows = this.placeImport.readGpx(Buffer.from(piece, 'utf8'), { ...GPX_OPTIONS, defaultName: fileName });
      return rows.length === 1;
    });
    return readable ? pieces : null;
  }

  private trackOf(row: PreparedGpxPlace, gpx: string, duplicate: boolean): TourFileTrack {
    const line = parseRouteGeometry(row.routeGeometry);
    const metrics = computeTourMetrics(line);
    return {
      name: row.name,
      gpx: gpx.length <= TOUR_GPX_TEXT_MAX ? gpx : null,
      point_count: line.length,
      distance_km: metrics.distanceKm,
      has_heights: metrics.hasElevation,
      duplicate,
    };
  }

  /** The whole GPX file as one entry, named by the file and measured over all its tracks. */
  private wholeFile(text: string, rows: readonly PreparedGpxPlace[], fileName: string): TourFileTrack {
    const lines = rows.map((row) => parseRouteGeometry(row.routeGeometry));
    const metrics = lines.map((line) => computeTourMetrics(line));
    return {
      name: fileName,
      gpx: text.length <= TOUR_GPX_TEXT_MAX ? text : null,
      point_count: lines.reduce((sum, line) => sum + line.length, 0),
      distance_km: metrics.reduce((sum, metric) => sum + metric.distanceKm, 0),
      has_heights: metrics.every((metric) => metric.hasElevation),
      duplicate: false,
    };
  }
}
