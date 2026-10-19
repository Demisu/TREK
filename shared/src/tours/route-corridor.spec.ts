import { nearnessToLine } from './route-corridor';

import { describe, expect, it } from 'vitest';

describe('nearnessToLine', () => {
  // A line running north along 11° E for about 2.2 km.
  const line = [
    [47, 11],
    [47.01, 11],
    [47.02, 11],
  ];

  it('measures a point beside the line square to it, and how far along its foot lies', () => {
    const near = nearnessToLine({ lat: 47.015, lng: 11.001 }, line);
    expect(near?.distanceM).toBeGreaterThan(70);
    expect(near?.distanceM).toBeLessThan(80);
    expect(near?.alongM).toBeGreaterThan(1650);
    expect(near?.alongM).toBeLessThan(1690);
  });

  it('measures a point past an end from that end', () => {
    const near = nearnessToLine({ lat: 46.99, lng: 11 }, line);
    expect(near?.alongM).toBe(0);
    expect(near?.distanceM).toBeGreaterThan(1100);
    expect(near?.distanceM).toBeLessThan(1120);
  });

  it('takes heights along without minding them, and answers nothing for a line too short', () => {
    expect(
      nearnessToLine({ lat: 47, lng: 11 }, [
        [47, 11, 900],
        [47.01, 11, 950],
      ])?.distanceM,
    ).toBe(0);
    expect(nearnessToLine({ lat: 47, lng: 11 }, [[47, 11]])).toBeNull();
    expect(
      nearnessToLine({ lat: 47, lng: 11 }, [
        [47, 11],
        [47, 11],
      ])?.distanceM,
    ).toBe(0);
  });
});
