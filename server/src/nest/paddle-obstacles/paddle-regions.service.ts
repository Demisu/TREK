import { PaddleFeatures } from '../../db/entities/PaddleFeatures.entity';
import { PaddleRegions } from '../../db/entities/PaddleRegions.entity';
import type { PaddleFeatureRow, PaddleFeaturesRepository } from '../../db/repositories/PaddleFeatures.repository';
import type { PaddleRegionRow, PaddleRegionsRepository } from '../../db/repositories/PaddleRegions.repository';
import { dbNow } from '../../db/types';
import { DataPathsService } from '../app-config/data-paths.service';
import { logError, logInfo } from '../audit/audit-log.logger';
import { DomainError } from '../common/domain-error';
import { withRequestContext } from '../database/request-context';
import { UnitOfWork } from '../database/unit-of-work';
import { GeofabrikClient } from './geofabrik.client';
import { extractPaddleFeatures, type ExtractedFeature } from './paddle-extract';
import { boxOfBoundary } from './paddle-geo';
import { MikroORM } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import type { PaddleRegion, PaddleRegionCatalogEntry } from '@trek/shared';

import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const CATALOG_LIMIT = 25;

export const REGION_UNKNOWN_MESSAGE = 'Geofabrik has no extract by that id';
export const CATALOG_UNAVAILABLE_MESSAGE = 'The list of regions cannot be fetched right now';

function toRegion(row: PaddleRegionRow): PaddleRegion {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    source_timestamp: row.source_timestamp,
    imported_at: row.imported_at === null ? null : `${row.imported_at.replace(' ', 'T')}Z`,
    feature_count: row.feature_count,
    error: row.error,
  };
}

function toRow(feature: ExtractedFeature): PaddleFeatureRow {
  return {
    region_id: '',
    osm_ref: feature.osm_ref,
    kind: feature.kind,
    group_key: feature.group_key,
    name: feature.name,
    geometry: JSON.stringify(feature.geometry),
    tags: JSON.stringify(feature.tags),
    tag_hash: feature.tag_hash,
    min_lat: feature.min_lat,
    min_lng: feature.min_lng,
    max_lat: feature.max_lat,
    max_lng: feature.max_lng,
  };
}

/**
 * PAD-05A: the regions TREK holds paddle data for. An admin picks a region
 * from Geofabrik's list; TREK downloads its extract into the data folder's
 * temporary space, reads the paddle objects out of it, replaces the region's
 * rows in one transaction and deletes the file. Regions are read one at a
 * time, in the background, never on a request's path; a failed read keeps the
 * region's previous data and says why.
 */
@Injectable()
export class PaddleRegionsService {
  private running: Promise<void> | null = null;

  constructor(
    private readonly geofabrik: GeofabrikClient,
    private readonly paths: DataPathsService,
    private readonly uow: UnitOfWork,
    private readonly orm: MikroORM,
    @InjectRepository(PaddleRegions) private readonly regions: PaddleRegionsRepository,
    @InjectRepository(PaddleFeatures) private readonly features: PaddleFeaturesRepository,
  ) {}

  async list(): Promise<PaddleRegion[]> {
    return (await this.regions.list()).map(toRegion);
  }

