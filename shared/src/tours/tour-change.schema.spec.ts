import { TOUR_CHANGE_MAX, TOUR_CHANGE_OPS, tourChangeRequestSchema, tourChangeSchema } from './tour-change.schema';

import { describe, expect, it } from 'vitest';

const cafe = { lat: 48.1, lng: 11.5, name: 'Cafe', stay_minutes: 20 };

describe('a change to a saved tour prepared for review (MCP-T02)', () => {
  it('takes an add, a remove, a replace and a move, each naming its stations by key', () => {
    expect(tourChangeSchema.options.map((option) => option.shape.op.value)).toEqual([...TOUR_CHANGE_OPS]);
    const changes = [
      { op: 'add', station: cafe, after_key: 'stop-gate' },
      { op: 'remove', key: 'stop-park' },
      { op: 'replace', key: 'stop-museum', station: { ...cafe, opening_hours: 'Mo-Su 08:00-18:00' } },
      { op: 'move', key: 'stop-market', after_key: 'stop-gate' },
    ];
    expect(tourChangeRequestSchema.parse({ changes })).toEqual({ changes });
  });

  it('refuses a change it does not know, a key that is no key, a field a change does not carry and too many changes', () => {
    const refused = [
      { changes: [] },
      { changes: [{ op: 'rename', key: 'stop-gate' }] },
      { changes: [{ op: 'remove', key: 'x' }] },
      { changes: [{ op: 'remove', key: 'stop-gate', after_key: 'stop-park' }] },
      { changes: [{ op: 'add', station: cafe }] },
      { changes: [{ op: 'add', station: { ...cafe, key: 'stop-new1' }, after_key: 'stop-gate' }] },
      { changes: [{ op: 'add', station: { ...cafe, lat: 91 }, after_key: 'stop-gate' }] },
      { changes: [{ op: 'move', key: 'stop-gate' }] },
      { changes: [{ op: 'remove', key: 'stop-gate' }], save: true },
      { changes: Array.from({ length: TOUR_CHANGE_MAX + 1 }, () => ({ op: 'remove', key: 'stop-gate' })) },
    ];
    for (const body of refused) {
      expect(tourChangeRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});
