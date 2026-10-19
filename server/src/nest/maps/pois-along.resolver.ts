/**
 * Places of some kinds near a line (PLN-02, CW-05), from the TREK index and
 * OpenStreetMap side by side.
 *
 * The kinds the index knows are asked in circles strung along the line, the way
 * the explore pill asks it for a viewport: one small request per kind and
 * circle, each inside the service's limits, a few at a time. An empty
 * circle is an answer, so those kinds never wait on Overpass while the index
 * answers. The kinds it does not know (a viewpoint, a tap, a hut) go to
 * Overpass at the same time, one query near each stretch of the whole line,
 * with a short deadline. A source that fails is logged and its kinds named in
 * `failed`, so the caller can say what could not be searched instead of
 * reporting nothing found.
 *
 * MapsService.poisAlong delegates here and hands in whether the index is
 * switched on, which is a deployment property it owns.
 */
import { logWarn } from '../audit/audit-log.logger';
import { alongPlan, overpassStretches, type AlongPlan } from './maps-along.helpers';
import {
  indexKnowsCategory,
  indexPoiAnswer,
  indexPoiPlanAround,
  indexRequestsPerKind,
  ownedByAsked,
} from './maps-index.helpers';
import type { OverpassPoi } from './maps.helpers';
import { OsmClient } from './providers/osm.client';
import { trekPlacesNearby } from './trek-places.client';
import { Injectable } from '@nestjs/common';
import type { LatLng } from '@trek/shared/roadtrip';

/** How many index requests are in flight at once, so one search never floods the service. */
const PARALLEL_INDEX_REQUESTS = 8;

/** How many stretches one source asks Overpass for at once, so the public mirrors are not flooded. */
const PARALLEL_OVERPASS_STRETCHES = 3;

/** What is searched for along which line: the kinds, how far from it, and each kind's budget per source. */
interface PoisAlongQuery {
  categories: string[];
  line: LatLng[];
  corridorM: number;
  lang?: string;
  limit: number;
}

export interface PoisAlongResult {
  pois: OverpassPoi[];
  /** The kinds no source could be asked for right now: their places are missing, not absent. */
  failed: string[];
  /** Some circles or stretches of the line could not be searched; the places of the others are there. */
  partial: boolean;
  /** A source had more places than it answered with. */
  truncated: boolean;
  /** The line was longer than one search covers; only its first part was searched. */
  capped: boolean;
}

/** What one request of a source brings back. */
interface Page {
  pois: OverpassPoi[];
  truncated: boolean;
}

interface Batched extends Page {
  /** How many of the source's requests answered, and how many failed. */
  answered: number;
  missed: number;
  /** Why requests failed, or null when every one answered. */
  error: string | null;
}

interface SourceAnswer extends Batched {
  /** The source was asked along the start of the line only. */
  capped: boolean;
}

const NOTHING: SourceAnswer = { pois: [], truncated: false, answered: 0, missed: 0, error: null, capped: false };

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Each place once, as the first circle or source that found it has it: neighbouring circles overlap. */
function oncePerPlace(pois: OverpassPoi[]): OverpassPoi[] {
  const seen = new Map<string, OverpassPoi>();
  for (const poi of pois) if (!seen.has(poi.osm_id)) seen.set(poi.osm_id, poi);
  return [...seen.values()];
}

/**
 * Requests a few at a time, each batch after the last, so no more than a
 * batch is ever in flight; a failed one leaves the others.
 */
async function inBatches(requests: Array<() => Promise<Page>>, parallel: number): Promise<Batched> {
  const batches = Array.from({ length: Math.ceil(requests.length / parallel) }, (_, index) =>
    requests.slice(index * parallel, (index + 1) * parallel),
  );
  const settled = await batches.reduce<Promise<PromiseSettledResult<Page>[]>>(
    async (done, batch) => [...(await done), ...(await Promise.allSettled(batch.map((ask) => ask())))],
    Promise.resolve([]),
  );
  const pages = settled.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
  const misses = settled.flatMap((entry) => (entry.status === 'rejected' ? [reason(entry.reason)] : []));
  return {
    pois: pages.flatMap((page) => page.pois),
    truncated: pages.some((page) => page.truncated),
    answered: pages.length,
    missed: misses.length,
    error: misses.length ? `${misses.length} of ${settled.length} requests failed: ${misses[0]}` : null,
  };
}

