import { isTourActivityDone, summarizeTourActivities } from './tour-activity-stats';
import {
  tourActivityExclusionRequestSchema,
  tourActivityStatsQuerySchema,
  tourActivityStatsResponseSchema,
  type TourActivityStatsEntry,
} from './tour-activity-stats.schema';

import { describe, expect, it } from 'vitest';

function entry(overrides: Partial<TourActivityStatsEntry> = {}): TourActivityStatsEntry {
  return {
    place_id: 1,
    name: 'Ridge',
    tour_type: 'hike',
    trip: { id: 5, title: 'Alps' },
    date: '2026-07-02',
    basis: 'plan',
    track: null,
    day_count: 1,
    distance_km: 10,
    ascent_m: 500,
    descent_m: 400,
    excluded: false,
    ...overrides,
  };
}

const TODAY = '2026-10-20';

describe('STA-02 tour activity stats contract', () => {
  it('STA2-SCHEMA-001: reads entries of either basis with unknown values kept unknown', () => {
    const body = {
      entries: [
        entry(),
        entry({
          place_id: 2,
          basis: 'track',
          track: { place_id: 9, name: 'Watch export' },
          distance_km: null,
          ascent_m: null,
          descent_m: null,
        }),
      ],
      uncounted: { unassigned: 1, undated: 0 },
    };
    expect(tourActivityStatsResponseSchema.parse(body)).toEqual(body);
  });

  it('STA2-SCHEMA-002: refuses a date that is not a calendar day, a negative distance and an unknown basis', () => {
    const uncounted = { unassigned: 0, undated: 0 };
    const parses = (entries: unknown[]) => tourActivityStatsResponseSchema.safeParse({ entries, uncounted }).success;
    expect(parses([entry({ date: '02.07.2026' })])).toBe(false);
    expect(parses([entry({ distance_km: -1 })])).toBe(false);
    expect(parses([{ ...entry(), basis: 'guess' }])).toBe(false);
  });

  it('STA2-SCHEMA-003: the exclusion names one tour and a yes or no, nothing else', () => {
    expect(tourActivityExclusionRequestSchema.parse({ place_id: 4, excluded: true })).toEqual({
      place_id: 4,
      excluded: true,
    });
    expect(tourActivityExclusionRequestSchema.safeParse({ place_id: 4 }).success).toBe(false);
    const withNote = { place_id: 4, excluded: true, note: 'rain' };
    expect(tourActivityExclusionRequestSchema.safeParse(withNote).success).toBe(false);
  });

  it('STA2-SCHEMA-004: the query takes a period and a type, all of them optional', () => {
    expect(tourActivityStatsQuerySchema.parse({})).toEqual({});
    expect(tourActivityStatsQuerySchema.parse({ from: '2026-01-01', to: '2026-12-31', type: 'kayak' })).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
      type: 'kayak',
    });
    expect(tourActivityStatsQuerySchema.safeParse({ type: 'car' }).success).toBe(false);
  });
});

