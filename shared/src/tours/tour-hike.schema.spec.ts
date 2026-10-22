import { HIKE_PLAN_LINE_POINTS } from './hike-plan.schema';
import {
  HIKE_MAX_WAYPOINTS,
  HIKE_PROPOSAL_SAC_SEGMENTS,
  hikeCreateRequestSchema,
  hikeProposalSchema,
  hikeProposeRequestSchema,
  hikeRouteOutcomeSchema,
  TOUR_GPX_TEXT_MAX,
  tourGpxImportRequestSchema,
  tourUpdateRequestSchema,
} from './tour-hike.schema';

import { describe, expect, it } from 'vitest';

const point = (index: number) => ({ lat: 47.4 + index / 100, lng: 11.1 });
const two = [point(0), point(1)];

const proposal = {
  name: 'Herzogstand',
  variant_label: 'short and steep',
  route: { planned: true },
  unreachable: null,
  distance_m: 8200,
  ascent_m: 640,
  descent_m: 640,
  duration_minutes: 200,
  duration_basis: 'din33466',
  heights_known: true,
  min_ele_m: 720,
  max_ele_m: 1360,
  line: [
    [47.4, 11.1, 720],
    [47.41, 11.1, 1360],
  ],
  profile: [
    [0, 720],
    [8200, 1360],
  ],
  sac: { highest: 2, segments: [{ from_m: 0, to_m: 1200, sac: 2 }], unknown_share: 0.4 },
  waypoints: [
    { lat: 47.4, lng: 11.1, name: 'Parking', at_m: 0 },
    { lat: 47.41, lng: 11.1, name: null, at_m: 8200 },
  ],
  max_hiking_difficulty: 3,
  hiking_preferences: null,
  round_trip: false,
  date: '2027-07-10',
  start_time: '08:30',
};

describe('a hike proposed over MCP', () => {
  it('TOUR-HIKE-SCHEMA-001: takes two points and everything a proposal can be asked with', () => {
    expect(hikeProposeRequestSchema.safeParse({ waypoints: two }).success).toBe(true);
    const full = {
      name: 'Herzogstand',
      waypoints: [{ ...point(0), name: 'Parking' }, point(1), { ...point(2), name: 'Summit' }],
      max_hiking_difficulty: 4,
      hiking_preferences: { avoid_steps: true },
      round_trip: true,
      variant_label: 'by the lake',
      date: '2027-07-10',
      start_time: '08:30',
    };
    expect(hikeProposeRequestSchema.parse(full)).toEqual(full);
    expect(hikeProposeRequestSchema.safeParse({ ...full, hiking_preferences: null }).success).toBe(true);
  });

  it('TOUR-HIKE-SCHEMA-002: refuses one point, too many, a long label, a date or a time it cannot read, and a key it does not know', () => {
    const many = Array.from({ length: HIKE_MAX_WAYPOINTS + 1 }, (_, index) => point(index));
    for (const request of [
      { waypoints: [point(0)] },
      { waypoints: many },
      { waypoints: two, variant_label: 'x'.repeat(41) },
      { waypoints: two, variant_label: '  ' },
      { waypoints: two, date: '10.07.2027' },
      { waypoints: two, start_time: '8:30' },
      { waypoints: two, start_time: '24:00' },
      { waypoints: two, max_hiking_difficulty: 7 },
      { waypoints: two, tripId: 1 },
    ]) {
      expect(hikeProposeRequestSchema.safeParse(request).success, JSON.stringify(request).slice(0, 80)).toBe(false);
    }
  });

  it('TOUR-HIKE-SCHEMA-003: reads a proposal with its way, and one without a way', () => {
    expect(hikeProposalSchema.parse(proposal)).toEqual(proposal);
    const unrouted = {
      ...proposal,
      route: { planned: false, why: 'point_off_the_way', position: 2 },
      unreachable: { position: 2, snapped_m: 420 },
      distance_m: null,
      ascent_m: null,
      descent_m: null,
      duration_minutes: null,
      duration_basis: null,
      heights_known: false,
      min_ele_m: null,
      max_ele_m: null,
      line: [],
      profile: [],
      sac: null,
      waypoints: proposal.waypoints.map((waypoint) => ({ ...waypoint, at_m: null })),
    };
    expect(hikeProposalSchema.safeParse(unrouted).success).toBe(true);
  });

  it('TOUR-HIKE-SCHEMA-004: keeps a proposal within what a card draws', () => {
    const long = Array.from({ length: HIKE_PLAN_LINE_POINTS + 1 }, () => [47.4, 11.1]);
    expect(hikeProposalSchema.safeParse({ ...proposal, line: long }).success).toBe(false);
    const segments = Array.from({ length: HIKE_PROPOSAL_SAC_SEGMENTS + 1 }, (_, index) => ({
      from_m: index,
      to_m: index + 1,
      sac: 2,
    }));
    expect(hikeProposalSchema.safeParse({ ...proposal, sac: { ...proposal.sac, segments } }).success).toBe(false);
    expect(hikeProposalSchema.safeParse({ ...proposal, sac: { ...proposal.sac, highest: 7 } }).success).toBe(false);
    expect(hikeProposalSchema.safeParse({ ...proposal, sac: { ...proposal.sac, unknown_share: 1.5 } }).success).toBe(
      false,
    );
    expect(hikeProposalSchema.safeParse({ ...proposal, duration_basis: 'guess' }).success).toBe(false);
    expect(hikeProposalSchema.safeParse({ ...proposal, line: [[47.4, 191]] }).success).toBe(false);
    expect(
      hikeProposalSchema.safeParse({ ...proposal, waypoints: [{ ...proposal.waypoints[0], lat: -91 }] }).success,
    ).toBe(false);
  });

  it('TOUR-HIKE-SCHEMA-005: says why a way was not planned only with a reason the plan knows', () => {
    expect(hikeRouteOutcomeSchema.safeParse({ planned: true }).success).toBe(true);
    expect(hikeRouteOutcomeSchema.safeParse({ planned: false, why: 'no_way', position: null }).success).toBe(true);
    expect(hikeRouteOutcomeSchema.safeParse({ planned: false, why: 'too_long', position: null }).success).toBe(true);
    expect(hikeRouteOutcomeSchema.safeParse({ planned: false, why: 'ferry_only', position: null }).success).toBe(false);
    expect(hikeRouteOutcomeSchema.safeParse({ planned: false, why: 'no_way' }).success).toBe(false);
  });
});

