import { Injectable } from '@nestjs/common';
import type { ObstacleCandidate, PaddleCheck, PaddleCheckLine, TourOwnEntry } from '@trek/shared';

/** What reading the obstacle data along one line made of it, before the stored decisions are laid over it. */
export interface PaddleCheckEvaluation {
  line: PaddleCheckLine;
  candidates: ObstacleCandidate[];
  own: TourOwnEntry[];
  /** The checklist key of every object the read held, to tell a vanished object from one the route left. */
  dataKeys: ReadonlySet<string>;
  /** The data covers the whole line and nothing was cut, so a missing object is really missing. */
  complete: boolean;
  data: Pick<PaddleCheck, 'data' | 'data_as_of' | 'read_at'>;
}

const MAX_ENTRIES = 256;

/**
 * The evaluations of the last lines read, keyed by the line, the boat and
 * the version of the obstacle data, so the tours list of a trip reads its
 * paddle tours' obstacles once and not on every call. Held in memory: one
 * process serves the app, and a new data version simply misses.
 */
@Injectable()
export class PaddleCheckCache {
  private readonly entries = new Map<string, PaddleCheckEvaluation>();

  get(key: string): PaddleCheckEvaluation | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      // Read again, kept longer: the map's order is the order of use.
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  set(key: string, value: PaddleCheckEvaluation): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
