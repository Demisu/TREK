import { describe, expect, it } from 'vitest';
import { formatRunPace, parseRunPace, runPaceInvalid } from './runPace';

// FE-TOUR-RUN-PACE-001 to FE-TOUR-RUN-PACE-003

describe('run pace (RUN-01)', () => {
  it('FE-TOUR-RUN-PACE-001: reads min:s, whole minutes and minutes with a part, and nothing as no pace', () => {
    expect(parseRunPace('6:00')).toBe(360);
    expect(parseRunPace(' 5:07 ')).toBe(307);
    expect(parseRunPace('6')).toBe(360);
    expect(parseRunPace('5,5')).toBe(330);
    expect(parseRunPace('5.25')).toBe(315);
    expect(parseRunPace('')).toBeNull();
    expect(parseRunPace('   ')).toBeNull();
  });

  it('FE-TOUR-RUN-PACE-002: anything else is no pace, seconds of 60 or more included', () => {
    for (const text of ['5:60', '5:7', 'fast', '6 min', '-5', '5:30:00', '123']) {
      expect(parseRunPace(text)).toBeNaN();
    }
  });

  it('FE-TOUR-RUN-PACE-003: writes a pace as min:s and holds it to the bounds a run is saved with', () => {
    expect(formatRunPace(360)).toBe('6:00');
    expect(formatRunPace(307)).toBe('5:07');
    expect(formatRunPace(1200)).toBe('20:00');
    expect(runPaceInvalid(null)).toBe(false);
    expect(runPaceInvalid(360)).toBe(false);
    expect([Number.NaN, 0, 119, 1201].map(runPaceInvalid)).toEqual([true, true, true, true]);
  });
});
