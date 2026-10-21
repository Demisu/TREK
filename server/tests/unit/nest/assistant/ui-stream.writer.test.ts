/**
 * The assistant's stream writer against the wire contract: written in the
 * order of the shared fixture, it produces the fixture byte for byte (the
 * client's parser is tested against the same file), and every chunk it writes
 * parses as a chunk of the shared schema.
 */
import { UiStreamWriter } from '../../../../src/nest/assistant/ui-stream.writer';
import type { SseStream } from '../../../../src/nest/common/sse-stream';
import { uiStreamChunkSchema, UI_STREAM_DONE } from '@trek/shared';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURE = readFileSync(
  resolve(__dirname, '../../../../../shared/src/assistant/__fixtures__/ui-stream.v1.txt'),
  'utf8',
);

function memoryStream(): SseStream & { text: () => string; ended: boolean } {
  let out = '';
  const stream = {
    ended: false,
    send(data: string) {
      if (!stream.ended) out += `data: ${data}\n\n`;
    },
    comment(text: string) {
      if (!stream.ended) out += `: ${text}\n\n`;
    },
    end() {
      stream.ended = true;
    },
    get open() {
      return !stream.ended;
    },
    text: () => out,
  };
  return stream;
}

const WRITE_ID = '3f2b8c1e-6d4a-4f7b-9e2c-5a1d8b7c6e40';

describe('UiStreamWriter', () => {
  it('ASTWRT-001: writes the shared fixture byte for byte', () => {
    const stream = memoryStream();
    const w = new UiStreamWriter(stream);
    w.start('msg-12');
    w.thread(7, 'Fit the Golden Pavilion into Friday');
    w.startStep();
    w.toolInput('toolu_01', 'get_trip_summary', {});
    w.toolOutput('toolu_01', {
      title: 'Kyoto in June',
      days: [
        { id: 31, date: '2026-06-11', places: 3 },
        { id: 32, date: '2026-06-12', places: 1 },
      ],
    });
    w.finishStep();
    w.startStep();
    w.text('Friday has room in the afternoon. ');
    w.text('I would add Kinkaku-ji there.');
    w.toolInput(WRITE_ID, 'create_and_assign_place', {
      dayId: 32,
      name: 'Kinkaku-ji',
      address: '1 Kinkakujicho, Kita Ward, Kyoto',
      lat: 35.0394,
      lng: 135.7292,
    });
    w.approvalRequest(WRITE_ID);
    w.change({
      toolCallId: WRITE_ID,
      verbKey: 'addPlaceToDay',
      subject: 'Kinkaku-ji',
      rows: [
        { op: 'add', labelKey: 'day', before: null, after: 'Day 2, Fri 12 Jun' },
        { op: 'add', labelKey: 'address', before: null, after: '1 Kinkakujicho, Kita Ward, Kyoto' },
      ],
      dayId: 32,
      placeIds: [],
      undoable: true,
    });
    w.quota(3, 50);
    w.finish('tool-calls');
    w.close();
    expect(stream.text()).toBe(FIXTURE);
    expect(stream.ended).toBe(true);
  });

  it('ASTWRT-002: every chunk it writes is one of the shared schema', () => {
    const stream = memoryStream();
    const w = new UiStreamWriter(stream);
    w.start('msg-1');
    w.text('a');
    w.toolInput('c1', 'list_places', {});
    w.toolError('c1', 'nope');
    w.toolDenied('c2');
    w.applied({ toolCallId: 'c3', entity: 'place', ids: [4], dayId: null, undoUntil: null });
    w.error('max_steps');
    w.abort();
    w.finish();
    w.close();
    const events = stream
      .text()
      .split('\n\n')
      .filter(Boolean)
      .map((event) => event.slice('data: '.length));
    expect(events.pop()).toBe(UI_STREAM_DONE);
    for (const event of events) expect(uiStreamChunkSchema.safeParse(JSON.parse(event)).success).toBe(true);
    expect(events.map((event) => (JSON.parse(event) as { type: string }).type)).toEqual([
      'start',
      'text-start',
      'text-delta',
      'text-end',
      'tool-input-start',
      'tool-input-available',
      'tool-output-error',
      'tool-output-denied',
      'data-trek-applied',
      'error',
      'abort',
      'finish',
    ]);
  });

  it('ASTWRT-003: opens a new text run after anything else, under a new id', () => {
    const stream = memoryStream();
    const w = new UiStreamWriter(stream);
    w.text('one');
    w.finishStep();
    w.text('two');
    w.text('');
    w.finish('stop');
    expect(stream.text()).toContain('"type":"text-start","id":"txt-0"');
    expect(stream.text()).toContain('"type":"text-end","id":"txt-0"');
    expect(stream.text()).toContain('"type":"text-start","id":"txt-1"');
    expect(stream.text().indexOf('"id":"txt-1"')).toBeLessThan(stream.text().indexOf('"type":"finish"'));
    expect(stream.text().match(/text-delta/g)).toHaveLength(2);
  });

  it('ASTWRT-004: drops everything after close, and closes once', () => {
    const stream = memoryStream();
    const w = new UiStreamWriter(stream);
    w.close();
    w.start('msg-2');
    w.close();
    expect(stream.text()).toBe(`data: ${UI_STREAM_DONE}\n\n`);
  });
  it('ASTWRT-005: writes the cards of an answer as chunks of the schema, the live activity marked transient', () => {
    const stream = memoryStream();
    const w = new UiStreamWriter(stream);
    w.text('Looking');
    w.activity({ toolCallId: 'call_1', label: 'Trastevere', area: null });
    w.places({ toolCallId: 'call_1', places: [], more: 0 });
    w.weather({
      days: [
        { dayId: 4, date: '2026-06-11', main: 'Drizzle', tempMax: 19, tempMin: null, rainPct: 80, kind: 'forecast' },
      ],
    });
    const chunks = stream
      .text()
      .split('\n\n')
      .filter((event) => event.startsWith('data: '))
      .map((event) => uiStreamChunkSchema.parse(JSON.parse(event.slice('data: '.length))));
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
      'data-trek-activity',
      'data-trek-places',
      'data-trek-weather',
    ]);
    expect(chunks[3]).toMatchObject({ transient: true, data: { label: 'Trastevere' } });
  });
});
