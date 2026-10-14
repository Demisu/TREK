// FE-FERRATA-PAINT-001 to FE-FERRATA-PAINT-002: the line colours come from the status tokens.
import { afterEach, describe, expect, it } from 'vitest';

import { ferrataPaint } from './ferrataPaint';

const root = document.documentElement;

afterEach(() => {
  for (const name of ['--success', '--warning', '--danger', '--text-muted', '--bg-primary'])
    root.style.removeProperty(name);
});

describe('ferrataPaint', () => {
  it('FE-FERRATA-PAINT-001: resolves each difficulty band and the casing from the tokens on the root', () => {
    root.style.setProperty('--success', 'green');
    root.style.setProperty('--warning', 'orange');
    root.style.setProperty('--danger', 'crimson');
    root.style.setProperty('--text-muted', 'gray');
    root.style.setProperty('--bg-primary', 'white');

    expect(ferrataPaint()).toEqual({
      tone: { easy: 'green', medium: 'orange', hard: 'crimson', unknown: 'gray' },
      casing: 'white',
    });
  });

  it('FE-FERRATA-PAINT-002: falls back to currentColor where a token is not defined', () => {
    expect(ferrataPaint()).toEqual({
      tone: { easy: 'currentColor', medium: 'currentColor', hard: 'currentColor', unknown: 'currentColor' },
      casing: 'currentColor',
    });
  });
});
