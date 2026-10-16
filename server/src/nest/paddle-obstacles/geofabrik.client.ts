import { readCappedJson } from '../../utils/cappedFetch';
import { regionBoundarySchema, type RegionBoundary } from './paddle-geo';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

/**
 * The outbound half of PAD-05A: Geofabrik's list of regional extracts and the
 * download of one. Only Geofabrik's own host is ever asked, at addresses its
 * list names, so an admin choosing a region can point TREK nowhere else.
 */

export const GEOFABRIK_HOST = 'https://download.geofabrik.de/';
const INDEX_URL = `${GEOFABRIK_HOST}index-v1.json`;
const INDEX_TIMEOUT_MS = 20_000;
/** The list is a few megabytes; far more means it is not the list. */
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const INDEX_FRESH_MS = 24 * 60 * 60 * 1000;
/** A whole country is a few gigabytes; a regional extract far less. More than this is refused. */
export const MAX_EXTRACT_BYTES = 4 * 1024 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000;

const indexSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        id: z.string(),
        parent: z.string().optional(),
        name: z.string(),
        urls: z.object({ pbf: z.string().optional() }).passthrough(),
      }),
      geometry: z.unknown(),
    }),
  ),
});

export interface GeofabrikRegion {
  id: string;
  name: string;
  parent: string | null;
  pbfUrl: string;
  boundary: RegionBoundary | null;
}

@Injectable()
export class GeofabrikClient {
  private index: { regions: Map<string, GeofabrikRegion>; fetchedAt: number } | null = null;

  /** Every region the list names that has an extract on Geofabrik's host, by id. */
  async regions(now: number = Date.now()): Promise<Map<string, GeofabrikRegion>> {
    if (this.index && now - this.index.fetchedAt < INDEX_FRESH_MS) return this.index.regions;
    const response = await fetch(INDEX_URL, { signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Geofabrik index ${response.status}`);
    }
    const parsed = indexSchema.parse(await readCappedJson<unknown>(response, MAX_INDEX_BYTES));
    const regions = new Map<string, GeofabrikRegion>();
    for (const feature of parsed.features) {
      const { id, name, parent, urls } = feature.properties;
      if (!urls.pbf?.startsWith(GEOFABRIK_HOST) || !urls.pbf.endsWith('-latest.osm.pbf')) continue;
      const boundary = regionBoundarySchema.safeParse(feature.geometry);
      regions.set(id, { id, name, parent: parent ?? null, pbfUrl: urls.pbf, boundary: boundary.success ? boundary.data : null });
    }
    this.index = { regions, fetchedAt: now };
    return regions;
  }

  /**
   * One region's extract written to `target`. The address must be one the
   * list named; the body is counted as it streams and cut at
   * MAX_EXTRACT_BYTES, and the file goes when the download fails.
   */
  async download(url: string, target: string): Promise<void> {
    if (!url.startsWith(GEOFABRIK_HOST) || !url.endsWith('-latest.osm.pbf')) throw new Error('Not a Geofabrik extract');
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Geofabrik download ${response.status}`);
    }
    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length;
        if (received > MAX_EXTRACT_BYTES) done(new Error('Extract larger than allowed'));
        else done(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(response.body as unknown as WebReadableStream), counter, createWriteStream(target));
    } catch (err) {
      await unlink(target).catch(() => undefined);
      throw err;
    }
  }
}
