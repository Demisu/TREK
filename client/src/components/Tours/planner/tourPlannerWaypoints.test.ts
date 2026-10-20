// FE-TOUR-WAYPOINTS-001 to FE-TOUR-WAYPOINTS-009: the editor's waypoint model, shaping points, drawn legs
// and a city walk's stations with the keys a save answers (P2A-03, PAD-11, CW-01 to CW-04).
import type { TourWaypoint } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import {
  normalizePlannerWaypoints,
  plannerWaypointsOf,
  routeExtrasKey,
  sameWaypointSnapshot,
  savedWaypointsOf,
  tourWaypointKey,
  withDrawnLegsRouted,
  withSavedKeys,
  withShaping,
  withShapingPoint,
  type TourPlannerWaypoint,
} from './tourPlannerWaypoints';

const A: TourPlannerWaypoint = { id: 'a', lat: 49, lng: 12, role: 'start' };
const B: TourPlannerWaypoint = { id: 'b', lat: 49.01, lng: 12.01, role: 'via' };
const C: TourPlannerWaypoint = { id: 'c', lat: 49.02, lng: 12.02, role: 'end' };

describe('tourPlannerWaypoints', () => {
  it('FE-TOUR-WAYPOINTS-001: a shaping point goes into the leg after the point named, and nowhere past the end', () => {
    const shaped = withShapingPoint([A, B, C], 'b', { id: 's', lat: 49.015, lng: 12.015 });
    expect(shaped.map((point) => point.id)).toEqual(['a', 'b', 's', 'c']);
    expect(shaped[2]).toEqual({ id: 's', lat: 49.015, lng: 12.015, role: 'via', shaping: true });
    const points = [A, B, C];
    expect(withShapingPoint(points, 'c', { id: 's', lat: 0, lng: 0 })).toBe(points);
    expect(withShapingPoint(points, 'missing', { id: 's', lat: 0, lng: 0 })).toBe(points);
  });

  it('FE-TOUR-WAYPOINTS-002: a stop becomes a shaping point and back; the ends always stay stops', () => {
    const shaped = withShaping([A, B, C], 'b', true);
    expect(shaped[1]?.shaping).toBe(true);
    expect(withShaping(shaped, 'b', false)[1]).not.toHaveProperty('shaping');
    expect(withShaping([A, B, C], 'a', true)[0]).toBe(A);
    expect(withShaping([A, B, C], 'c', true)[2]).toBe(C);
  });

  it('FE-TOUR-WAYPOINTS-003: every drawn leg goes back to the router; a portage stays', () => {
    const free = {
      kind: 'free' as const,
      geometry: [
        [49, 12],
        [49.01, 12.01],
      ] as [number, number][],
    };
    const carried = {
      kind: 'portage' as const,
      geometry: [
        [49.01, 12.01],
        [49.02, 12.02],
      ] as [number, number][],
      extra_minutes: 5,
    };
    const routed = withDrawnLegsRouted([{ ...A, fixedLeg: free }, { ...B, fixedLeg: carried }, C]);
    expect(routed[0]).not.toHaveProperty('fixedLeg');
    expect(routed[1]?.fixedLeg).toEqual(carried);
  });

  it('FE-TOUR-WAYPOINTS-004: the key changes when a point shapes instead of stops, or a line gains a bend', () => {
    const key = tourWaypointKey([A, B, C]);
    expect(tourWaypointKey(withShaping([A, B, C], 'b', true))).not.toBe(key);
    const two = {
      kind: 'free' as const,
      geometry: [
        [49, 12],
        [49.01, 12.01],
      ] as [number, number][],
    };
    const three = {
      kind: 'free' as const,
      geometry: [
        [49, 12],
        [49.005, 12.0],
        [49.01, 12.01],
      ] as [number, number][],
    };
    expect(tourWaypointKey([{ ...A, fixedLeg: two }, B])).not.toBe(tourWaypointKey([{ ...A, fixedLeg: three }, B]));
  });

  it('FE-TOUR-WAYPOINTS-005: a point the router set is part of the snapshot, and roles follow the order', () => {
    const auto = { from: { id: 'a', lat: 49, lng: 12 }, to: { id: 'c', lat: 49.02, lng: 12.02 } };
    expect(sameWaypointSnapshot([A, B, C], [A, { ...B, auto }, C])).toBe(false);
    expect(sameWaypointSnapshot([A, B, C], [A, B, C])).toBe(true);
    expect(normalizePlannerWaypoints([C, A, B]).map((point) => point.role)).toEqual(['start', 'via', 'end']);
  });

  const SAVED: TourWaypoint[] = [
    {
      lat: 48.1,
      lng: 11.5,
      role: 'start',
      sequence: 0,
      key: 'stop-cathedral',
      name: 'Cathedral',
      stay_minutes: 30,
      importance: 'must',
      protected: true,
      opening_hours: 'Mo-Su 09:00-18:00',
    },
    { lat: 48.105, lng: 11.505, role: 'via', sequence: 1, key: 'shape-1', shaping: true },
    { lat: 48.11, lng: 11.51, role: 'end', sequence: 2, key: 'stop-market', stay_minutes: 0 },
  ];
  const ids = () => {
    let next = 0;
    return () => `p${++next}`;
  };

  it("FE-TOUR-WAYPOINTS-006: a saved walk's stations come into the editor with their key, name, stay, importance and hours", () => {
    const points = plannerWaypointsOf(SAVED, ids());
    expect(points).toEqual([
      {
        id: 'p1',
        lat: 48.1,
        lng: 11.5,
        role: 'start',
        key: 'stop-cathedral',
        name: 'Cathedral',
        stayMinutes: 30,
        importance: 'must',
        protected: true,
        openingHours: 'Mo-Su 09:00-18:00',
      },
      { id: 'p2', lat: 48.105, lng: 11.505, role: 'via', key: 'shape-1', shaping: true },
      // A stay of 0 is a point passed through, kept as such.
      { id: 'p3', lat: 48.11, lng: 11.51, role: 'end', key: 'stop-market', stayMinutes: 0 },
    ]);
    expect(savedWaypointsOf(points, 'walk')).toEqual(SAVED);
  });

  it("FE-TOUR-WAYPOINTS-007: another type sends a station's key, name and hours, but no stay, importance or protection", () => {
    const points = plannerWaypointsOf(SAVED, ids());
    const plain = [
      {
        lat: 48.1,
        lng: 11.5,
        role: 'start',
        sequence: 0,
        key: 'stop-cathedral',
        name: 'Cathedral',
        opening_hours: 'Mo-Su 09:00-18:00',
      },
      { lat: 48.105, lng: 11.505, role: 'via', sequence: 1, key: 'shape-1', shaping: true },
      { lat: 48.11, lng: 11.51, role: 'end', sequence: 2, key: 'stop-market' },
    ];
    expect(savedWaypointsOf(points, 'hike')).toEqual(plain);
    expect(savedWaypointsOf(points)).toEqual(plain);
  });

  it("FE-TOUR-WAYPOINTS-008: a station's own fields make another step of the history, but no other route", () => {
    const edits: Array<Partial<TourPlannerWaypoint>> = [
      { name: 'Cathedral' },
      { stayMinutes: 0 },
      { importance: 'optional' },
      { protected: true },
      { openingHours: 'Mo-Fr 10:00-17:00' },
    ];
    for (const edit of edits) {
      const edited = [A, { ...B, ...edit }, C];
      expect(sameWaypointSnapshot([A, B, C], edited)).toBe(false);
      expect(tourWaypointKey(edited)).toBe(tourWaypointKey([A, B, C]));
      expect(routeExtrasKey(edited)).toBe(routeExtrasKey([A, B, C]));
    }
    // The key a save answered is no change of the draft at all.
    expect(sameWaypointSnapshot([A, B, C], [A, { ...B, key: 'stop-b' }, C])).toBe(true);
    expect(routeExtrasKey([A, { ...B, linkedPlaceId: 4 }, C])).not.toBe(routeExtrasKey([A, B, C]));
  });

  it('FE-TOUR-WAYPOINTS-009: the keys a save answered go onto the points by position, and nothing new answers the same list', () => {
    const points = [A, { ...B, key: 'stop-b' }, C];
    const keyed = withSavedKeys(points, [
      { lat: A.lat, lng: A.lng, role: 'start', sequence: 0, key: 'stop-a' },
      { lat: B.lat, lng: B.lng, role: 'via', sequence: 1, key: 'stop-b' },
      { lat: C.lat, lng: C.lng, role: 'end', sequence: 2, key: 'stop-c' },
    ]);
    expect(keyed.map((point) => point.key)).toEqual(['stop-a', 'stop-b', 'stop-c']);
    expect(keyed[1]).toBe(points[1]);
    expect(keyed.map((point) => point.id)).toEqual(['a', 'b', 'c']);

    expect(
      withSavedKeys(
        keyed,
        keyed.map((point, sequence) => ({ ...point, sequence }))
      )
    ).toBe(keyed);
    // An answer without keys, as an offline save gives, or of another length leaves the points as they are.
    expect(withSavedKeys(points, savedWaypointsOf([A, B, C]))).toBe(points);
    expect(withSavedKeys(points, [])).toBe(points);
  });
});
