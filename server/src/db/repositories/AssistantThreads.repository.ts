import type { AssistantThreads } from '../entities/AssistantThreads.entity';
import type { DB } from '../kysely/db';
import type { AssertRowKeys } from './_shared/rows';
import { TrekRepository } from './_shared/trek-repository';

/** One `assistant_threads` row as stored. */
export interface AssistantThreadRow {
  id: number;
  user_id: number;
  trip_id: number;
  title: string;
  created_at: string;
  last_message_at: string;
}

const _assistantThreadRowKeys: AssertRowKeys<AssistantThreadRow, AssistantThreads> = true;

type ThreadsKyselyDB = Pick<DB, 'assistant_threads'>;

const COLUMNS = ['id', 'user_id', 'trip_id', 'title', 'created_at', 'last_message_at'] as const;

/**
 * `assistant_threads`: a user's conversations about one trip. Every read and
 * delete a request makes names the user and the trip next to the id, so a
 * thread is only ever reached by its owner on its own trip.
 */
export class AssistantThreadsRepository extends TrekRepository<AssistantThreads> {
  private db() {
    return this.kysely<ThreadsKyselyDB>();
  }

  /** A new thread; answers its id. `at` is both its creation and its last message (`dbNow()`). */
  async createThread(userId: number, tripId: number, title: string, at: string): Promise<number> {
    const row = await this.db()
      .insertInto('assistant_threads')
      .values({ user_id: userId, trip_id: tripId, title, created_at: at, last_message_at: at })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async findOwned(id: number, userId: number, tripId: number): Promise<AssistantThreadRow | null> {
    const row = await this.db()
      .selectFrom('assistant_threads')
      .select(COLUMNS)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('trip_id', '=', tripId)
      .executeTakeFirst();
    return row ?? null;
  }

  /** The user's threads on a trip, the most recently used first. */
  async listRecent(userId: number, tripId: number, limit: number): Promise<AssistantThreadRow[]> {
    return this.db()
      .selectFrom('assistant_threads')
      .select(COLUMNS)
      .where('user_id', '=', userId)
      .where('trip_id', '=', tripId)
      .orderBy('last_message_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
  }

  async touch(id: number, at: string): Promise<void> {
    await this.nativeUpdate({ id }, { last_message_at: at });
  }

  /** True when the thread was the user's on that trip and is gone now. */
  async deleteOwned(id: number, userId: number, tripId: number): Promise<boolean> {
    const result = await this.db()
      .deleteFrom('assistant_threads')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('trip_id', '=', tripId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  /** Retention: drops the threads nobody wrote in since `cutoff`; answers how many went. */
  async deleteIdleBefore(cutoff: string): Promise<number> {
    const result = await this.db()
      .deleteFrom('assistant_threads')
      .where('last_message_at', '<', cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /**
   * Drops the threads of users who no longer own or belong to the trip they
   * are about: removed members keep no conversation about a trip they left.
   */
  async deleteWithoutAccess(): Promise<number> {
    const result = await this.kysely<Pick<DB, 'assistant_threads' | 'trips' | 'trip_members'>>()
      .deleteFrom('assistant_threads')
      .where((eb) =>
        eb.and([
          eb.not(
            eb.exists(
              eb
                .selectFrom('trips')
                .select('trips.id')
                .whereRef('trips.id', '=', 'assistant_threads.trip_id')
                .whereRef('trips.user_id', '=', 'assistant_threads.user_id'),
            ),
          ),
          eb.not(
            eb.exists(
              eb
                .selectFrom('trip_members')
                .select('trip_members.id')
                .whereRef('trip_members.trip_id', '=', 'assistant_threads.trip_id')
                .whereRef('trip_members.user_id', '=', 'assistant_threads.user_id'),
            ),
          ),
        ]),
      )
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
