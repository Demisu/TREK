/**
 * FE-AI-PARTS-001 to FE-AI-PARTS-014
 *
 * How an answer is laid out: text, the steps the assistant looked up, the
 * places and the weather they found, and one card per batch of proposed
 * changes, each change in the state its approval and receipt put it in.
 */
import {
  ASSISTANT_CHANGE_LABEL_KEYS,
  type AssistantApplied,
  type AssistantChangePreview,
  type AssistantFoundPlace,
  type AssistantMessage,
  type AssistantMessagePart,
  type AssistantWeatherDay,
} from '@trek/shared';
import { describe, expect, it } from 'vitest';

import { CHANGE_LABELS, hasUndecided, messageBlocks, suggestedFromStrip, undoLeftMs } from './assistantParts';

const AT = '2026-10-21T08:00:00.000Z';

function message(parts: AssistantMessagePart[]): AssistantMessage {
  return { id: 'm1', role: 'assistant', status: 'complete', createdAt: AT, parts };
}

function preview(toolCallId: string): AssistantChangePreview {
  return {
    toolCallId,
    verbKey: 'addTodo',
    subject: `Todo ${toolCallId}`,
    rows: [],
    dayId: null,
    placeIds: [],
    undoable: true,
  };
}

function applied(toolCallId: string, undoUntil: string | null = null): AssistantApplied {
  return { toolCallId, entity: 'todo', ids: [1], dayId: null, undoUntil };
}

const read = (id: string, result?: unknown): AssistantMessagePart => ({
  type: 'tool-call',
  toolCallId: id,
  toolName: 'list_places',
  args: {},
  ...(result !== undefined ? { result } : {}),
});

const write = (
  id: string,
  approval: { approved?: boolean; resolution?: 'cancelled' | 'expired' } = {},
  outcome: { result?: unknown; isError?: boolean } = {}
): AssistantMessagePart => ({
  type: 'tool-call',
  toolCallId: id,
  toolName: 'create_todo',
  args: {},
  approval: { id, ...approval },
  ...outcome,
});

describe('messageBlocks', () => {
  it('FE-AI-PARTS-001: keeps text, gathers adjacent reading steps and drops empty text', () => {
    const blocks = messageBlocks(
      message([
        { type: 'text', text: 'Let me look.' },
        read('r1', { ok: 1 }),
        read('r2', { ok: 2 }),
        { type: 'text', text: '  ' },
        { type: 'text', text: 'Found two.' },
      ]),
      false
    );
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'steps', 'text']);
    expect(blocks[1]).toMatchObject({
      kind: 'steps',
      steps: [
        { toolCallId: 'r1', running: false },
        { toolCallId: 'r2', running: false },
      ],
    });
  });

  it('FE-AI-PARTS-002: a step without its result runs only while the answer is being written', () => {
    const parts = [read('r1')];
    expect(messageBlocks(message(parts), true)[0]).toMatchObject({ steps: [{ running: true }] });
    expect(messageBlocks(message(parts), false)[0]).toMatchObject({ steps: [{ running: false }] });
  });

  it('FE-AI-PARTS-003: the changes of one step share a card, each with its preview, wherever the preview sits', () => {
    const blocks = messageBlocks(
      message([
        write('w1'),
        { type: 'data-trek-change', data: preview('w1') },
        write('w2'),
        { type: 'data-trek-change', data: preview('w2') },
      ]),
      false
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'change',
      items: [
        { toolCallId: 'w1', state: 'pending', preview: { subject: 'Todo w1' } },
        { toolCallId: 'w2', state: 'pending', preview: { subject: 'Todo w2' } },
      ],
    });
  });

  it('FE-AI-PARTS-004: reads each change state off its approval, result and receipt', () => {
    const parts: AssistantMessagePart[] = [
      write('applying', { approved: true }),
      write('done', { approved: true }, { result: { id: 1 } }),
      write('receipt', { approved: true }),
      { type: 'data-trek-applied', data: applied('receipt') },
      write('broke', { approved: true }, { result: 'nope', isError: true }),
      write('no', { approved: false }),
      write('late', { resolution: 'expired' }),
    ];
    const [card] = messageBlocks(message(parts), false);
    expect(card?.kind === 'change' && card.items.map((i) => [i.toolCallId, i.state])).toEqual([
      ['applying', 'applying'],
      ['done', 'applied'],
      ['receipt', 'applied'],
      ['broke', 'failed'],
      ['no', 'discarded'],
      ['late', 'expired'],
    ]);
    expect(card?.kind === 'change' && card.items[2]?.applied).toEqual(applied('receipt'));
  });

  it('FE-AI-PARTS-005: text between two batches of changes splits them into two cards', () => {
    const blocks = messageBlocks(message([write('w1'), { type: 'text', text: 'And one more.' }, write('w2')]), false);
    expect(blocks.map((b) => b.kind)).toEqual(['change', 'text', 'change']);
  });
});

