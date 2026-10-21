import { boatSpansOf, ferryCrossingsOf } from './walk-ferry';
import { stationShares } from './walk-hours';

import { describe, expect, it } from 'vitest';

const line: Array<[number, number, number]> = [
  [45.4296, 12.3264, 2],
  [45.4291, 12.3266, 1],
  [45.4275, 12.3282, 1],
  [45.4268, 12.33, 2],
];

describe('ferry legs of a city walk (CW-12)', () => {
  it('reads the boat part of each ferry leg, and nothing of any other leg', () => {
    expect(
      ferryCrossingsOf([
        {
          fixed_leg: {
            kind: 'free',
            geometry: [
              [1, 1],
              [2, 2],
            ],
          },
        },
        {
          fixed_leg: {
            kind: 'ferry',
            geometry: line.map(([lat, lng]): [number, number] => [lat, lng]),
            crossing: [1, 2],
            minutes: 7,
            walk_minutes: 2,
          },
        },
        {},
      ]),
    ).toEqual([
      [
        [45.4291, 12.3266],
        [45.4275, 12.3282],
      ],
    ]);
  });

  it('finds each crossing on the saved line by its own points, and leaves out one it cannot find', () => {
    const crossing: Array<[number, number]> = [
      [45.4291, 12.3266],
      [45.4275, 12.3282],
    ];
    expect(boatSpansOf(line, [crossing])).toEqual([[1, 2]]);
    expect(
      boatSpansOf(line, [
        [
          [1, 1],
          [2, 2],
        ],
      ]),
    ).toEqual([]);
  });

  it('counts no distance along a stretch crossed by boat when sharing a walk out', () => {
    const stops = [
      { lat: 45.4296, lng: 12.3264 },
      { lat: 45.4275, lng: 12.3282 },
    ];
    const walked = stationShares(stops, line)?.[1] ?? 0;
    // The stop where the boat lands is passed after the walk to the pier only.
    const byBoat = stationShares(stops, line, [[1, 2]])?.[1] ?? 0;
    expect(byBoat).toBeLessThan(walked);
    expect(stationShares(stops, line, [])).toEqual(stationShares(stops, line));
  });
});
