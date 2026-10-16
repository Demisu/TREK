import { PaddleFeatures } from '../../db/entities/PaddleFeatures.entity';
import { PaddleRegions } from '../../db/entities/PaddleRegions.entity';
import type { Box, PaddleFeatureRow, PaddleFeaturesRepository } from '../../db/repositories/PaddleFeatures.repository';
import type { PaddleRegionsRepository } from '../../db/repositories/PaddleRegions.repository';
import { logWarn } from '../audit/audit-log.logger';
import { badRequest } from '../common/domain-error';
import { coverageOf, parseBox, regionBoundarySchema, type RegionBoundary } from './paddle-geo';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import {
  PADDLE_OBSTACLES_CAP,
  paddleFeatureSchema,
  type PaddleFeature,
  type PaddleObstaclesResponse,
} from '@trek/shared';

export const PADDLE_BOX_INVALID_MESSAGE = 'bbox must be south,west,north,east and at most one degree a side';

function featureOf(row: PaddleFeatureRow): PaddleFeature | null {
  try {
    const parsed = paddleFeatureSchema.safeParse({
      ref: row.osm_ref,
      kind: row.kind,
      group_key: row.group_key,
      name: row.name,
      geometry: JSON.parse(row.geometry),
      tags: JSON.parse(row.tags),
      tag_hash: row.tag_hash,
      region_id: row.region_id,
    });
    if (parsed.success) return parsed.data;
  } catch {
    // Unreadable JSON falls through to the log line below.
  }
  logWarn(`[Paddle] stored object ${row.region_id}/${row.osm_ref} does not read; left out`);
  return null;
}

/**
 * PAD-05A, the reading side: the paddle objects inside a map area and how far
 * TREK's data covers it. An area outside every region answers `none`, not an
 * empty list read as "no obstacles"; one cut at the cap says so.
 */
@Injectable()
export class PaddleObstaclesService {
  constructor(
    @InjectRepository(PaddleFeatures) private readonly features: PaddleFeaturesRepository,
    @InjectRepository(PaddleRegions) private readonly regions: PaddleRegionsRepository,
  ) {}

  async inBox(bbox: string): Promise<PaddleObstaclesResponse> {
    const box = parseBox(bbox);
    if (!box) throw badRequest(PADDLE_BOX_INVALID_MESSAGE);
    return await this.read(box);
  }

  /** The same answer for a box already known to be valid, for the server's own route checks. */
  async read(box: Box): Promise<PaddleObstaclesResponse> {
    const [rows, regions] = await Promise.all([
      this.features.findInBox(box, PADDLE_OBSTACLES_CAP + 1),
      this.regions.readyInBox(box),
    ]);
    const boundaries = regions.map((region): RegionBoundary | null => {
      if (!region.boundary) return null;
      try {
        const parsed = regionBoundarySchema.safeParse(JSON.parse(region.boundary));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    });
    return {
      features: rows.slice(0, PADDLE_OBSTACLES_CAP).flatMap((row) => featureOf(row) ?? []),
      coverage: {
        state: coverageOf(box, boundaries),
        regions: regions.map((region) => ({
          id: region.id,
          name: region.name,
          source_timestamp: region.source_timestamp,
          imported_at: region.imported_at === null ? null : `${region.imported_at.replace(' ', 'T')}Z`,
        })),
      },
      truncated: rows.length > PADDLE_OBSTACLES_CAP,
    };
  }
}
