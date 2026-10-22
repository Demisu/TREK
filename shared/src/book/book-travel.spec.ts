import type { AutoEntry } from './auto/auto-types';
import {
  bookBadgeValue,
  bookCountryName,
  bookEntryListItems,
  bookTravelCountries,
  bookTravelMap,
  bookTravelSize,
  bookTravelStats,
  isStale,
  liveMetrics,
  refreshPatch,
  routeFor,
  type BookTravelContext,
} from './book-travel';
import { bookElementSchema, bookPageSetupSchema, type BookElement } from './book.schema';
import type { JourneyStats } from './journey-stats.schema';

import { describe, expect, it } from 'vitest';

/** The travel figures as elements, and keeping them in step with the journey. */

type Point = JourneyStats['points'][number];
const pt = (label: string, at: [number, number], country: string, tripId: number, entryId: number): Point => ({
  lat: at[0],
  lng: at[1],
  label,
  date: null,
  country,
  tripId,
  photoId: entryId === 1 ? 3 : null,
  entryId,
});

const stats: JourneyStats = {
  journeyId: 5,
  distance: 4_000_000,
  days: 21,
  steps: 6,
  photos: 40,
  places: 12,
  furthest: 3_000_000,
  countries: [
    { code: 'IS', name: 'Iceland', places: 2, firstVisit: '2026-06-02' },
    { code: 'PT', name: 'Portugal', places: 2, firstVisit: '2026-09-04' },
  ],
  points: [
    pt('Reykjavík', [64.14, -21.94], 'IS', 11, 1),
    pt('Akureyri', [65.68, -18.12], 'IS', 11, 2),
    pt('Lisboa', [38.72, -9.14], 'PT', 22, 3),
  ],
  trips: [],
  excluded: [],
  start: '2026-06-02',
  end: '2026-09-12',
};

const entry: AutoEntry = {
  id: 2,
  title: 'North',
  story: null,
  location: 'Akureyri',
  date: '2026-06-06',
  photos: [],
  lat: 65.68,
  lng: -18.12,
  country: 'IS',
  dayNumber: 5,
  dayCount: 21,
  pros: ['Whales'],
  cons: ['Rain', 'Wind'],
};

const ctx: BookTravelContext = {
  locale: 'en',
  stats,
  path: [
    [
      [64.1, -21.9],
      [65.6, -18.1],
    ],
  ],
  entries: [entry],
  labels: {
    day: 'DAY',
    stations: 'Stations',
    summary: 'Summary',
    countries: 'Countries',
    distance: 'Distance',
    pros: 'Pros',
    cons: 'Cons',
  },
};

const frame = { x: 230, y: 20, w: 120, h: 90 };
const valid = (el: BookElement) => bookElementSchema.safeParse(el).success;

