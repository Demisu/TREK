import { PaddleFeatures } from '../../db/entities/PaddleFeatures.entity';
import { PaddleRegions } from '../../db/entities/PaddleRegions.entity';
import { PADDLE_FEATURE_GEOMETRY, PADDLE_FEATURE_TAGS, PADDLE_REGION_BOUNDARY } from '../../db/json-columns';
import type { Box, PaddleFeatureRow, PaddleFeaturesRepository } from '../../db/repositories/PaddleFeatures.repository';
import type { PaddleRegionsRepository } from '../../db/repositories/PaddleRegions.repository';
import { utcSuffix } from '../../db/types';
import { decodeJson } from '../../utils/json-column';
import { logWarn } from '../audit/audit-log.logger';
import { badRequest } from '../common/domain-error';
import { coverageOf, parseBox } from './paddle-geo';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import {
  PADDLE_OBSTACLES_CAP,
  paddleObstacleKindSchema,
  type PaddleFeature,
  type PaddleObstaclesResponse,
} from '@trek/shared';

export const PADDLE_BOX_INVALID_MESSAGE = 'bbox must be south,west,north,east and at most one degree a side';

function featureOf(row: PaddleFeatureRow): PaddleFeature | null {
  const context = `${row.region_id}/${row.osm_ref}`;
  const kind = paddleObstacleKindSchema.safeParse(row.kind);
  const geometry = decodeJson(PADDLE_FEATURE_GEOMETRY, row.geometry, context);
  if (!kind.success || !geometry) {
    logWarn(`[Paddle] stored object ${context} does not read; left out`);
    return null;
  }
  return {
    ref: row.osm_ref,
    kind: kind.data,
    group_key: row.group_key,
    name: row.name,
    geometry,
    tags: decodeJson(PADDLE_FEATURE_TAGS, row.tags, context),
    tag_hash: row.tag_hash,
    region_id: row.region_id,
  };
}

/**
 * PAD-05A, the reading side: the paddle objects inside a map area and how far
 * TREK's data covers it. An area outside every region answers `none`, not an
 * empty list read as "no obstacles"; one cut at the cap says so. Where two
 * regions overlap (a country and one of its states), an object both hold is
 * answered once.
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
      this.regions.withDataInBox(box),
    ]);
    const seen = new Set<string>();
    const unique = rows.filter((row) => {
      if (seen.has(row.osm_ref)) return false;
      seen.add(row.osm_ref);
      return true;
    });
    return {
      features: unique.slice(0, PADDLE_OBSTACLES_CAP).flatMap((row) => featureOf(row) ?? []),
      coverage: {
        state: coverageOf(
          box,
          regions.map((region) => decodeJson(PADDLE_REGION_BOUNDARY, region.boundary, region.id)),
        ),
        regions: regions.map((region) => ({
          id: region.id,
          name: region.name,
          source_timestamp: region.source_timestamp,
          imported_at: utcSuffix(region.imported_at),
        })),
      },
      truncated: unique.length > PADDLE_OBSTACLES_CAP,
    };
  }
}
