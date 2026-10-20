import {
  applyChanges,
  refusalText,
  type ChangeBasis,
  type DraftPoint,
} from '../../../src/nest/tours/tour-change-apply';
import { CITY_WALK_MAX_STATIONS, type TourChange, type TourWaypoint } from '@trek/shared';

import { describe, expect, it } from 'vitest';

// TCHG-APPLY-001 to TCHG-APPLY-007

const point = (key: string, sequence: number, extra: Partial<TourWaypoint> = {}): TourWaypoint => ({
  lat: 48 + sequence * 0.01,
  lng: 11,
  role: 'via',
  sequence,
  key,
  name: key.replace('stop-', ''),
  ...extra,
});

/** A walk from the gate past the museum, a shaping point and the park to its end. */
const walk = (): TourWaypoint[] => [
  point('stop-gate', 0, { role: 'start' }),
  point('stop-museum', 1, { stay_minutes: 45, importance: 'must' }),
  point('shape-0001', 2, { shaping: true, name: null }),
  point('stop-park', 3),
  point('stop-end', 4, { role: 'end' }),
];

const basis = (over: Partial<ChangeBasis> = {}): ChangeBasis => ({
  tourType: 'walk',
  recorded: false,
  points: walk(),
  done: new Map(),
  linkable: new Set([7]),
  ...over,
});

const cafe = { lat: 48.015, lng: 11.001, name: 'Cafe', stay_minutes: 20 };

function ready(outcome: ReturnType<typeof applyChanges>) {
  if (outcome.kind !== 'ready') throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  return outcome;
}

const refs = (points: readonly DraftPoint[]) => points.map((p) => p.ref);

