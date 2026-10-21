import type { JourneyRecordedDay, JourneyRecordingPreview } from '@trek/shared';

/** A walk across Venice on the 14th, the way the server answers it. */
export const WALK_SEGMENT = {
  points: [
    [45.434, 12.3388],
    [45.4364, 12.3218],
  ] as Array<[number, number]>,
  mode: 'walking',
  startedAt: '2026-05-14T09:00:00+02:00',
  endedAt: '2026-05-14T09:40:00+02:00',
  distanceMeters: 1500,
};

export function buildRecordedDay(over: Partial<JourneyRecordedDay> = {}): JourneyRecordedDay {
  return {
    id: 3,
    date: '2026-05-14',
    source: 'dawarich',
    sourceKind: 'tracks',
    utcOffsetMinutes: 120,
    window: { from: '2026-05-13T22:00:00.000Z', to: '2026-05-14T22:00:00.000Z' },
    segments: [WALK_SEGMENT],
    stats: {
      distanceMeters: 1500,
      pointCount: 2,
      segmentCount: 1,
      gapCount: 0,
      modes: ['walking'],
      firstAt: WALK_SEGMENT.startedAt,
      lastAt: WALK_SEGMENT.endedAt,
    },
    truncated: false,
    provisional: false,
    fetchedAt: '2026-05-15T07:00:00.000Z',
    contentHash: 'a'.repeat(64),
    importedBy: { id: 1, username: 'marta' },
    savedAt: '2026-05-15T07:00:01.000Z',
    ...over,
  };
}

export function buildRecordingPreview(over: Partial<JourneyRecordingPreview> = {}): JourneyRecordingPreview {
  const day = buildRecordedDay();
  return {
    journey: { id: 7, title: 'Venice' },
    date: day.date,
    utcOffsetMinutes: 120,
    offsetSource: 'source',
    sourceOffsetMinutes: 120,
    window: day.window,
    sourceKind: 'tracks',
    segments: day.segments,
    stats: day.stats,
    truncated: false,
    provisional: false,
    fetchedAt: day.fetchedAt,
    contentHash: 'a'.repeat(64),
    stored: null,
    sameAsStored: false,
    audience: 0,
    ...over,
  };
}
