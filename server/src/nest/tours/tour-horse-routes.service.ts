import { DomainError } from '../common/domain-error';
import { OverpassElementsClient } from '../overpass/overpass-elements.service';
import {
  buildHorseRoutesQuery,
  horseRouteBboxKey,
  snapHorseRouteBbox,
  toHorseRoutes,
} from './tour-horse-routes.helpers';
import { Injectable } from '@nestjs/common';
import {
  HORSE_ROUTES_ATTRIBUTION,
  HORSE_ROUTES_UNAVAILABLE_CODE,
  type FerrataBbox,
  type HorseRoutesResponse,
} from '@trek/shared';

/** How long an answer is kept: signposted routes change on the scale of seasons, the mirrors are shared. */
export const HORSE_ROUTES_KEPT_MS = 12 * 60 * 60 * 1000;

/** The most answers kept at once; the one kept longest goes first. */
const HORSE_ROUTES_KEPT_MAX = 200;

export const HORSE_ROUTES_UNAVAILABLE_MESSAGE = 'Horse route data is unavailable right now';

type Answer = Omit<HorseRoutesResponse, 'source' | 'attribution'>;

/**
 * HOR-01: the signposted horse routes around a map view, from OpenStreetMap
 * through the operator's Overpass mirrors. The view is grown to the 0.05
 * degree grid, so nearby views share one answer, and an answer is kept for
 * HORSE_ROUTES_KEPT_MS in memory; two requests for the same box at once share
 * one query. Read only: nothing is stored, and nothing about the trip is sent.
 *
 * When no mirror answers, the client gets a 502 `{ error, code }` it can show,
 * and whatever it had loaded before stays as it was.
 */
@Injectable()
export class TourHorseRoutesService {
  private readonly kept = new Map<string, { at: number; answer: Answer }>();
  private readonly pending = new Map<string, Promise<Answer>>();

  constructor(private readonly overpass: OverpassElementsClient) {}

  async list(bbox: FerrataBbox, now: number = Date.now()): Promise<HorseRoutesResponse> {
    const box = snapHorseRouteBbox(bbox);
    const key = horseRouteBboxKey(box);
    const known = this.kept.get(key);
    const answer = known && now - known.at < HORSE_ROUTES_KEPT_MS ? known.answer : await this.fetch(key, box, now);
    return { ...answer, source: 'openstreetmap', attribution: HORSE_ROUTES_ATTRIBUTION };
  }

  /** One query for the box, shared with every request for it until it settles. */
  private fetch(key: string, box: FerrataBbox, now: number): Promise<Answer> {
    const running = this.pending.get(key);
    if (running) return running;
    const run = this.query(box).then((answer) => {
      this.keep(key, answer, now);
      return answer;
    });
    this.pending.set(key, run);
    const settle = () => this.pending.delete(key);
    void run.then(settle, settle);
    return run;
  }

  private async query(box: FerrataBbox): Promise<Answer> {
    let elements: unknown[];
    try {
      elements = await this.overpass.query(buildHorseRoutesQuery(box), 'HorseRoutes');
    } catch {
      // The client already logged why each mirror failed.
      throw new DomainError(502, HORSE_ROUTES_UNAVAILABLE_MESSAGE, {
        code: HORSE_ROUTES_UNAVAILABLE_CODE,
        details: { code: HORSE_ROUTES_UNAVAILABLE_CODE },
      });
    }
    return toHorseRoutes(elements);
  }

  private keep(key: string, answer: Answer, at: number): void {
    this.kept.delete(key);
    this.kept.set(key, { at, answer });
    // A map keeps its insertion order: the first key is the one kept longest.
    if (this.kept.size > HORSE_ROUTES_KEPT_MAX) this.kept.delete(this.kept.keys().next().value as string);
  }
}
