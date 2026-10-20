import { SKI_DISCIPLINES, SKI_TECHNIQUES, skiIssues, tourSkiClassificationRequestSchema } from './ski.schema';
import { tourGpxImportFieldsSchema } from './tour-gpx-import.schema';
import {
  importableTourTypeSchema,
  plannableTourTypeSchema,
  tourCreateRequestSchema,
  tourListItemSchema,
} from './tours.schema';

import { describe, expect, it } from 'vitest';

describe('ski tracks (SKI-02)', () => {
  it('SKI-SCHEMA-001: knows four disciplines and three cross-country techniques, unknown among them on purpose', () => {
    expect(SKI_DISCIPLINES).toEqual(['alpine', 'snowboard', 'cross_country', 'touring']);
    expect(SKI_TECHNIQUES).toEqual(['classic', 'skating', 'unknown']);
  });

  it('SKI-SCHEMA-002: ski is a type a track can be imported as, never one the planner plans', () => {
    expect(importableTourTypeSchema.options).toEqual([...plannableTourTypeSchema.options, 'ski']);
    expect(plannableTourTypeSchema.safeParse('ski').success).toBe(false);
    const planned = {
      name: 'Valley run',
      tour_type: 'ski',
      route_geometry: [
        [47, 11, 1200],
        [47.01, 11.01, 1100],
      ],
      waypoints: [
        { lat: 47, lng: 11, role: 'start', sequence: 0 },
        { lat: 47.01, lng: 11.01, role: 'end', sequence: 1 },
      ],
    };
    expect(tourCreateRequestSchema.safeParse(planned).success).toBe(false);
  });

  it('SKI-SCHEMA-003: a ski track names its discipline, a cross-country one its technique, and nothing else may', () => {
    expect(skiIssues(true, { ski_discipline: 'alpine' })).toEqual([]);
    expect(skiIssues(true, { ski_discipline: 'cross_country', ski_technique: 'unknown' })).toEqual([]);
    expect(skiIssues(true, {})).toEqual([{ path: ['ski_discipline'], message: 'a ski track needs a discipline' }]);
    expect(skiIssues(true, { ski_discipline: 'cross_country' })[0]?.path).toEqual(['ski_technique']);
    expect(skiIssues(true, { ski_discipline: 'touring', ski_technique: 'skating' })[0]?.message).toMatch(
      /only a cross-country track/,
    );
    expect(skiIssues(false, { ski_discipline: 'alpine', ski_technique: 'classic' }).map((i) => i.path)).toEqual([
      ['ski_discipline'],
      ['ski_technique'],
    ]);
    expect(skiIssues(false, { ski_discipline: null, ski_technique: null })).toEqual([]);
  });

  it('SKI-SCHEMA-004: imports a GPX file as ski only with its discipline, and ski fields only for ski', () => {
    expect(tourGpxImportFieldsSchema.parse({ tour_type: 'ski', ski_discipline: 'touring' })).toEqual({
      tour_type: 'ski',
      ski_discipline: 'touring',
    });
    expect(
      tourGpxImportFieldsSchema.parse({ tour_type: 'ski', ski_discipline: 'cross_country', ski_technique: 'skating' }),
    ).toMatchObject({ ski_technique: 'skating' });
    for (const fields of [
      { tour_type: 'ski' },
      { tour_type: 'ski', ski_discipline: 'cross_country' },
      { tour_type: 'ski', ski_discipline: 'alpine', ski_technique: 'classic' },
      { tour_type: 'ski', ski_discipline: 'slalom' },
      { tour_type: 'ski', ski_discipline: 'alpine', run_profile: 'running' },
      { tour_type: 'hike', ski_discipline: 'alpine' },
      { tour_type: 'run', run_profile: 'trail', ski_technique: 'classic' },
    ]) {
      expect(tourGpxImportFieldsSchema.safeParse(fields).success).toBe(false);
    }
  });

  it('SKI-SCHEMA-005: a classification names a discipline, a technique only for cross-country, and an optional revision', () => {
    expect(tourSkiClassificationRequestSchema.parse({ ski_discipline: 'snowboard', expected_revision: 3 })).toEqual({
      ski_discipline: 'snowboard',
      expected_revision: 3,
    });
    expect(
      tourSkiClassificationRequestSchema.parse({ ski_discipline: 'cross_country', ski_technique: 'classic' }),
    ).toMatchObject({ ski_technique: 'classic' });
    for (const body of [
      {},
      { ski_discipline: 'cross_country' },
      { ski_discipline: 'cross_country', ski_technique: null },
      { ski_discipline: 'alpine', ski_technique: 'skating' },
      { ski_discipline: 'alpine', expected_revision: 0 },
    ]) {
      expect(tourSkiClassificationRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('SKI-SCHEMA-006: lists the discipline and technique, and reads a list cached before they existed', () => {
    const listed = {
      place_id: 4,
      tour_type: 'ski',
      distance: 12.4,
      elevation_gain: 980,
      elevation_loss: 990,
      duration: null,
      difficulty: null,
      wanderer_ref: null,
      match_confidence: 1,
      max_hiking_difficulty: null,
      name: 'Up to the hut',
      planned: false,
      caution: false,
    };
    expect(tourListItemSchema.parse({ ...listed, ski_discipline: 'touring', ski_technique: null })).toMatchObject({
      ski_discipline: 'touring',
      ski_technique: null,
    });
    expect(tourListItemSchema.parse(listed).ski_discipline).toBeUndefined();
    expect(tourListItemSchema.safeParse({ ...listed, ski_discipline: 'freeride' }).success).toBe(false);
  });
});
