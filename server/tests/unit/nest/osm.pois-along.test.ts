/**
 * MAPS-ALONG-020..026: the Overpass query near a line (PLN-02). One query for
 * every kind the index does not know, the candidates of the line's box kept
 * within reach of the line itself, and unnamed taps and huts kept, because
 * they are what a hike looks for, while an unnamed garden or cafe is not. The
 * network is a stubbed global fetch.
 */
import { OsmClient } from '../../../src/nest/maps/providers/osm.client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const osm = new OsmClient();

/** A line of two points, a little apart per case, so no case is answered from another's cache. */
const line = (n: number) => [
  { lat: 47.4 + n / 100, lng: 11.1 },
  { lat: 47.41 + n / 100, lng: 11.1 },
];

const answer = (elements: unknown[]) => ({ ok: true, json: async () => ({ elements }) });

/** The query of a fetch call, read back the way Overpass reads the form. */
const queryOf = (call: unknown[] | undefined) =>
  decodeURIComponent(String((call?.[1] as RequestInit | undefined)?.body ?? '')).replace(/^data=/, '');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OsmClient.searchOverpassPoisAlong', () => {
  it('MAPS-ALONG-020: asks near the line once, keeps unnamed places and drops the closed ones', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      answer([
        { type: 'node', id: 1, lat: 47.405, lon: 11.1005, tags: { amenity: 'drinking_water' } },
        { type: 'way', id: 2, center: { lat: 47.406, lon: 11.1 }, tags: { name: 'Gamshütte', amenity: 'shelter' } },
        { type: 'node', id: 3, lat: 47.407, lon: 11.1, tags: { amenity: 'drinking_water', disused: 'yes' } },
        {
          type: 'node',
          id: 4,
          lat: 47.408,
          lon: 11.1,
          tags: { name: 'Alm', amenity: 'shelter', opening_hours: 'off' },
        },
        { type: 'node', id: 5, tags: { name: 'Nowhere', amenity: 'shelter' } },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await osm.searchOverpassPoisAlong('drinking_water,shelter', line(0), 500, 'de-DE');

    const query = queryOf(fetchMock.mock.calls[0]);
    expect(query).toContain('->.cand;');
    expect(query).toContain('nwr.cand(around:550,47.40000,11.10000,47.41000,11.10000);');
    expect(query).toContain('nwr["amenity"="drinking_water"](');
    expect(query).toContain('nwr["tourism"="alpine_hut"](');
    // Thirty of each kind, and the query's own slack.
    expect(query).toContain('out center tags 85;');
    expect(out.pois.map((poi) => [poi.osm_id, poi.name, poi.category])).toEqual([
      ['node:1', '', 'drinking_water'],
      ['way:2', 'Gamshütte', 'shelter'],
    ]);
    expect(out).toMatchObject({ source: 'openstreetmap', truncated: false, clamped: false });
  });

  it('MAPS-ALONG-021: an unknown kind is refused before anything is asked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(osm.searchOverpassPoisAlong('drinking_water,unicorns', line(1), 500)).rejects.toMatchObject({
      status: 400,
    });
    await expect(osm.searchOverpassPoisAlong(' , ', line(1), 500)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('MAPS-ALONG-022: the same kinds along the same line are answered from the cache, in any order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(answer([{ type: 'node', id: 9, lat: 47.425, lon: 11.1, tags: { amenity: 'toilets' } }]));
    vi.stubGlobal('fetch', fetchMock);

    await osm.searchOverpassPoisAlong('toilets,picnic', line(2), 500, 'de');
    const asked = fetchMock.mock.calls.length;
    const again = await osm.searchOverpassPoisAlong('picnic,toilets', line(2), 500, 'de');

    expect(fetchMock.mock.calls.length).toBe(asked);
    expect(again.pois.map((poi) => poi.osm_id)).toEqual(['node:9']);
  });

  it('MAPS-ALONG-023: every mirror down throws, so the caller can name the kinds as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 504, json: async () => ({}) }));

    await expect(osm.searchOverpassPoisAlong('viewpoint', line(3), 500)).rejects.toMatchObject({ status: 502 });
  });

  it('MAPS-ALONG-024b: an answer older than five minutes is asked again, and the oldest of a full cache goes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer([]));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ now: new Date('2026-10-19T10:00:00Z'), toFake: ['Date'] });
    try {
      await osm.searchOverpassPoisAlong('bike_repair', line(5), 500);
      const asked = fetchMock.mock.calls.length;
      vi.setSystemTime(new Date('2026-10-19T10:06:00Z'));
      await osm.searchOverpassPoisAlong('bike_repair', line(5), 500);
      expect(fetchMock.mock.calls.length).toBe(2 * asked);

      // Six hundred other lines overfill the cache of five hundred: the first of them is asked again, the last is not.
      const lines = Array.from({ length: 600 }, (_, i) => [
        { lat: 10 + i / 1000, lng: 20 },
        { lat: 10.0005 + i / 1000, lng: 20 },
      ]);
      await lines.reduce<Promise<unknown>>(async (done, each) => {
        await done;
        return osm.searchOverpassPoisAlong('boat_rental', each, 250);
      }, Promise.resolve(null));
      const filled = fetchMock.mock.calls.length;
      await osm.searchOverpassPoisAlong('boat_rental', lines[599] ?? [], 250);
      expect(fetchMock.mock.calls.length).toBe(filled);
      await osm.searchOverpassPoisAlong('boat_rental', lines[0] ?? [], 250);
      expect(fetchMock.mock.calls.length).toBe(filled + asked);
    } finally {
      vi.useRealTimers();
    }
  });

  it('MAPS-ALONG-026: only the kinds OSM rarely names keep their unnamed places, a city walk gets named ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        answer([
          { type: 'node', id: 1, lat: 47.465, lon: 11.1, tags: { amenity: 'drinking_water' } },
          { type: 'way', id: 2, center: { lat: 47.466, lon: 11.1 }, tags: { leisure: 'garden' } },
          { type: 'way', id: 3, center: { lat: 47.467, lon: 11.1 }, tags: { leisure: 'garden', name: 'Hofgarten' } },
          { type: 'node', id: 4, lat: 47.468, lon: 11.1, tags: { amenity: 'cafe' } },
          { type: 'node', id: 5, lat: 47.469, lon: 11.1, tags: { historic: 'memorial' } },
          { type: 'node', id: 6, lat: 47.469, lon: 11.1, tags: { tourism: 'viewpoint' } },
        ]),
      ),
    );

    const out = await osm.searchOverpassPoisAlong('drinking_water,park,cafe,sights,viewpoint', line(6), 500, 'de');

    expect(out.pois.map((poi) => [poi.osm_id, poi.name, poi.category])).toEqual([
      ['node:1', '', 'drinking_water'],
      ['way:3', 'Hofgarten', 'park'],
      ['node:6', '', 'viewpoint'],
    ]);
  });

  it('MAPS-ALONG-024: more places than the budget are cut to it and said to be', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      type: 'node',
      id: 100 + i,
      lat: 47.44,
      lon: 11.1,
      tags: { tourism: 'viewpoint' },
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(many)));

    const out = await osm.searchOverpassPoisAlong('viewpoint', line(4), 500, undefined, 30);

    expect(out.pois).toHaveLength(30);
    expect(out.truncated).toBe(true);
  });
});

describe('OsmClient.searchOverpassPois (the explore pill)', () => {
  it('MAPS-ALONG-025: still drops unnamed places, which a plan has no use for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        answer([
          { type: 'node', id: 1, lat: 50.1, lon: 8.1, tags: { amenity: 'cafe' } },
          { type: 'node', id: 3, lat: 50.1, lon: 8.1 },
          {
            type: 'node',
            id: 2,
            lat: 50.11,
            lon: 8.11,
            tags: { name: 'Café Mozart', amenity: 'cafe', 'brand:wikidata': 'Q123' },
          },
        ]),
      ),
    );

    const out = await osm.searchOverpassPois('cafe', { south: 50.05, west: 8.05, north: 50.15, east: 8.15 }, 'de');

    expect(out.pois.map((poi) => [poi.name, poi.brand_wikidata])).toEqual([['Café Mozart', 'Q123']]);
  });
});
