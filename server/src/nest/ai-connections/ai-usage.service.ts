import { AssistantUsage } from '../../db/entities/AssistantUsage.entity';
import type { AssistantUsageRepository } from '../../db/repositories/AssistantUsage.repository';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import { todayUtc, type AiConnectionScope } from '@trek/shared';

/**
 * What the assistant used, per user, UTC day and payer: the turns the daily
 * limit counts (only those the instance pays for) and the tokens behind them.
 * The day is the UTC calendar day, so a limit resets at midnight UTC.
 */
@Injectable()
export class AiUsageService {
  constructor(@InjectRepository(AssistantUsage) private readonly usage: AssistantUsageRepository) {}

  /** Adds a turn's usage to today's row; the turn itself is counted once, when it starts. */
  async record(
    userId: number,
    paidBy: AiConnectionScope,
    delta: { turns?: number; inputTokens?: number; outputTokens?: number },
  ): Promise<void> {
    await this.usage.add(userId, todayUtc(), paidBy, {
      turns: delta.turns ?? 0,
      inputTokens: delta.inputTokens ?? 0,
      outputTokens: delta.outputTokens ?? 0,
    });
  }

  /** The turns a user took today on the instance's connection. */
  async instanceTurnsToday(userId: number): Promise<number> {
    return this.usage.turnsOn(userId, todayUtc(), 'instance');
  }

  /** Retention: drops the days older than `days`; answers how many rows went. */
  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return this.usage.deleteBefore(cutoff);
  }
}