describe('STA-02 summarizeTourActivities', () => {
  it('STA2-SUM-001: a tour counts from the day after its day, not on it', () => {
    expect(isTourActivityDone(entry({ date: '2026-10-19' }), TODAY)).toBe(true);
    expect(isTourActivityDone(entry({ date: TODAY }), TODAY)).toBe(false);
    const summary = summarizeTourActivities([entry({ date: '2026-10-19' }), entry({ place_id: 2, date: TODAY })], {
      today: TODAY,
    });
    expect(summary.totals.count).toBe(1);
    expect(summary.upcoming).toBe(1);
  });

  it('STA2-SUM-002: sums distance and heights, says how many rest on the plan and how many on a track', () => {
    const summary = summarizeTourActivities(
      [
        entry(),
        entry({
          place_id: 2,
          basis: 'track',
          track: { place_id: 9, name: 'Watch' },
          distance_km: 12.5,
          ascent_m: 650,
          descent_m: 600,
        }),
      ],
      { today: TODAY },
    );
    expect(summary.totals).toEqual({
      count: 2,
      distanceKm: { value: 22.5, known: 2, of: 2 },
      ascentM: { value: 1150, known: 2, of: 2 },
      descentM: { value: 1000, known: 2, of: 2 },
      byBasis: { plan: 1, track: 1 },
    });
  });

  it('STA2-SUM-003: an unknown value is no zero: the sum says it is short of the whole, or null when nobody knows', () => {
    const summary = summarizeTourActivities(
      [
        entry({ ascent_m: null, descent_m: null }),
        entry({ place_id: 2, distance_km: null, ascent_m: null, descent_m: null }),
      ],
      { today: TODAY },
    );
    expect(summary.totals.distanceKm).toEqual({ value: 10, known: 1, of: 2 });
    expect(summary.totals.ascentM).toEqual({ value: null, known: 0, of: 2 });
  });

  it('STA2-SUM-004: paddling sums no heights, so a paddle tour leaves the height sums complete', () => {
    const summary = summarizeTourActivities(
      [entry(), entry({ place_id: 2, tour_type: 'kayak', distance_km: 8, ascent_m: null, descent_m: null })],
      { today: TODAY },
    );
    expect(summary.totals.distanceKm).toEqual({ value: 18, known: 2, of: 2 });
    expect(summary.totals.ascentM).toEqual({ value: 500, known: 1, of: 1 });
    expect(summary.types.find((type) => type.type === 'kayak')?.ascentM).toEqual({ value: null, known: 0, of: 0 });
  });

  it('STA2-SUM-005: narrows by period (both days included) and by type, the most tours of a type first', () => {
    const entries = [
      entry({ place_id: 1, date: '2025-12-31' }),
      entry({ place_id: 2, date: '2026-01-01', tour_type: 'bike' }),
      entry({ place_id: 3, date: '2026-06-30', tour_type: 'kayak' }),
      entry({ place_id: 4, date: '2026-07-01', tour_type: 'kayak' }),
    ];
    const year = summarizeTourActivities(entries, { today: TODAY, from: '2026-01-01', to: '2026-12-31' });
    expect(year.totals.count).toBe(3);
    expect(year.types.map((type) => [type.type, type.count])).toEqual([
      ['kayak', 2],
      ['bike', 1],
    ]);
    const paddled = summarizeTourActivities(entries, { today: TODAY, type: 'kayak' });
    expect(paddled.totals.distanceKm.value).toBe(20);
    expect(paddled.done.map((item) => item.place_id)).toEqual([4, 3]);
  });

  it('STA2-SUM-006: an excluded tour is listed among the done ones but never summed, nor counted as upcoming', () => {
    const summary = summarizeTourActivities(
      [
        entry({ excluded: true }),
        entry({ place_id: 2, date: '2026-07-03' }),
        entry({ place_id: 3, date: '2026-12-01', excluded: true }),
      ],
      { today: TODAY },
    );
    expect(summary.totals.count).toBe(1);
    expect(summary.done.map((item) => [item.place_id, item.excluded])).toEqual([
      [2, false],
      [1, true],
    ]);
    expect(summary.upcoming).toBe(0);
  });

  it('STA2-SUM-007: nothing done is an empty summary, not a row of zeros', () => {
    const summary = summarizeTourActivities([], { today: TODAY });
    expect(summary.totals.count).toBe(0);
    expect(summary.totals.distanceKm.value).toBeNull();
    expect(summary.types).toEqual([]);
    expect(summary.done).toEqual([]);
  });

  it('STA2-SUM-008: the same day sorts by name, so the list keeps its order between reads', () => {
    const summary = summarizeTourActivities(
      [entry({ place_id: 1, name: 'Zugspitze' }), entry({ place_id: 2, name: 'Alpspitze' })],
      { today: TODAY },
    );
    expect(summary.done.map((item) => item.name)).toEqual(['Alpspitze', 'Zugspitze']);
  });
});
