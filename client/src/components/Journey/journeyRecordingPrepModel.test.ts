// FE-JRN-PREP-MODEL-001 to FE-JRN-PREP-MODEL-006
//
// JRN-03: where preparing a journey day stands, and the line under the switch.
import type { JourneyRecordingPrep } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import { dayPrepOf, dayPrepText, dayPrepUnsettled, prepStatusLine } from './journeyRecordingPrepModel';

/** Keys come back as they are, with their params; a Dawarich reason reads as its code, as reasonText needs a hit. */
const t = (key: string, params?: Record<string, string | number>) => {
  if (key.startsWith('dawarich.error.')) return key.slice('dawarich.error.'.length).toUpperCase();
  return params ? `${key} ${JSON.stringify(params)}` : key;
};

const NOW = new Date(2026, 4, 16, 12, 0);
const PERIOD = new Set(['2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17']);

function prep(over: Partial<JourneyRecordingPrep> = {}): JourneyRecordingPrep {
  return {
    enabled: true,
    connection: 'ready',
    lastAttemptAt: new Date(2026, 4, 16, 10, 0).toISOString(),
    lastSuccessAt: new Date(2026, 4, 16, 10, 0).toISOString(),
    lastError: null,
    ...over,
  };
}

describe('dayPrepOf', () => {
  it('FE-JRN-PREP-MODEL-001: today runs, a day that ended before the last fetch is complete, one fetched too early is provisional', () => {
    expect(dayPrepOf('2026-05-16', prep(), PERIOD, NOW)?.state).toBe('running');
    expect(dayPrepOf('2026-05-14', prep(), PERIOD, NOW)?.state).toBe('complete');
    const early = prep({ lastSuccessAt: new Date(2026, 4, 15, 18, 0).toISOString() });
    expect(dayPrepOf('2026-05-15', early, PERIOD, NOW)).toEqual({
      state: 'provisional',
      failed: false,
      lastSuccessAt: early.lastSuccessAt,
    });
  });

  it('FE-JRN-PREP-MODEL-002: nothing fetched yet is pending, and a failed run marks the day as stale', () => {
    expect(dayPrepOf('2026-05-14', prep({ lastSuccessAt: null }), PERIOD, NOW)?.state).toBe('pending');
    expect(dayPrepOf('2026-05-14', prep({ lastError: 'unreachable' }), PERIOD, NOW)).toMatchObject({
      state: 'complete',
      failed: true,
    });
  });

  it('FE-JRN-PREP-MODEL-003: no mark while off, without a connection, outside the trips or for a day still ahead', () => {
    expect(dayPrepOf('2026-05-14', prep({ enabled: false }), PERIOD, NOW)).toBeNull();
    expect(dayPrepOf('2026-05-14', prep({ connection: 'not_connected' }), PERIOD, NOW)).toBeNull();
    expect(dayPrepOf('2026-05-20', prep(), PERIOD, NOW)).toBeNull();
    expect(dayPrepOf('2026-05-17', prep(), PERIOD, NOW)).toBeNull();
    expect(dayPrepOf('2026-05-14', null, PERIOD, NOW)).toBeNull();
  });
});

describe('dayPrepText and dayPrepUnsettled', () => {
  it('FE-JRN-PREP-MODEL-004: says why a day is not final, and only such a day is unsettled', () => {
    const now = NOW.getTime();
    expect(dayPrepText({ state: 'running', failed: true, lastSuccessAt: null }, t, 'en', now)).toBe(
      'journey.prep.dayRunning journey.prep.dayFailed'
    );
    expect(dayPrepText({ state: 'pending', failed: false, lastSuccessAt: null }, t, 'en', now)).toBe(
      'journey.prep.dayPending'
    );
    const provisional = {
      state: 'provisional' as const,
      failed: false,
      lastSuccessAt: new Date(now - 7_200_000).toISOString(),
    };
    expect(dayPrepText(provisional, t, 'en', now)).toBe('journey.prep.dayProvisional {"time":"2 hours ago"}');

    expect(dayPrepUnsettled(provisional)).toBe(true);
    expect(dayPrepUnsettled({ state: 'complete', failed: false, lastSuccessAt: null })).toBe(false);
    expect(dayPrepUnsettled({ state: 'complete', failed: true, lastSuccessAt: null })).toBe(true);
    expect(dayPrepUnsettled(null)).toBe(false);
  });
});

describe('prepStatusLine', () => {
  const now = NOW.getTime();

  it('FE-JRN-PREP-MODEL-005: says when the last fetch came through, or that none did yet', () => {
    expect(prepStatusLine(prep(), true, t, 'en', now)).toEqual({
      text: 'journey.prep.lastSuccess {"time":"2 hours ago"}',
      tone: 'muted',
    });
    expect(prepStatusLine(prep({ lastSuccessAt: null, lastAttemptAt: null }), true, t, 'en', now)).toEqual({
      text: 'journey.prep.never',
      tone: 'muted',
    });
    expect(prepStatusLine(prep({ enabled: false }), true, t, 'en', now)).toBeNull();
  });

  it('FE-JRN-PREP-MODEL-006: warns about what keeps it from working, a failure first and beside the state still shown', () => {
    expect(prepStatusLine(prep({ connection: 'not_connected' }), true, t, 'en', now)?.text).toBe(
      'journey.prep.notConnected'
    );
    expect(prepStatusLine(prep(), false, t, 'en', now)?.text).toBe('journey.prep.noPeriods');
    expect(prepStatusLine(prep({ connection: 'sync_off' }), true, t, 'en', now)?.text).toBe('journey.prep.syncOff');
    expect(prepStatusLine(prep({ lastError: 'unreachable' }), true, t, 'en', now)).toEqual({
      text: 'journey.prep.failed {"reason":"UNREACHABLE","time":"2 hours ago"}',
      tone: 'warning',
    });
    expect(prepStatusLine(prep({ lastError: 'unauthorized', lastSuccessAt: null }), true, t, 'en', now)).toEqual({
      text: 'journey.prep.failedNever {"reason":"UNAUTHORIZED"}',
      tone: 'warning',
    });
  });
});
