import type { PaddleRegions } from '../entities/PaddleRegions.entity';
import type { DB } from '../kysely/db';
import { TrekRepository } from './_shared/trek-repository';
import type { Box } from './PaddleFeatures.repository';

export type PaddleRegionStatus = 'queued' | 'importing' | 'ready' | 'failed';

/** One region an admin chose, as stored; the boundary is still GeoJSON text. */
export interface PaddleRegionRow {
  id: string;
  name: string;
  boundary: string | null;
  min_lat: number | null;
  min_lng: number | null;
  max_lat: number | null;
  max_lng: number | null;
  status: PaddleRegionStatus;
  source_timestamp: string | null;
  imported_at: string | null;
  feature_count: number;
  error: string | null;
}

/** `status` narrowed to the four values the column's CHECK constraint allows. */
type RegionsDB = {
  paddle_regions: Omit<DB['paddle_regions'], 'status'> & { status: PaddleRegionStatus };
};

const COLUMNS = [
  'id',
  'name',
  'boundary',
  'min_lat',
  'min_lng',
  'max_lat',
  'max_lng',
  'status',
  'source_timestamp',
  'imported_at',
  'feature_count',
  'error',
] as const;

/** `paddle_regions`: the regional extracts an admin chose for paddle data (PAD-05A). */
export class PaddleRegionsRepository extends TrekRepository<PaddleRegions> {
  private db() {
    return this.kysely<RegionsDB>();
  }

  async list(): Promise<PaddleRegionRow[]> {
    return await this.db().selectFrom('paddle_regions').select(COLUMNS).orderBy('name', 'asc').execute();
  }

  async findById(id: string): Promise<PaddleRegionRow | undefined> {
    return await this.db().selectFrom('paddle_regions').select(COLUMNS).where('id', '=', id).executeTakeFirst();
  }

  /** The regions with data whose box reaches into `box`. */
  async readyInBox(box: Box): Promise<PaddleRegionRow[]> {
    return await this.db()
      .selectFrom('paddle_regions')
      .select(COLUMNS)
      .where('status', '=', 'ready')
      .where('min_lat', '<=', box.north)
      .where('max_lat', '>=', box.south)
      .where('min_lng', '<=', box.east)
      .where('max_lng', '>=', box.west)
      .execute();
  }

  /** The first region waiting for its read, oldest first. */
  async nextQueued(): Promise<PaddleRegionRow | undefined> {
    return await this.db()
      .selectFrom('paddle_regions')
      .select(COLUMNS)
      .where('status', '=', 'queued')
      .orderBy('created_at', 'asc')
      .executeTakeFirst();
  }

  async insertRegion(row: Pick<PaddleRegionRow, 'id' | 'name' | 'boundary' | 'min_lat' | 'min_lng' | 'max_lat' | 'max_lng'>): Promise<void> {
    await this.db()
      .insertInto('paddle_regions')
      .values({ ...row, status: 'queued', feature_count: 0 })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
  }

  async updateRegion(
    id: string,
    patch: Partial<Pick<PaddleRegionRow, 'status' | 'source_timestamp' | 'imported_at' | 'feature_count' | 'error'>>,
  ): Promise<void> {
    await this.db().updateTable('paddle_regions').set(patch).where('id', '=', id).execute();
  }

  /** Queues every region that has data again, for the monthly refresh; returns how many. */
  async queueReady(): Promise<number> {
    const result = await this.db()
      .updateTable('paddle_regions')
      .set({ status: 'queued' })
      .where('status', 'in', ['ready', 'failed'])
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0);
  }

  /** A region left half read by a restart goes back to the queue. */
  async requeueInterrupted(): Promise<void> {
    await this.db().updateTable('paddle_regions').set({ status: 'queued' }).where('status', '=', 'importing').execute();
  }

  async deleteRegion(id: string): Promise<boolean> {
    const result = await this.db().deleteFrom('paddle_regions').where('id', '=', id).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }
}
