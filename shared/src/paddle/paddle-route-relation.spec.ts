import type { PaddleFeature, PaddleGeometry } from './paddle-obstacles.schema';
import { NEAR_M, ON_ROUTE_M, relateObstaclesToRoute } from './paddle-route-relation';

import { describe, expect, it } from 'vitest';

/** Metres north and east of 49.1°N 12.1°E, near enough for these distances. */
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LNG = 111_195 * Math.cos((49.1 * Math.PI) / 180);
const at = (north: number, east: number): [number, number] => [
  49.1 + north / M_PER_DEG_LAT,
  12.1 + east / M_PER_DEG_LNG,
];
const lngLat = (north: number, east: number): [number, number] => {
  const [lat, lng] = at(north, east);
  return [lng, lat];
};

function feature(ref: string, geometry: PaddleGeometry): PaddleFeature {
  return { ref, kind: 'weir', group_key: null, name: null, geometry, tags: {}, tag_hash: ref, region_id: 'oberpfalz' };
}

/** A route due east along the river, 2 km long. */
const route = [at(0, 0), at(0, 1000), at(0, 2000)];

describe('relateObstaclesToRoute', () => {
  it('relates nothing to a route of fewer than two points', () => {
    const weir = feature('node/1', { type: 'Point', coordinates: lngLat(0, 500) });
    expect(relateObstaclesToRoute([], [weir])).toEqual([]);
    expect(relateObstaclesToRoute([at(0, 0)], [weir])).toEqual([]);
  });

  it('puts a weir the route crosses on the route, where it crosses', () => {
    const weir = feature('way/29256405', {
      type: 'LineString',
      coordinates: [lngLat(-40, 1200), lngLat(40, 1200)],
    });
    expect(relateObstaclesToRoute(route, [weir])).toEqual([
      { feature: weir, relation: 'on_route', distanceM: 0, alongM: 1200 },
    ]);
  });

  it('a point within ON_ROUTE_M is on the route, within NEAR_M near, farther off not related', () => {
    const on = feature('node/1', { type: 'Point', coordinates: lngLat(ON_ROUTE_M - 5, 300) });
    const near = feature('node/2', { type: 'Point', coordinates: lngLat(100, 700) });
    const far = feature('node/3', { type: 'Point', coordinates: lngLat(NEAR_M + 30, 900) });
    const related = relateObstaclesToRoute(route, [near, far, on]);
    expect(related.map((entry) => [entry.feature.ref, entry.relation, entry.distanceM, entry.alongM])).toEqual([
      ['node/1', 'on_route', 20, 300],
      ['node/2', 'near', 100, 700],
    ]);
  });

  it('measures from the route to a long line too, so passing its middle counts', () => {
    // A dam 60 m north of the route, running 1 km parallel to it: its ends are far, its middle is not.
    const dam = feature('way/7', { type: 'LineString', coordinates: [lngLat(60, -2000), lngLat(60, 4000)] });
    const [related] = relateObstaclesToRoute(route, [dam]);
    expect(related).toMatchObject({ relation: 'near', distanceM: 60, alongM: 0 });
  });

  it('a route running inside an area meets it, even without crossing its outline', () => {
    const basin = feature('way/9', {
      type: 'Polygon',
      coordinates: [[lngLat(-500, -500), lngLat(-500, 2500), lngLat(500, 2500), lngLat(500, -500), lngLat(-500, -500)]],
    });
    expect(relateObstaclesToRoute(route, [basin])).toEqual([
      { feature: basin, relation: 'on_route', distanceM: 0, alongM: 0 },
    ]);
  });

  it('a route inside a hole of an area does not meet it there', () => {
    const ring = feature('way/10', {
      type: 'Polygon',
      coordinates: [
        [lngLat(-900, -900), lngLat(-900, 2900), lngLat(900, 2900), lngLat(900, -900), lngLat(-900, -900)],
        [lngLat(-600, -600), lngLat(-600, 2600), lngLat(600, 2600), lngLat(600, -600), lngLat(-600, -600)],
      ],
    });
    expect(relateObstaclesToRoute(route, [ring])).toEqual([]);
  });

  it('orders the related objects as the route reaches them', () => {
    const late = feature('node/late', { type: 'Point', coordinates: lngLat(0, 1800) });
    const early = feature('node/early', { type: 'Point', coordinates: lngLat(0, 200) });
    expect(relateObstaclesToRoute(route, [late, early]).map((entry) => entry.feature.ref)).toEqual([
      'node/early',
      'node/late',
    ]);
  });

  it('an object on the next arm of the river, 120 m off, stays near and so uncertain', () => {
    const otherArm = feature('way/11', { type: 'LineString', coordinates: [lngLat(100, 500), lngLat(160, 500)] });
    expect(relateObstaclesToRoute(route, [otherArm])[0]).toMatchObject({ relation: 'near', distanceM: 100 });
  });
});
