import { logError, logInfo } from '../audit/audit-log.logger';
import { CronRegistrarService } from '../scheduling/cron-registrar.service';
import { SkiAreasService } from './ski-areas.service';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

/**
 * The daily look at the Places host's winter layer (spec 7.2): when it serves
 * a new build, the index is fetched, and every area kept here whose graph
 * changed is fetched again, so a planner opening a tour tomorrow does not
 * wait for it. Area files unused for 90 days go. Nothing runs while TREK
 * Places is switched off.
 */
@Injectable()
export class SkiAreasJob implements OnApplicationBootstrap {
  constructor(
    private readonly areas: SkiAreasService,
    private readonly registrar: CronRegistrarService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.registrar.isEnabled()) return;
    this.registrar.register('ski-areas', '40 4 * * *', () => this.tick());
  }

  async tick(): Promise<void> {
    try {
      const swept = await this.areas.sweep(Date.now());
      if (swept > 0) logInfo(`[Ski] ${swept} ski area files unused for 90 days removed`);
      if (!this.areas.enabled()) return;
      if ((await this.areas.refresh()) !== 'updated') return;
      await this.refreshKept();
    } catch (err: unknown) {
      logError(`[Ski] daily ski area check: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The areas kept here whose graph the new build changed, fetched again. */
  private async refreshKept(): Promise<void> {
    const index = await this.areas.index();
    if (!index) return;
    const kept = await this.areas.keptAreas();
    const changed = index.areas.filter((area) =>
      kept.some((copy) => copy.id === area.row.id && copy.sha8 !== area.row.sha256.slice(0, 8)),
    );
    const outcomes = await Promise.allSettled(changed.map((area) => this.areas.ensureArea(area.row)));
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
    if (changed.length === 0) return;
    logInfo(`[Ski] ${changed.length - failed} of ${changed.length} kept ski areas fetched anew`);
  }
}
