import { describe, expect, it } from 'vitest';
import { routeSkiTour, skiLegs, skiRouteKey } from './skiRouting';
import { lineLengthM } from './tourFixedLegs';

// FE-TOUR-SKI-ROUTE-001 to FE-TOUR-SKI-ROUTE-004

const start = { lat: 47, lng: 11 };
const col = { lat: 47.01, lng: 11 };
const hut = { lat: 47.01, lng: 11.01 };
const touring = { discipline: 'touring' as const, technique: null };

describe('skiRouting (SKI-02)', () => {
  it('FE-TOUR-SKI-ROUTE-001: lays a straight free leg between every two points, and keeps a leg the traveller drew', async () => {
    const drawn = {
      kind: 'free' as const,
      geometry: [
        [47.01, 11],
        [47.02, 11.005],
        [47.01, 11.01],
      ] as [number, number][],
    };
    const legs = await skiLegs([start, { ...col, fixedLeg: drawn }, hut], touring);
    expect(legs).toEqual([
      {
        kind: 'free',
        geometry: [
          [47, 11],
          [47.01, 11],
        ],
      },
      drawn,
    ]);
    expect(await skiLegs([start], touring)).toEqual([]);
  });

  it('FE-TOUR-SKI-ROUTE-002: the line is drawn whole, sampled along each leg for its heights, with no time worked out', async () => {
    const route = await routeSkiTour([start, col, hut], touring);
    expect(route).not.toBeNull();
    expect(route?.durationSeconds).toBeNull();
    expect(route?.parts).toHaveLength(1);
    expect(route?.parts[0]?.free).toBe(true);
    const coordinates = route?.coordinates ?? [];
    expect(coordinates[0]).toEqual([47, 11]);
    expect(coordinates[coordinates.length - 1]).toEqual([47.01, 11.01]);
    // Every 25 m a point, so the heights follow the ground between the two ends of each leg.
    expect(coordinates.length).toBeGreaterThan(40);
    const straight = lineLengthM([
      [47, 11],
      [47.01, 11],
      [47.01, 11.01],
    ]);
    expect(route?.distanceMeters ?? 0).toBeCloseTo(straight, 0);
  });

  it('FE-TOUR-SKI-ROUTE-003: fewer than two points, or a request called off, draw nothing', async () => {
    expect(await routeSkiTour([start], touring)).toBeNull();
    const controller = new AbortController();
    controller.abort();
    expect(await routeSkiTour([start, col], touring, controller.signal)).toBeNull();
  });

  it('FE-TOUR-SKI-ROUTE-004: no choice of the discipline changes the legs, so none plans the tour again', () => {
    const keys = [
      skiRouteKey({ discipline: null, technique: null }),
      skiRouteKey({ discipline: 'alpine', technique: null }),
      skiRouteKey({ discipline: 'cross_country', technique: 'skating' }),
    ];
    expect(new Set(keys).size).toBe(1);
  });
});