function found(ref: string, extra: Partial<AssistantFoundPlace> = {}): AssistantFoundPlace {
  return {
    ref,
    name: `Place ${ref}`,
    address: null,
    lat: 41.89,
    lng: 12.47,
    kind: 'food',
    rating: null,
    openNow: null,
    googlePlaceId: null,
    osmId: null,
    photoKey: null,
    inTripPlaceId: null,
    ...extra,
  };
}

const places = (toolCallId: string, list: AssistantFoundPlace[], more = 0): AssistantMessagePart => ({
  type: 'data-trek-places',
  data: { toolCallId, places: list, more },
});

function sky(date: string, tempMax: number): AssistantWeatherDay {
  return { dayId: null, date, main: 'Clear', tempMax, tempMin: null, rainPct: null, kind: 'forecast' };
}

/** A change of the model that adds a place to day 3: a new one at a spot, or the trip's own by id. */
function adds(id: string, spot: { lat: number; lng: number } | null, placeId: number | null): AssistantMessagePart {
  return {
    type: 'data-trek-change',
    data: {
      ...preview(id),
      effect: {
        kind: 'add',
        dayId: 3,
        fromDayId: null,
        placeId,
        assignmentId: null,
        place: spot && { name: 'New', categoryId: null, ...spot },
      },
    },
  };
}

