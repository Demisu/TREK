import {
  FERRATA_QUERY_TIMEOUT_S,
  buildFerrataQuery,
  ferrataCacheKey,
  overpassFerrataAnswerSchema,
  parseFerrataGrade,
  snapFerrataBbox,
  toFerratas,
} from '../../../src/nest/ferratas/ferratas.helpers';
import { FERRATAS_RESULT_CAP } from '@trek/shared';

import { describe, expect, it } from 'vitest';

const line = [
  { lat: 47.1, lon: 11.2 },
  { lat: 47.11, lon: 11.21 },
];
const way = (id: number, tags: Record<string, string> = {}, geometry: unknown = line) => ({
  type: 'way',
  id,
  tags: { highway: 'via_ferrata', ...tags },
  geometry,
});

describe('parseFerrataGrade', () => {
  it.each([
    ['0', 0, null],
    ['3', 3, null],
    ['6', 6, null],
    ['2+', 2, '+'],
    ['4-', 4, '-'],
    [' 5 ', 5, null],
  ])('reads %j as level %s', (raw, level, plus) => {
    expect(parseFerrataGrade(raw)).toEqual({ raw: raw.trim(), level, plus });
  });

  it.each(['7', '-1', 'C', 'C/D', 'K3', '2++', '3 +', 'difficult', '2.5'])('keeps %j as unknown', (raw) => {
    expect(parseFerrataGrade(raw)).toEqual({ raw, level: null, plus: null });
  });

  it('answers all null for a missing or blank tag', () => {
    expect(parseFerrataGrade(undefined)).toEqual({ raw: null, level: null, plus: null });
    expect(parseFerrataGrade('   ')).toEqual({ raw: null, level: null, plus: null });
  });

  it('cuts an overlong raw value to what the contract holds', () => {
    expect(parseFerrataGrade('x'.repeat(100)).raw).toHaveLength(64);
  });
});

describe('snapFerrataBbox and ferrataCacheKey', () => {
  it('grows the box outwards to the 0.05 degree grid', () => {
    expect(snapFerrataBbox({ south: 47.12, west: 11.21, north: 47.38, east: 11.57 })).toEqual({
      south: 47.1,
      west: 11.2,
      north: 47.4,
      east: 11.6,
    });
  });

  it('leaves a box already on the grid as it is', () => {
    const onGrid = { south: 47.1, west: 11.2, north: 47.4, east: 11.6 };
    expect(snapFerrataBbox(onGrid)).toEqual(onGrid);
  });

  it('handles negative coordinates and clamps to the globe', () => {
    expect(snapFerrataBbox({ south: -89.99, west: -179.99, north: -89.9, east: -179.9 })).toEqual({
      south: -90,
      west: -180,
      north: -89.9,
      east: -179.9,
    });
  });

  it('gives two nearby requests the same key', () => {
    const a = ferrataCacheKey(snapFerrataBbox({ south: 47.11, west: 11.21, north: 47.39, east: 11.59 }));
    const b = ferrataCacheKey(snapFerrataBbox({ south: 47.12, west: 11.22, north: 47.38, east: 11.58 }));
    expect(a).toBe(b);
    expect(a).toBe('47.1,11.2,47.4,11.6');
  });
});

describe('buildFerrataQuery', () => {
  const query = buildFerrataQuery({ south: 47.1, west: 11.2, north: 47.4, east: 11.6 });

  it('carries the server-side timeout and JSON output', () => {
    expect(query.startsWith(`[out:json][timeout:${FERRATA_QUERY_TIMEOUT_S}];`)).toBe(true);
  });

  it('asks for the tagged ways, the scaled paths and the route members inside the box', () => {
    const box = '(47.1,11.2,47.4,11.6)';
    expect(query).toContain(`way["highway"="via_ferrata"]${box};`);
    expect(query).toContain(`way["highway"~"^(path|footway)$"]["via_ferrata_scale"]${box};`);
    expect(query).toContain(`rel["route"="via_ferrata"]${box}->.routes;`);
    expect(query).toContain(`way(r.routes)${box};`);
  });

  it('asks for one way more than the cap, with geometry, and the relations with their members', () => {
    expect(query).toContain(`.ways out geom qt ${FERRATAS_RESULT_CAP + 1};`);
    expect(query).toContain('.routes out body qt;');
  });
});

