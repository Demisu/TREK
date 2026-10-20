import { derivedFields, planLegs, planLine, planPoints } from '../../../src/nest/tours/tour-plan-read';
import type { WalkProgress } from '../../../src/nest/tours/tour-visits.service';
import type { TourDetailResponse, TourWaypoint } from '@trek/shared';

import { describe, expect, it } from 'vitest';

// TOUR-PLAN-READ-001 to TOUR-PLAN-READ-005

/** The detail of a tour of this type, only as far as the plan reads it. */
function detailOf(tourType: TourDetailResponse['tour']['tour_type']): TourDetailResponse {
  return { tour: { tour_type: tourType }, waypoints: [] } as unknown as TourDetailResponse;
}

const point = (sequence: number, extra: Partial<TourWaypoint> = {}): TourWaypoint => ({
  lat: 48 + sequence * 0.01,
  lng: 11,
  role: 'via',
  sequence,
  ...extra,
});

/** A walk on a day where the station keyed `seen` was visited. */
const run: WalkProgress = {
  place_id: 1,
  day_id: 2,
  assignment_id: 3,
  stations: [
    {
      position: 1,
      key: 'seen',
      name: null,
      lat: 48,
      lng: 11,
      status: 'visited',
      importance: 'normal',
      protected: false,
      stay_minutes: null,
      opening_hours: null,
      linked_place_id: null,
    },
  ],
  open: { stations: 1, stay_minutes_known: 0, stays_unknown: 1 },
  walking_minutes: null,
};

describe('tour plan read (MCP-T01)', () => {
  it('TOUR-PLAN-READ-001: a station without a key is planned on the day read, never another station of it', () => {
    const points = [point(0, { key: 'seen' }), point(1), point(2, { key: 'other' })];
    expect(planPoints('walk', points, run).map((station) => 'visit_status' in station && station.visit_status)).toEqual(
      ['visited', 'planned', 'planned'],
    );
  });

  it('TOUR-PLAN-READ-002: the points of any other type stay as stored, whatever day is read', () => {
    const points = [point(0, { key: 'seen' }), point(1)];
    expect(planPoints('bike', points, run)).toEqual(points);
  });

  it('TOUR-PLAN-READ-003: a portage is a fixed leg of its own kind, and a single point has no leg', () => {
    const portage = point(0, {
      fixed_leg: {
        kind: 'portage',
        geometry: [
          [48, 11],
          [48.01, 11],
        ],
      },
    });
    expect(planLegs([portage, point(1)])).toEqual([
      expect.objectContaining({ kind: 'portage', name: null, length_km: 1.11 }),
    ]);
    expect(planLegs([point(0)])).toEqual([]);
  });

  it('TOUR-PLAN-READ-004: a line of fewer than two points is no line', () => {
    expect(planLine([])).toBeNull();
    expect(planLine([[48, 11]])).toBeNull();
  });

  it('TOUR-PLAN-READ-005: a paddle tour names its check bench and checklist as worked out, a walk its station counts', () => {
    const none = { controlsFromTrack: false, line: null, run: null };
    expect(derivedFields(detailOf('kayak'), none)).toEqual(
      expect.arrayContaining(['tour.paddle_check', 'obstacle_check']),
    );
    expect(derivedFields(detailOf('kayak'), none)).not.toContain('tour.station_count');
    const walk = derivedFields(detailOf('walk'), none);
    expect(walk).toEqual(expect.arrayContaining(['tour.station_count', 'tour.station_stays_unknown']));
    expect(walk).not.toContain('tour.paddle_check');
    expect(walk).not.toContain('run.open');
  });
});
