/**
 * FE-AI-MSG-CARDS-001 to 002
 *
 * The places and the weather a step found are stored parts of the answer,
 * like a change card: they land in the message being written, and a chunk
 * sent again for the same search step replaces its part instead of adding a
 * second strip.
 */
import type { AssistantMessage, AssistantPlaces } from '@trek/shared';
import { describe, expect, it } from 'vitest';
import { applyChunk } from './assistantMessages';

const NOW = () => '2026-10-21T08:00:00.000Z';

const PLACES: AssistantPlaces = {
  toolCallId: 'search-1',
  places: [
    {
      ref: 'search-1:0',
      name: 'Da Enzo',
      address: null,
      lat: 41.88,
      lng: 12.47,
      kind: 'food',
      rating: 4.6,
      openNow: null,
      googlePlaceId: null,
      osmId: null,
      photoKey: null,
      inTripPlaceId: null,
    },
  ],
  more: 3,
};

function started(): AssistantMessage[] {
  return applyChunk([], { type: 'start', messageId: 'msg-1' }, NOW);
}

describe('assistantMessages: cards in an answer', () => {
  it('FE-AI-MSG-CARDS-001: the places of one step are one part, replaced when the step sends them again', () => {
    let messages = applyChunk(started(), { type: 'data-trek-places', data: PLACES }, NOW);
    messages = applyChunk(messages, { type: 'data-trek-places', data: { ...PLACES, more: 0 } }, NOW);
    messages = applyChunk(messages, { type: 'data-trek-places', data: { ...PLACES, toolCallId: 'search-2' } }, NOW);
    const parts = messages[0]?.parts ?? [];
    expect(parts.map((p) => (p.type === 'data-trek-places' ? [p.data.toolCallId, p.data.more] : p.type))).toEqual([
      ['search-1', 0],
      ['search-2', 3],
    ]);
  });

  it('FE-AI-MSG-CARDS-002: the weather lands in the answer; the live activity never does', () => {
    let messages = applyChunk(
      started(),
      {
        type: 'data-trek-weather',
        data: {
          days: [
            { dayId: 3, date: '2026-10-22', main: 'Clear', tempMax: 21, tempMin: 12, rainPct: 10, kind: 'forecast' },
          ],
        },
      },
      NOW
    );
    messages = applyChunk(
      messages,
      { type: 'data-trek-activity', data: { toolCallId: 'w', label: 'Rome', area: null }, transient: true },
      NOW
    );
    expect(messages[0]?.parts.map((p) => p.type)).toEqual(['data-trek-weather']);
  });
});