describe('a hike created, changed or taken in from a file over MCP', () => {
  it('TOUR-HIKE-SCHEMA-006: creates a hike with a name and its points', () => {
    expect(hikeCreateRequestSchema.safeParse({ name: 'Herzogstand', waypoints: two }).success).toBe(true);
    expect(
      hikeCreateRequestSchema.safeParse({
        name: 'Herzogstand',
        description: null,
        waypoints: two,
        max_hiking_difficulty: 3,
        hiking_preferences: { avoid_climbs: true },
        round_trip: true,
        planned_duration_minutes: 360,
      }).success,
    ).toBe(true);
    expect(hikeCreateRequestSchema.safeParse({ waypoints: two }).success).toBe(false);
    expect(hikeCreateRequestSchema.safeParse({ name: ' ', waypoints: two }).success).toBe(false);
    expect(
      hikeCreateRequestSchema.safeParse({ name: 'X', waypoints: two, planned_duration_minutes: 1441 }).success,
    ).toBe(false);
    expect(hikeCreateRequestSchema.safeParse({ name: 'X', waypoints: two, variant_label: 'a' }).success).toBe(false);
  });

  it('TOUR-HIKE-SCHEMA-007: changes a hike only against the revision it was read at', () => {
    expect(tourUpdateRequestSchema.safeParse({ placeId: 4, expected_revision: 2, name: 'New' }).success).toBe(true);
    expect(tourUpdateRequestSchema.safeParse({ placeId: 4, expected_revision: 2, waypoints: two }).success).toBe(true);
    expect(tourUpdateRequestSchema.safeParse({ placeId: 4, name: 'New' }).success).toBe(false);
    expect(tourUpdateRequestSchema.safeParse({ placeId: 4, expected_revision: 0 }).success).toBe(false);
    expect(tourUpdateRequestSchema.safeParse({ placeId: 4, expected_revision: 2, round_trip: true }).success).toBe(
      false,
    );
  });

  it('TOUR-HIKE-SCHEMA-008: takes a GPX text as a hike by default, and a type with what that type needs', () => {
    const parsed = tourGpxImportRequestSchema.parse({ gpx: '<gpx/>' });
    expect(parsed).toEqual({ gpx: '<gpx/>', tour_type: 'hike' });
    expect(tourGpxImportRequestSchema.safeParse({ gpx: '<gpx/>', tour_type: 'bike' }).success).toBe(false);
    expect(
      tourGpxImportRequestSchema.safeParse({ gpx: '<gpx/>', tour_type: 'bike', bike_profile: 'road' }).success,
    ).toBe(true);
    expect(tourGpxImportRequestSchema.safeParse({ gpx: '<gpx/>', bike_profile: 'road' }).success).toBe(false);
    expect(tourGpxImportRequestSchema.safeParse({ gpx: '' }).success).toBe(false);
    expect(tourGpxImportRequestSchema.safeParse({ gpx: 'x'.repeat(TOUR_GPX_TEXT_MAX + 1) }).success).toBe(false);
    expect(tourGpxImportRequestSchema.safeParse({ gpx: '<gpx/>', file_name: 'x'.repeat(201) }).success).toBe(false);
    expect(Object.keys(tourGpxImportRequestSchema.shape)).toContain('tour_type');
  });
});