describe('messageBlocks: found places and weather', () => {
  it('FE-AI-PARTS-008: joins the places of all searches into one strip, each once, and steps after it join the row before it', () => {
    const blocks = messageBlocks(
      message([
        read('s1', []),
        places('s1', [found('s1:0'), found('s1:1', { googlePlaceId: 'ChIJa' })], 2),
        read('s2', []),
        places('s2', [found('s2:0', { name: 'Place s1:0' }), found('s2:1', { googlePlaceId: 'ChIJa', lat: 40 })], 3),
        places('s3', [found('s3:0', { lat: 40 })]),
        { type: 'text', text: 'Three good ones.' },
      ]),
      false
    );
    expect(blocks.map((b) => b.kind)).toEqual(['steps', 'places', 'text']);
    expect(blocks[0]).toMatchObject({ steps: [{ toolCallId: 's1' }, { toolCallId: 's2' }] });
    // The same name at the same spot, or the same Google id, shows once.
    expect(blocks[1]).toMatchObject({
      found: { toolCallId: 's3', more: 5, places: [{ ref: 's1:0' }, { ref: 's1:1' }, { ref: 's3:0' }] },
    });
  });

  it('FE-AI-PARTS-009: drops the places a change of the model proposes, and the strip if none is left', () => {
    const blocks = messageBlocks(
      message([
        places('s1', [found('s1:0'), found('s1:1', { lat: 40, inTripPlaceId: 8 }), found('s1:2', { lat: 39 })]),
        write('w1'),
        adds('w1', { lat: 41.89, lng: 12.47 }, null),
        write('w2'),
        adds('w2', null, 8),
      ]),
      false
    );
    expect(blocks[0]).toMatchObject({ kind: 'places', found: { places: [{ ref: 's1:2' }] } });

    const none = messageBlocks(
      message([places('s1', [found('s1:0')]), write('w1'), adds('w1', { lat: 41.89, lng: 12.47 }, null)]),
      false
    );
    expect(none.map((b) => b.kind)).toEqual(['change']);
  });

  it('FE-AI-PARTS-010: a place suggested from the strip stays on it and reads as suggested', () => {
    const msg = message([
      places('s1', [found('s1:0'), found('s1:1', { lat: 40 })]),
      {
        type: 'tool-call',
        toolCallId: 'f1',
        toolName: 'add_found_place',
        args: { via: 'create_and_assign_place', dayId: 3, name: 'Place s1:0', lat: 41.89, lng: 12.47 },
        approval: { id: 'f1' },
      },
      adds('f1', { lat: 41.89, lng: 12.47 }, null),
    ]);
    const [strip] = messageBlocks(msg, false);
    expect(strip).toMatchObject({ kind: 'places', found: { places: [{ ref: 's1:0' }, { ref: 's1:1' }] } });
    expect(suggestedFromStrip(msg, found('s1:0'))).toBe(true);
    expect(suggestedFromStrip(msg, found('s1:1', { lat: 40 }))).toBe(false);

    const inTrip = message([
      {
        type: 'tool-call',
        toolCallId: 'f2',
        toolName: 'add_found_place',
        args: { placeId: 8 },
        approval: { id: 'f2' },
      },
    ]);
    expect(suggestedFromStrip(inTrip, found('x', { inTripPlaceId: 8 }))).toBe(true);
    expect(suggestedFromStrip(inTrip, found('x', { inTripPlaceId: 9 }))).toBe(false);
  });

  it('FE-AI-PARTS-014: each suggestion from the strip is a card of its own, apart from the changes around it', () => {
    const fromStrip = (id: string, approval: { approved?: boolean } = {}): AssistantMessagePart => ({
      type: 'tool-call',
      toolCallId: id,
      toolName: 'add_found_place',
      args: { placeId: 8 },
      approval: { id, ...approval },
    });
    const blocks = messageBlocks(
      message([write('w1', { approved: true }), fromStrip('f1', { approved: true }), fromStrip('f2'), write('w2')]),
      false
    );
    expect(blocks.map((b) => (b.kind === 'change' ? b.items.map((i) => i.toolCallId) : b.kind))).toEqual([
      ['w1'],
      ['f1'],
      ['f2'],
      ['w2'],
    ]);
  });

  it('FE-AI-PARTS-011: the weather of all steps is one row, one entry per date, where the first look sat', () => {
    const blocks = messageBlocks(
      message([
        read('w1', {}),
        { type: 'data-trek-weather', data: { days: [sky('2026-11-03', 18), sky('2026-11-02', 20)] } },
        { type: 'text', text: 'Mild.' },
        { type: 'data-trek-weather', data: { days: [sky('2026-11-03', 15)] } },
      ]),
      false
    );
    expect(blocks.map((b) => b.kind)).toEqual(['steps', 'weather', 'text']);
    expect(blocks[1]).toMatchObject({
      kind: 'weather',
      days: [
        { date: '2026-11-02', tempMax: 20 },
        { date: '2026-11-03', tempMax: 15 },
      ],
    });
  });
});

describe('hasUndecided', () => {
  it('FE-AI-PARTS-012: is true only while a change waits for the user', () => {
    expect(hasUndecided([message([write('w1')])])).toBe(true);
    expect(hasUndecided([message([write('w1', { approved: true })])])).toBe(false);
    expect(hasUndecided([message([write('w1', { resolution: 'expired' })])])).toBe(false);
    expect(hasUndecided([message([read('r1')])])).toBe(false);
  });
});

describe('undoLeftMs', () => {
  it('FE-AI-PARTS-006: counts down to the end of the undo window and stops at zero', () => {
    const now = Date.parse(AT);
    expect(undoLeftMs(applied('a', '2026-10-21T08:10:00.000Z'), now)).toBe(10 * 60_000);
    expect(undoLeftMs(applied('a', '2026-10-21T07:59:00.000Z'), now)).toBe(0);
    expect(undoLeftMs(applied('a', null), now)).toBe(0);
    expect(undoLeftMs(null, now)).toBe(0);
  });
});

describe('CHANGE_LABELS', () => {
  it('FE-AI-PARTS-013: names a route', () => {
    expect(CHANGE_LABELS.route.labelKey).toBe('assistant.change.label.route');
  });

  it('FE-AI-PARTS-007: names every field a change row can carry', () => {
    for (const key of ASSISTANT_CHANGE_LABEL_KEYS) {
      expect(CHANGE_LABELS[key].labelKey).toBe(`assistant.change.label.${key}`);
    }
  });
});
