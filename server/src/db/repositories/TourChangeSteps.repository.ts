import type { TourChangeSteps } from '../entities/TourChangeSteps.entity';
import type { DB } from '../kysely/db';
import { TrekRepository } from './_shared/trek-repository';

type StepsDB = Pick<DB, 'tour_change_steps'>;

/** What a save of a confirmed change records; `changes` and `before_state` are their JSON text. */
export interface TourChangeStepWrite {
  place_id: number;
  proposal_id: string;
  base_revision: number;
  revision: number;
  changes: string;
  before_state: string;
  saved_by: number | null;
}

/**
 * `tour_change_steps` (MCP-T03): the changes to a tour saved from a proposal
 * the traveller confirmed, one step per revision they raised the tour to,
 * each with the tour as it was before, so a step can be followed and taken
 * back (MCP-T04). A step goes with its tour.
 */
export class TourChangeStepsRepository extends TrekRepository<TourChangeSteps> {
  private db() {
    return this.kysely<StepsDB>();
  }

  /** Records one saved step and answers its id; the caller holds the transaction of the save. */
  async record(step: TourChangeStepWrite): Promise<number> {
    const inserted = await this.db()
      .insertInto('tour_change_steps')
      .values(step)
      .returning('id')
      .executeTakeFirstOrThrow();
    return inserted.id;
  }
}
