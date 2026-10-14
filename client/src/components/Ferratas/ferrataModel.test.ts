// FE-FERRATA-MODEL-001 to FE-FERRATA-MODEL-008: the pure half of the via ferrata layer.
import { describe, expect, it } from 'vitest';

import { FERRATA_BBOX_MAX_SPAN_DEG, type Ferrata } from '@trek/shared';

import {
  ferrataBboxFits,
  ferrataBboxParam,
  ferrataFeatureCollection,
  ferrataGradeLabel,
  ferrataGradeTone,
  ferrataOsmUrl,
  ferrataPositions,
  roundFerrataBbox,
} from './ferrataModel';

const grade = (level: number | null, plus: '+' | '-' | null = null, raw: string | null = null) => ({
  level,
  plus,
  raw,
});

const FERRATA: Ferrata = {
  id: 'way/123',
  name: 'Pisciadù',
  grade: grade(3, '+', '3+'),
  routeName: 'Brigata Tridentina',
  geometry: [
    [46.53, 11.81],
    [46.54, 11.82],
  ],
  osmUrl: 'https://www.openstreetmap.org/way/123',
};

describe('ferrataModel', () => {
  it('FE-FERRATA-MODEL-001: labels a numeric grade on the K scale with its plus or minus', () => {
    expect(ferrataGradeLabel(grade(3))).toBe('K3');
    expect(ferrataGradeLabel(grade(4, '+'))).toBe('K4+');
    expect(ferrataGradeLabel(grade(2, '-'))).toBe('K2-');
    expect(ferrataGradeLabel(grade(0))).toBe('K0');
  });

  it('FE-FERRATA-MODEL-002: has no label for a way without a numeric level, letter scales included', () => {
    expect(ferrataGradeLabel(grade(null))).toBeNull();
    expect(ferrataGradeLabel(grade(null, null, 'C/D'))).toBeNull();
  });

  it('FE-FERRATA-MODEL-003: bands levels 0 to 2 easy, 3 and 4 medium, 5 and 6 hard, none unknown', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((level) => ferrataGradeTone(grade(level)))).toEqual([
      'easy',
      'easy',
      'easy',
      'medium',
      'medium',
      'hard',
      'hard',
    ]);
    expect(ferrataGradeTone(grade(null, null, 'C'))).toBe('unknown');
  });

  it('FE-FERRATA-MODEL-004: rounds the map area outwards to three decimals, inside the world', () => {
    expect(roundFerrataBbox({ south: 46.12345, west: 11.98761, north: 46.20001, east: 12.1 })).toEqual({
      south: 46.123,
      west: 11.987,
      north: 46.201,
      east: 12.1,
    });
    expect(roundFerrataBbox({ south: -90.5, west: -181, north: 91, east: 180.4 })).toEqual({
      south: -90,
      west: -180,
      north: 90,
      east: 180,
    });
  });

  it('FE-FERRATA-MODEL-005: takes an area only up to the server limit and only a real box', () => {
    const max = FERRATA_BBOX_MAX_SPAN_DEG;
    expect(ferrataBboxFits({ south: 46, west: 11, north: 46 + max, east: 11 + max })).toBe(true);
    expect(ferrataBboxFits({ south: 46, west: 11, north: 46 + max + 0.01, east: 11.2 })).toBe(false);
    expect(ferrataBboxFits({ south: 46, west: 11, north: 46.2, east: 11 + max + 0.01 })).toBe(false);
    expect(ferrataBboxFits({ south: 46.2, west: 11, north: 46.2, east: 11.2 })).toBe(false);
    // The server's own rule: a rounded 0.500 span that reads 0.5000000000000071 still goes out.
    expect(ferrataBboxFits({ south: 63.501, west: 11, north: 64.001, east: 11.2 })).toBe(true);
  });

  it('FE-FERRATA-MODEL-006: writes the bbox parameter in south,west,north,east order', () => {
    expect(ferrataBboxParam({ south: 46.1, west: 11.25, north: 46.3, east: 11.5 })).toBe('46.100,11.250,46.300,11.500');
  });

  it('FE-FERRATA-MODEL-007: builds GeoJSON with [lng, lat] coordinates and only the id and tone', () => {
    const collection = ferrataFeatureCollection([FERRATA]);
    expect(collection).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'way/123', tone: 'medium' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [11.81, 46.53],
              [11.82, 46.54],
            ],
          },
        },
      ],
    });
    expect(ferrataPositions(FERRATA)).toEqual(FERRATA.geometry);
    expect(ferrataFeatureCollection([]).features).toEqual([]);
  });

  it('FE-FERRATA-MODEL-008: links only ever to openstreetmap.org, whatever the answer sent as osmUrl', () => {
    expect(ferrataOsmUrl(FERRATA)).toBe('https://www.openstreetmap.org/way/123');
    expect(ferrataOsmUrl({ id: 'javascript:alert(1)' })).toBe('https://www.openstreetmap.org/');
  });
});