describe('a change laid onto a saved walk (MCP-T02)', () => {
  it('TCHG-APPLY-001: an add goes right after its station, stops after the same one keep their order, roles follow', () => {
    const changes: TourChange[] = [
      { op: 'add', station: cafe, after_key: 'stop-museum' },
      { op: 'add', station: { ...cafe, name: 'Bakery', linked_place_id: 7 }, after_key: 'stop-museum' },
    ];
    const { points, removed, replaced } = ready(applyChanges(basis(), changes));
    expect(refs(points)).toEqual(['stop-gate', 'stop-museum', 'new:1', 'new:2', 'shape-0001', 'stop-park', 'stop-end']);
    expect(points.map((p) => [p.sequence, p.role])).toEqual([
      [0, 'start'],
      [1, 'via'],
      [2, 'via'],
      [3, 'via'],
      [4, 'via'],
      [5, 'via'],
      [6, 'end'],
    ]);
    expect(points[2]).toMatchObject({ name: 'Cafe', origin: 'added', change: 1, after: 'stop-museum', replaces: null });
    expect(points[2]?.key).toBeUndefined();
    expect(points[3]).toMatchObject({ name: 'Bakery', linked_place_id: 7, change: 2 });
    expect([removed, replaced]).toEqual([[], []]);
  });

  it('TCHG-APPLY-002: remove, replace and move each say what they did, and a move goes before or after where it was', () => {
    const changes: TourChange[] = [
      { op: 'remove', key: 'stop-park' },
      { op: 'replace', key: 'stop-museum', station: cafe },
      { op: 'move', key: 'stop-end', after_key: 'stop-gate' },
      { op: 'move', key: 'stop-gate', after_key: 'stop-end' },
    ];
    const { points, removed, replaced } = ready(applyChanges(basis(), changes));
    expect(refs(points)).toEqual(['stop-end', 'stop-gate', 'new:2', 'shape-0001']);
    expect(points[0]).toMatchObject({ origin: 'moved', change: 3, role: 'start' });
    expect(points[2]).toMatchObject({ origin: 'replacing', replaces: 'stop-museum', name: 'Cafe' });
    expect(points[3]?.role).toBe('end');
    expect(removed.map((p) => [p.ref, p.change])).toEqual([['stop-park', 1]]);
    expect(replaced.map((p) => [p.ref, p.change, p.importance])).toEqual([['stop-museum', 2, 'must']]);
  });

  it('TCHG-APPLY-003: what the travellers did, a protected station and a hand-drawn leg stay as they are', () => {
    const points = walk();
    points[3] = { ...points[3], protected: true } as TourWaypoint;
    points[0] = {
      ...points[0],
      fixed_leg: {
        kind: 'free',
        geometry: [
          [48, 11],
          [48.01, 11],
        ],
      },
    } as TourWaypoint;
    const done = new Map([['stop-end', [{ day_id: 7, status: 'visited' as const }]]]);
    const outcome = applyChanges(basis({ points, done }), [
      { op: 'remove', key: 'stop-park' },
      { op: 'move', key: 'stop-end', after_key: 'stop-gate' },
      { op: 'replace', key: 'stop-museum', station: cafe },
      { op: 'add', station: cafe, after_key: 'stop-museum' },
    ]);
    expect(outcome).toEqual({
      kind: 'refused',
      refused: [
        { change: 1, op: 'remove', key: 'stop-park', reason: 'protected' },
        { change: 2, op: 'move', key: 'stop-end', reason: 'done', days: [{ day_id: 7, status: 'visited' }] },
        { change: 2, op: 'move', key: 'stop-gate', reason: 'fixed_leg' },
        { change: 2, op: 'move', key: 'stop-gate', reason: 'before_done' },
        { change: 3, op: 'replace', key: 'stop-museum', reason: 'fixed_leg' },
        { change: 4, op: 'add', key: 'stop-museum', reason: 'before_done' },
      ],
    });
    if (outcome.kind !== 'refused') return;
    const text = refusalText(outcome.refused);
    expect(text.split('\n')[0]).toBe('Nothing was prepared and nothing changed.');
    expect(text).toContain('Change 2 (move stop-end): the travellers already visited or skipped');
    expect(text).toContain('day ids 7 visited.');
  });

  it('TCHG-APPLY-004: a station is named by its key, once gone it cannot be named again, and nothing moves after itself', () => {
    const outcome = applyChanges(basis({ linkable: new Set() }), [
      { op: 'remove', key: 'stop-nowhere' },
      { op: 'remove', key: 'shape-0001' },
      { op: 'remove', key: 'stop-park' },
      { op: 'move', key: 'stop-park', after_key: 'stop-gate' },
      { op: 'move', key: 'stop-gate', after_key: 'stop-gate' },
      { op: 'add', station: { ...cafe, linked_place_id: 7 }, after_key: 'stop-gate' },
    ]);
    expect(outcome.kind === 'refused' && outcome.refused.map((r) => [r.change, r.key, r.reason])).toEqual([
      [1, 'stop-nowhere', 'unknown_station'],
      [2, 'shape-0001', 'unknown_station'],
      [4, 'stop-park', 'already_changed'],
      [5, 'stop-gate', 'anchor_is_station'],
      [6, null, 'place_not_linkable'],
    ]);
  });

  it('TCHG-APPLY-005: a type without changes, a recorded track and a walk left with too few or too many stations are refused whole', () => {
    const whole = (outcome: ReturnType<typeof applyChanges>) =>
      outcome.kind === 'refused' ? outcome.refused.map((r) => [r.change, r.reason]) : outcome.kind;
    const remove: TourChange[] = [{ op: 'remove', key: 'stop-park' }];
    expect(whole(applyChanges(basis({ tourType: 'hike' }), remove))).toEqual([[null, 'type_not_supported']]);
    expect(whole(applyChanges(basis({ recorded: true }), remove))).toEqual([[null, 'recorded_track']]);
    const removeAllBut = ['stop-gate', 'stop-museum', 'stop-park'].map((key): TourChange => ({ op: 'remove', key }));
    expect(whole(applyChanges(basis(), removeAllBut))).toEqual([[null, 'too_few_stations']]);

    const full = Array.from({ length: CITY_WALK_MAX_STATIONS }, (_, i) => point(`stop-${1000 + i}`, i));
    const add: TourChange[] = [{ op: 'add', station: cafe, after_key: 'stop-1000' }];
    expect(whole(applyChanges(basis({ points: full }), add))).toEqual([[null, 'too_many_stations']]);
    // A walk already past the limit can still lose a station or swap one.
    const over = [...full, point('stop-2000', CITY_WALK_MAX_STATIONS)];
    const shrink: TourChange[] = [{ op: 'remove', key: 'stop-1001' }];
    const swap: TourChange[] = [{ op: 'replace', key: 'stop-1001', station: cafe }];
    expect(whole(applyChanges(basis({ points: over }), shrink))).toBe('ready');
    expect(whole(applyChanges(basis({ points: over }), swap))).toBe('ready');
  });

  it('TCHG-APPLY-006: a loop keeps ending where it starts, and its way back is no station to name', () => {
    const loop = [
      point('stop-gate', 0, { role: 'start' }),
      point('stop-museum', 1),
      point('stop-park', 2),
      point('stop-back', 3, { role: 'end', lat: 48 }),
    ];
    const moved = ready(
      applyChanges(basis({ points: loop }), [
        { op: 'move', key: 'stop-gate', after_key: 'stop-park' },
        { op: 'add', station: cafe, after_key: 'stop-gate' },
      ]),
    );
    expect(refs(moved.points)).toEqual(['stop-museum', 'stop-park', 'stop-gate', 'new:2', 'stop-back']);
    expect(moved.points[4]).toMatchObject({ lat: moved.points[0]?.lat, lng: 11, role: 'end', origin: 'saved' });
    const back = applyChanges(basis({ points: loop }), [{ op: 'remove', key: 'stop-back' }]);
    expect(back.kind === 'refused' && back.refused[0]?.reason).toBe('unknown_station');
  });

  it('TCHG-APPLY-007: a point saved before keys existed keeps a ref no key can spell, and stays untouched', () => {
    const points = walk();
    points[3] = { ...points[3], key: undefined } as TourWaypoint;
    const add: TourChange[] = [{ op: 'add', station: cafe, after_key: 'stop-gate' }];
    const { points: after } = ready(applyChanges(basis({ points }), add));
    expect(refs(after)).toEqual(['stop-gate', 'new:1', 'stop-museum', 'shape-0001', 'saved:3', 'stop-end']);
  });
});
