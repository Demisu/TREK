import { mapsApi } from '../api/client';
import { isEffectivelyOffline } from '../sync/networkMode';

/** How many coordinates the cache remembers before it starts over. */
const CACHE_LIMIT = 500;
/** How many lookups may be in flight at once, so a long tour does not flood the geocoder. */
const CONCURRENCY = 2;

const cache = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let running = 0;

/**
 * Five decimals are about a metre: a point nudged by less than that is the same
 * place, and a point moved further is asked for again.
 */
function keyOf(lat: number, lng: number, lang: string): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}|${lang}`;
}

function runQueued<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          queue.shift()?.();
        });
    };
    if (running < CONCURRENCY) start();
    else queue.push(start);
  });
}

/** The name a reverse lookup gives, or the first part of its address when it has no name. */
function placeLabel(result: { name: string | null; address: string | null }): string | null {
  const name = result.name?.trim();
  if (name) return name;
  const first = result.address?.split(',')[0]?.trim();
  return first || null;
}

export const reverseGeocodeRepo = {
  /**
   * A short place name for a coordinate, or null when the geocoder knows none.
   * Rejects offline and on a failed lookup; a failure is not cached, so the
   * same point is asked again the next time it is shown.
   */
  placeName(lat: number, lng: number, lang: string): Promise<string | null> {
    if (isEffectivelyOffline()) return Promise.reject(new Error('Offline'));
    const key = keyOf(lat, lng, lang);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (cache.size >= CACHE_LIMIT) cache.clear();
    const value = runQueued(() => mapsApi.reverse(lat, lng, lang)).then(placeLabel);
    cache.set(key, value);
    void value.catch(() => {
      if (cache.get(key) === value) cache.delete(key);
    });
    return value;
  },
  /** Forgets every remembered name; for tests. */
  clear() {
    cache.clear();
  },
};
