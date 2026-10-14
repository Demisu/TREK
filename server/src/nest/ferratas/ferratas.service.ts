import { DomainError } from '../common/domain-error';
import { FerratasOverpassClient } from './ferratas-overpass.client';
import { buildFerrataQuery, ferrataCacheKey, snapFerrataBbox, toFerratas } from './ferratas.helpers';
import { Injectable } from '@nestjs/common';
import { FERRATAS_ATTRIBUTION, FERRATAS_UNAVAILABLE_CODE, type FerrataBbox, type FerratasResponse } from '@trek/shared';

/** Via ferratas change on the scale of seasons; a day keeps Overpass out of every map pan. */
export const FERRATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** The most boxes held at once; the oldest goes first, so roaming the globe cannot grow the map without bound. */
export const FERRATA_CACHE_MAX = 300;

export const FERRATAS_UNAVAILABLE_MESSAGE = 'Via ferrata data is unavailable right now';

interface CacheEntry {
  at: number;
  value: FerratasResponse;
}

/**
 * The via ferratas inside a box, from OpenStreetMap.
 *
 * Read-only and per process: answers are cached by the box snapped to a 0.05
 * degree grid, and concurrent requests for the same snapped box share one
 * Overpass call. A failure is never cached, so the next request tries again;
 * it reaches the client as a 502 `{ error, code }` it can show, never as a
 * 500 with a stack.
 */
@Injectable()
export class FerratasService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<FerratasResponse>>();

  constructor(private readonly overpass: FerratasOverpassClient) {}

  /** The via ferratas that reach into `bbox`; the cache holds the wider snapped box. */
  async list(bbox: FerrataBbox, now: number = Date.now()): Promise<FerratasResponse> {
    return withinBbox(await this.listSnapped(bbox, now), bbox);
  }

  private async listSnapped(bbox: FerrataBbox, now: number): Promise<FerratasResponse> {
    const snapped = snapFerrataBbox(bbox);
    const key = ferrataCacheKey(snapped);
    const hit = this.cache.get(key);
    if (hit && now - hit.at < FERRATA_CACHE_TTL_MS) return hit.value;
    if (hit) this.cache.delete(key);

    const inFlight = this.pending.get(key);
    if (inFlight !== undefined) return inFlight;
    // Memoised in-flight load, not a missing await: concurrent callers join the
    // promise above, and this frame awaits it below.
    const load = this.load(snapped);
    this.pending.set(key, load);
    try {
      const value = await load;
      this.remember(key, { at: now, value });
      return value;
    } finally {
      this.pending.delete(key);
    }
  }

  private async load(snapped: FerrataBbox): Promise<FerratasResponse> {
    let elements: unknown[];
    try {
      elements = await this.overpass.query(buildFerrataQuery(snapped));
    } catch {
      // The client already logged why each mirror failed.
      throw new DomainError(502, FERRATAS_UNAVAILABLE_MESSAGE, {
        code: FERRATAS_UNAVAILABLE_CODE,
        details: { code: FERRATAS_UNAVAILABLE_CODE },
      });
    }
    const { ferratas, truncated } = toFerratas(elements);
    return { ferratas, truncated, source: 'openstreetmap', attribution: FERRATAS_ATTRIBUTION };
  }

  private remember(key: string, entry: CacheEntry): void {
    this.cache.delete(key);
    while (this.cache.size >= FERRATA_CACHE_MAX) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
    this.cache.set(key, entry);
  }
}

/** A ferrata belongs to the box when any point of its line lies inside it. */
function withinBbox(response: FerratasResponse, bbox: FerrataBbox): FerratasResponse {
  const inside = ([lat, lng]: readonly unknown[]) =>
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= bbox.south &&
    lat <= bbox.north &&
    lng >= bbox.west &&
    lng <= bbox.east;
  return { ...response, ferratas: response.ferratas.filter((ferrata) => ferrata.geometry.some(inside)) };
}