/** A source asked that answered none of its requests: its kinds could not be searched. */
const unanswered = (answer: SourceAnswer) => answer.missed > 0 && answer.answered === 0;

@Injectable()
export class PoisAlongResolver {
  constructor(private readonly osm: OsmClient) {}

  async search(query: PoisAlongQuery, indexEnabled: boolean): Promise<PoisAlongResult> {
    const plan = alongPlan(query.line, query.corridorM);
    const indexed = indexEnabled ? query.categories.filter(indexKnowsCategory) : [];
    const rest = query.categories.filter((key) => !indexed.includes(key));
    // Only an index that answered no circle at all hands its kinds to Overpass,
    // once, while the other kinds are still being asked there rather than after.
    const indexPart = this.askIndex(indexed, plan, query.limit).then(async (index) => ({
      index,
      fallback: indexed.length > 0 && index.answered === 0 ? await this.askOverpass(indexed, query) : NOTHING,
    }));
    const [{ index, fallback }, overpass] = await Promise.all([indexPart, this.askOverpass(rest, query)]);
    if (index.error) logWarn(`[Maps] TREK places index along a line: ${index.error}`);
    for (const answer of [overpass, fallback]) {
      if (answer.error) logWarn(`[Maps] OpenStreetMap along a line: ${answer.error}`);
    }
    const sources = [index, overpass, fallback];
    return {
      pois: oncePerPlace([...index.pois, ...overpass.pois, ...fallback.pois]),
      failed: [...(unanswered(overpass) ? rest : []), ...(unanswered(fallback) ? indexed : [])],
      partial: sources.some((answer) => answer.answered > 0 && answer.missed > 0),
      truncated: sources.some((answer) => answer.truncated),
      // A source that answered nothing searched nothing: its kinds are failed or asked of Overpass instead.
      capped: sources.some((answer) => answer.answered > 0 && answer.capped),
    };
  }

  /** The index kinds in every circle, a few requests at a time; a failed request leaves the others. */
  private async askIndex(kinds: string[], plan: AlongPlan, limit: number): Promise<SourceAnswer> {
    // No kinds make no plan, and so no request.
    const requests = plan.beads.flatMap((bead) => {
      const circle = indexPoiPlanAround(kinds.join(','), bead, bead.radiusM, limit);
      return circle
        ? indexRequestsPerKind(circle).map((request) => async (): Promise<Page> => {
            const found = await trekPlacesNearby(circle.lat, circle.lng, {
              radius: circle.radius,
              limit: request.limit,
              category: request.category,
            });
            // A row goes to the kind that names its path most closely: a water park is no park.
            const own = found.filter((row) => ownedByAsked(row, kinds));
            const answer = indexPoiAnswer(own, circle, found.length >= request.limit);
            return { pois: answer.pois, truncated: answer.truncated };
          })
        : [];
    });
    return { ...(await inBatches(requests, PARALLEL_INDEX_REQUESTS)), capped: plan.capped };
  }

  /**
   * The other kinds near each stretch of the whole line, one Overpass query
   * per stretch; nothing to ask is nothing found.
   */
  private async askOverpass(kinds: string[], query: PoisAlongQuery): Promise<SourceAnswer> {
    if (!kinds.length) return NOTHING;
    const along = overpassStretches(query.line);
    const asked = kinds.join(',');
    const requests = along.stretches.map(
      (stretch) => () => this.osm.searchOverpassPoisAlong(asked, stretch, query.corridorM, query.lang, query.limit),
    );
    const answer = await inBatches(requests, PARALLEL_OVERPASS_STRETCHES);
    return { ...answer, error: answer.error && `${kinds.join(', ')}: ${answer.error}`, capped: along.capped };
  }
}