describe('book travel', () => {
  it('BOOKTRV-001: resolves every metric from the journey, countries as a count', () => {
    expect(liveMetrics(stats)).toEqual({
      distance: 4_000_000,
      days: 21,
      steps: 6,
      photos: 40,
      countries: 2,
      places: 12,
      furthest: 3_000_000,
    });
  });

  it('BOOKTRV-002: narrows a route to one trip and keeps the whole journey for null', () => {
    expect(routeFor(stats, null)).toHaveLength(3);
    expect(routeFor(stats, 11).map((p) => p.label)).toEqual(['Reykjavík', 'Akureyri']);
  });

  it('BOOKTRV-003: places a map of the journey and of a trip, drawn, within the caps and current at once', () => {
    const whole = bookTravelMap(ctx, stats, { id: 'mp-1', frame, scope: 'journey' });
    expect(valid(whole)).toBe(true);
    expect(whole.points).toHaveLength(3);
    expect(whole.path).toHaveLength(1);
    expect(whole.countries).toEqual(['IS', 'PT']);
    expect(whole).toMatchObject({ routeStyle: 'drawn', routeArc: 'bow', source: 'vector', tripId: null });
    const trip = bookTravelMap(ctx, stats, { id: 'mp-2', frame, scope: { tripId: 22 }, source: 'satellite' });
    expect(trip).toMatchObject({ tripId: 22, source: 'tiles', accent: '#ffffff', countries: ['PT'], path: [] });
    expect(trip.attribution).toMatch(/EOX/);
    const north = bookTravelMap(ctx, stats, { id: 'mp-3', frame, scope: { tripId: 11 } });
    expect(north.points.map((p) => p.label)).toEqual(['Reykjavík', 'Akureyri']);
    expect(north.points[0]?.photoId).toBe(3);
    for (const placed of [whole, trip, north]) expect(isStale(placed, stats)).toBe(false);
  });

  it('BOOKTRV-004: places figures and country outlines named in the book language', () => {
    const figures = bookTravelStats(stats, { id: 'st-1', frame, metrics: ['distance', 'days'] });
    expect(valid(figures)).toBe(true);
    expect(figures.values.days).toBe(21);
    const outlines = bookTravelCountries({ ...ctx, locale: 'de' }, { id: 'co-1', frame });
    expect(outlines.codes).toEqual(['IS', 'PT']);
    expect(outlines.names).toEqual(['Island', 'Portugal']);
    expect(bookCountryName('is', 'en', stats)).toBe('Iceland');
  });

  it('BOOKTRV-005: resolves the small marks from an entry or the journey, and nothing it cannot say', () => {
    expect(bookBadgeValue(ctx, 'day', entry)).toEqual({ text: 'DAY 5', sub: '', code: null });
    expect(bookBadgeValue(ctx, 'date', entry)).toEqual({ text: '6', sub: 'JUNE', code: null });
    expect(bookBadgeValue(ctx, 'flag', entry)).toEqual({ text: '', sub: 'Iceland', code: 'IS' });
    expect(bookBadgeValue(ctx, 'coords', entry)?.sub).toBe('Akureyri');
    expect(bookBadgeValue(ctx, 'distance', null)).toEqual({ text: '4,000 km', sub: 'Distance', code: null });
    expect(bookBadgeValue(ctx, 'mood', entry)).toBeNull();
    expect(bookBadgeValue({ ...ctx, stats: null }, 'distance', null)).toBeNull();
  });

  it('BOOKTRV-006: lists an entry pros first, and sizes a list by its longer column', () => {
    expect(bookEntryListItems(entry)).toEqual([
      { text: 'Whales', tone: 'pro' },
      { text: 'Rain', tone: 'con' },
      { text: 'Wind', tone: 'con' },
    ]);
    const page = bookPageSetupSchema.parse({});
    expect(bookTravelSize('list', page, { rows: 2 }).h).toBeGreaterThan(bookTravelSize('list', page, { rows: 1 }).h);
    expect(bookTravelSize('badge', page, { variant: 'coords' }).w).toBeCloseTo(210 * 0.36, 5);
  });

  it('BOOKTRV-007: marks figures stale only when what they show moved, and refreshes them', () => {
    const figures = bookTravelStats(stats, { id: 'st-1', frame, metrics: ['days'] });
    expect(isStale(figures, stats)).toBe(false);
    expect(isStale(figures, { ...stats, photos: 41 })).toBe(false);
    const later = { ...stats, days: 22 };
    expect(isStale(figures, later)).toBe(true);
    expect(refreshPatch(figures, later)).toMatchObject({ stale: false, values: { days: 22 } });
    const map = bookTravelMap(ctx, stats, { id: 'mp-1', frame, scope: { tripId: 11 } });
    const moved = { ...stats, points: stats.points.map((p, i) => (i === 1 ? { ...p, photoId: 9 } : p)) };
    expect(isStale(map, moved)).toBe(true);
    expect(refreshPatch(map, moved)).toMatchObject({ countries: ['IS'] });
    expect(isStale(figures, null)).toBe(false);
  });
});
