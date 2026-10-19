import { gpxActivityOf } from '../../../src/nest/tours/tour-gpx-export.helpers';

import { describe, expect, it } from 'vitest';

// TOUR-GPX-ACTIVITY-001 to TOUR-GPX-ACTIVITY-003

describe('gpxActivityOf (PR1-06A, BIK-01)', () => {
  it('TOUR-GPX-ACTIVITY-001: a bike tour names its profile, and the plainest riding without a known one', () => {
    expect(gpxActivityOf({ tour_type: 'bike', bike_profile: 'mtb' })).toBe('mountain_biking');
    expect(gpxActivityOf({ tour_type: 'bike', bike_profile: null })).toBe('cycling');
    expect(gpxActivityOf({ tour_type: 'bike', bike_profile: 'unicycle' })).toBe('cycling');
  });

  it('TOUR-GPX-ACTIVITY-002: a paddle tour names its boat, and paddling without a known one', () => {
    expect(gpxActivityOf({ tour_type: 'kayak', boat_type: 'canoe' })).toBe('canoeing');
    expect(gpxActivityOf({ tour_type: 'kayak', boat_type: null })).toBe('paddling');
    expect(gpxActivityOf({ tour_type: 'kayak', boat_type: 'raft' })).toBe('paddling');
  });

  it('TOUR-GPX-ACTIVITY-003: a hike is hiking, any other type its own key', () => {
    expect(gpxActivityOf({ tour_type: 'hike' })).toBe('hiking');
    expect(gpxActivityOf({ tour_type: 'walk' })).toBe('walk');
  });
});
