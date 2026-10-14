// FE-FERRATA-PAINT-001 to FE-FERRATA-PAINT-004: the line colours come from the content, surface and accent tokens.
import { afterEach, describe, expect, it } from 'vitest';

import { ferrataPaint, isGreyColour, sameFerrataPaint } from './ferrataPaint';

const root = document.documentElement;

afterEach(() => {
  for (const name of ['--text-primary', '--bg-primary', '--accent', '--info', '--success', '--warning', '--danger'])
    root.style.removeProperty(name);
});

describe('ferrataPaint', () => {
  it('FE-FERRATA-PAINT-001: draws the line in the content colour on a surface casing, the highlight in the accent', () => {
    root.style.setProperty('--text-primary', 'black');
    root.style.setProperty('--bg-primary', 'white');
    root.style.setProperty('--accent', 'navy');
    expect(ferrataPaint()).toEqual({ line: 'black', casing: 'white', highlight: 'navy' });
  });

  it('FE-FERRATA-PAINT-002: never takes the grade colours of the tour line', () => {
    root.style.setProperty('--success', 'green');
    root.style.setProperty('--warning', 'orange');
    root.style.setProperty('--danger', 'crimson');
    const paint = Object.values(ferrataPaint());
    expect(paint).not.toContain('green');
    expect(paint).not.toContain('orange');
    expect(paint).not.toContain('crimson');
  });

  it('FE-FERRATA-PAINT-003: falls back to currentColor where a token is not defined, and compares by colour', () => {
    const paint = ferrataPaint();
    expect(paint).toEqual({ line: 'currentColor', casing: 'currentColor', highlight: 'currentColor' });
    expect(sameFerrataPaint(paint, { ...paint })).toBe(true);
    expect(sameFerrataPaint(paint, { ...paint, highlight: 'red' })).toBe(false);
  });
  it('FE-FERRATA-PAINT-004: a grey accent, the neutral default, hands the highlight to the info colour', () => {
    root.style.setProperty('--text-primary', '#111827');
    root.style.setProperty('--accent', '#111827');
    root.style.setProperty('--info', '#2563eb');
    expect(ferrataPaint().highlight).toBe('#2563eb');

    root.style.setProperty('--accent', '#4f46e5');
    expect(ferrataPaint().highlight).toBe('#4f46e5');

    expect(isGreyColour('#e4e4e7')).toBe(true);
    expect(isGreyColour('#fff')).toBe(true);
    expect(isGreyColour('rgb(228, 228, 231)')).toBe(true);
    expect(isGreyColour('#d97706')).toBe(false);
    expect(isGreyColour('navy')).toBe(false);
  });
});