describe('overpassFerrataAnswerSchema', () => {
  it('accepts an element list with or without a remark', () => {
    expect(overpassFerrataAnswerSchema.safeParse({ elements: [] }).success).toBe(true);
    expect(overpassFerrataAnswerSchema.safeParse({ elements: [], remark: 'runtime error' }).success).toBe(true);
  });

  it('refuses a body without elements', () => {
    expect(overpassFerrataAnswerSchema.safeParse({ error: 'x' }).success).toBe(false);
    expect(overpassFerrataAnswerSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('toFerratas', () => {
  it('maps a way to the wire row', () => {
    const { ferratas, truncated } = toFerratas([way(42, { name: ' Pisciadù ', via_ferrata_scale: '3+' })]);
    expect(truncated).toBe(false);
    expect(ferratas).toEqual([
      {
        id: 'way/42',
        name: 'Pisciadù',
        grade: { raw: '3+', level: 3, plus: '+' },
        routeName: null,
        geometry: [
          [47.1, 11.2],
          [47.11, 11.21],
        ],
        osmUrl: 'https://www.openstreetmap.org/way/42',
      },
    ]);
  });

  it('names a way after the first named route relation that holds it', () => {
    const { ferratas } = toFerratas([
      way(1),
      way(2),
      { type: 'relation', id: 9, tags: { route: 'via_ferrata' }, members: [{ type: 'way', ref: 1, role: '' }] },
      {
        type: 'relation',
        id: 10,
        tags: { route: 'via_ferrata', name: 'Via delle Bocchette' },
        members: [
          { type: 'node', ref: 2, role: '' },
          { type: 'way', ref: 1, role: '' },
        ],
      },
      { type: 'relation', id: 11, tags: { name: 'Second' }, members: [{ type: 'way', ref: 1, role: '' }] },
    ]);
    expect(ferratas.map((f) => [f.id, f.routeName])).toEqual([
      ['way/1', 'Via delle Bocchette'],
      ['way/2', null],
    ]);
  });

  it('leaves out malformed elements, duplicates and lines that cannot be drawn', () => {
    const { ferratas } = toFerratas([
      null,
      'way',
      { type: 'node', id: 3, lat: 1, lon: 2 },
      { type: 'way', id: -1, geometry: line },
      way(5, {}, [{ lat: 47.1, lon: 11.2 }, null]),
      way(6, {}, undefined),
      way(7, {}, [{ lat: 470, lon: 11.2 }, line[1]]),
      way(8),
      way(8),
      way(9, {}, [line[0], null, line[1]]),
    ]);
    expect(ferratas.map((f) => f.id)).toEqual(['way/8', 'way/9']);
    expect(ferratas[1]?.geometry).toHaveLength(2);
  });

  it('keeps a blank name as null', () => {
    expect(toFerratas([way(1, { name: '  ' })]).ferratas[0]?.name).toBeNull();
  });

  it('cuts at the cap and says so', () => {
    const many = Array.from({ length: FERRATAS_RESULT_CAP + 1 }, (_, i) => way(i + 1));
    const { ferratas, truncated } = toFerratas(many);
    expect(truncated).toBe(true);
    expect(ferratas).toHaveLength(FERRATAS_RESULT_CAP);
  });

  it('stays truncated when Overpass hit the cap but a dropped way brings the rows under it', () => {
    const many = Array.from({ length: FERRATAS_RESULT_CAP }, (_, i) => way(i + 1));
    const { ferratas, truncated } = toFerratas([...many, way(FERRATAS_RESULT_CAP + 1, {}, [{ lat: 46.5, lon: 11.7 }])]);
    expect(ferratas).toHaveLength(FERRATAS_RESULT_CAP);
    expect(truncated).toBe(true);
  });

  it('is not truncated at exactly the cap', () => {
    const many = Array.from({ length: FERRATAS_RESULT_CAP }, (_, i) => way(i + 1));
    expect(toFerratas(many).truncated).toBe(false);
  });
});