  /** Regions of Geofabrik's list whose name or id matches, with the regions they lie in. */
  async catalog(query: string): Promise<PaddleRegionCatalogEntry[]> {
    let all: Awaited<ReturnType<GeofabrikClient['regions']>>;
    try {
      all = await this.geofabrik.regions();
    } catch (err) {
      logError(`[Paddle] Geofabrik index: ${err instanceof Error ? err.message : String(err)}`);
      throw new DomainError(502, CATALOG_UNAVAILABLE_MESSAGE, { code: 'catalog_unavailable', details: { code: 'catalog_unavailable' } });
    }
    const needle = query.toLowerCase();
    const path = (id: string | null): string[] => {
      const names: string[] = [];
      for (let at = id; at; at = all.get(at)?.parent ?? null) names.unshift(all.get(at)?.name ?? at);
      return names;
    };
    return [...all.values()]
      .filter((region) => region.name.toLowerCase().includes(needle) || region.id.includes(needle))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)))
      .slice(0, CATALOG_LIMIT)
      .map((region) => ({ id: region.id, name: region.name, path: path(region.parent) }));
  }

  /** Adds a region and queues its first read; a region already there is queued again. */
  async add(id: string): Promise<PaddleRegion> {
    const region = (await this.geofabrik.regions().catch(() => new Map())).get(id);
    if (!region) throw new DomainError(400, REGION_UNKNOWN_MESSAGE, { code: 'unknown_region', details: { code: 'unknown_region' } });
    const box = region.boundary ? boxOfBoundary(region.boundary) : null;
    await this.regions.insertRegion({
      id,
      name: region.name,
      boundary: region.boundary ? JSON.stringify(region.boundary) : null,
      min_lat: box?.south ?? null,
      min_lng: box?.west ?? null,
      max_lat: box?.north ?? null,
      max_lng: box?.east ?? null,
    });
    await this.regions.updateRegion(id, { status: 'queued', error: null });
    this.kick();
    const row = await this.regions.findById(id);
    if (!row) throw new Error('Added region could not be read back');
    return toRegion(row);
  }

  async refresh(id: string): Promise<PaddleRegion> {
    const row = await this.regions.findById(id);
    if (!row) throw new DomainError(404, 'Region not found');
    await this.regions.updateRegion(id, { status: 'queued', error: null });
    this.kick();
    return toRegion({ ...row, status: 'queued', error: null });
  }

  async remove(id: string): Promise<void> {
    if (!(await this.regions.deleteRegion(id))) throw new DomainError(404, 'Region not found');
  }

  /** Every region with data queued again, for the monthly refresh; the reads follow in the background. */
  async queueRefresh(): Promise<number> {
    const queued = await this.regions.queueReady();
    if (queued > 0) this.kick();
    return queued;
  }

  /** A restart left a read unfinished: it goes back to the queue, and the queue starts. */
  async resumeAfterRestart(): Promise<void> {
    await this.regions.requeueInterrupted();
    this.kick();
  }

  /** Starts the background reads unless they already run; the promise is for tests to wait on. */
  kick(): Promise<void> {
    if (!this.running) {
      this.running = withRequestContext(this.orm, () => this.drain()).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async drain(): Promise<void> {
    for (let next = await this.regions.nextQueued(); next; next = await this.regions.nextQueued()) {
      await this.importRegion(next);
    }
  }

  /** @txIndependent the download and the read sit between the status writes; only the swap of rows is one transaction. */
  private async importRegion(region: PaddleRegionRow): Promise<void> {
    await this.regions.updateRegion(region.id, { status: 'importing', error: null });
    const dir = join(this.paths.tmpDir, 'paddle');
    const file = join(dir, `${region.id}-${Date.now()}.osm.pbf`);
    try {
      const known = (await this.geofabrik.regions()).get(region.id);
      if (!known) throw new Error(REGION_UNKNOWN_MESSAGE);
      await mkdir(dir, { recursive: true });
      const started = Date.now();
      await this.geofabrik.download(known.pbfUrl, file);
      const { timestamp, features } = await extractPaddleFeatures(file);
      await this.uow.transactional(async () => {
        await this.features.replaceRegion(region.id, features.map(toRow));
        await this.regions.updateRegion(region.id, {
          status: 'ready',
          feature_count: features.length,
          source_timestamp: timestamp === null ? null : new Date(timestamp * 1000).toISOString(),
          imported_at: dbNow(),
          error: null,
        });
      });
      logInfo(`[Paddle] ${region.id}: ${features.length} objects read in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(`[Paddle] ${region.id}: ${message}`);
      await this.regions.updateRegion(region.id, { status: 'failed', error: message.slice(0, 500) });
    } finally {
      await unlink(file).catch(() => undefined);
    }
  }
}
