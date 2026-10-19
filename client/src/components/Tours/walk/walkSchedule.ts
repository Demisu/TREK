import type { TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';

/**
 * CW-04: a city walk's stations against their opening hours on one day. The
 * arrival is an estimate: the start of that day's walk, the walking time
 * shared out along the route by distance, and the stays before. Hours are
 * read only in OpenStreetMap's plain forms ("Mo-Fr 09:00-18:00; Sa 10:00-14:00;
 * Su off", "24/7"); anything else stays unread rather than guessed, and a
 * station without hours is unknown, never open.
 */

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

/** Minutes after midnight of a `HH:MM` time; null for anything else. */
export function minutesOf(time: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function clockOf(minutes: number): string {
  const day = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
}

/** Monday 0 to Sunday 6, of a `YYYY-MM-DD` date read as a calendar day. */
function weekdayOf(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return (day + 6) % 7;
}

function daysOf(spec: string): Set<number> | null {
  const days = new Set<number>();
  for (const part of spec.split(',')) {
    const [from, to] = part.split('-');
    const start = DAYS.indexOf(from as (typeof DAYS)[number]);
    const end = to === undefined ? start : DAYS.indexOf(to as (typeof DAYS)[number]);
    if (start < 0 || end < 0) return null;
    for (let day = start; ; day = (day + 1) % 7) {
      days.add(day);
      if (day === end) break;
    }
  }
  return days;
}

/** The windows a place is open on a date, in minutes; null where the hours cannot be read. */
export function openWindows(hours: string, date: string): Array<[number, number]> | null {
  const weekday = weekdayOf(date);
  if (weekday === null) return null;
  const text = hours.trim();
  if (text === '24/7') return [[0, 1440]];
  let windows: Array<[number, number]> = [];
  for (const raw of text.split(';')) {
    const rule = raw.trim();
    if (!rule) continue;
    const match = /^([A-Za-z,-]+)\s+(.+)$/.exec(rule);
    if (!match) return null;
    const days = daysOf(match[1]);
    if (!days) return null;
    if (!days.has(weekday)) continue;
    // A later rule for the day replaces an earlier one, as OpenStreetMap reads them.
    if (match[2].trim() === 'off' || match[2].trim() === 'closed') {
      windows = [];
      continue;
    }
    const ranges: Array<[number, number]> = [];
    for (const span of match[2].split(',')) {
      const [open, close] = span.trim().split('-');
      const from = minutesOf(open);
      const to = close === '24:00' ? 1440 : minutesOf(close);
      if (from === null || to === null || to <= from) return null;
      ranges.push([from, to]);
    }
    windows = ranges;
  }
  return windows;
}

export type StationFit =
  | { kind: 'unknown' }
  | { kind: 'unread'; hours: string }
  | { kind: 'ok' }
  | { kind: 'closed'; arrival: number }
  | { kind: 'closes'; arrival: number; leave: number; closes: number };

/** Whether a station is open from its arrival to the end of its stay on that date. */
export function stationFit(hours: string | null | undefined, date: string, arrival: number, stay: number): StationFit {
  if (!hours) return { kind: 'unknown' };
  const windows = openWindows(hours, date);
  if (windows === null) return { kind: 'unread', hours };
  const leave = arrival + stay;
  const open = windows.find(([from, to]) => arrival >= from && arrival < to);
  if (!open) return { kind: 'closed', arrival };
  if (leave > open[1]) return { kind: 'closes', arrival, leave, closes: open[1] };
  return { kind: 'ok' };
}

/** Metres between two points, close enough along a city walk. */
function metres(a: readonly [number, number], b: readonly [number, number]): number {
  const rad = Math.PI / 180;
  const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
  const y = (b[0] - a[0]) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

/**
 * The estimated arrival at each station, in minutes after midnight: the start,
 * the walking time shared out by how far along the route the station lies,
 * and the stays before it; a stay not known counts as nothing before it and
 * makes every later arrival a lower bound. Null when the start, the walking
 * time or the route is not known.
 */
export function stationArrivals(
  stations: readonly TourPlannerWaypoint[],
  route: ReadonlyArray<readonly [number, number]>,
  start: number | null,
  walkingMinutes: number | null
): Array<{ arrival: number; atLeast: boolean }> | null {
  if (start === null || walkingMinutes === null || route.length < 2) return null;
  const along: number[] = [0];
  for (let i = 1; i < route.length; i += 1) along.push(along[i - 1] + metres(route[i - 1], route[i]));
  const total = along[along.length - 1] || 1;
  let stays = 0;
  let unknown = false;
  return stations.map((station) => {
    let nearest = 0;
    let best = Infinity;
    route.forEach((point, index) => {
      const gap = metres(point, [station.lat, station.lng]);
      if (gap < best) {
        best = gap;
        nearest = index;
      }
    });
    const arrival = start + walkingMinutes * (along[nearest] / total) + stays;
    const result = { arrival, atLeast: unknown };
    if (station.stayMinutes == null) unknown = true;
    else stays += station.stayMinutes;
    return result;
  });
}
