/**
 * FE-AI-FOLLOW-001 to FE-AI-FOLLOW-002
 *
 * The follow-ups a card offers under an answer that ends on it: the ones that
 * ask for a change only for someone who may make it, and the answer's own
 * when none is left for a reader.
 */
import type { AssistantMessage, TrekCard } from '@trek/shared';
import { afterEach, describe, expect, it } from 'vitest';

import { followUpsFor } from './assistantFollowUpRules';
import { CARD_LOOKS } from './cards/cardLooks';

const answer: AssistantMessage = {
  id: 'a1',
  role: 'assistant',
  status: 'complete',
  createdAt: '2026-10-22T08:00:00.000Z',
  parts: [
    { type: 'text', text: 'Here is your year.' },
    { type: 'tool-call', toolCallId: 'r1', toolName: 'get_vacay_plan', args: {}, result: {} },
    { type: 'data-trek-card', data: { toolCallId: 'r1', card: { kind: 'vacay' } as TrekCard } },
  ],
};

afterEach(() => {
  delete CARD_LOOKS.vacay.followUps;
});

describe('card follow-ups', () => {
  it('FE-AI-FOLLOW-001: a follow-up that asks for a change is offered only to someone who may make it', () => {
    CARD_LOOKS.vacay.followUps = [
      { id: 'planDays', labelKey: 'assistant.followUp.next', edits: true },
      { id: 'holidays', labelKey: 'assistant.followUp.more' },
    ];
    expect(followUpsFor(answer, true).map((f) => f.id)).toEqual(['planDays', 'holidays']);
    expect(followUpsFor(answer, false).map((f) => f.id)).toEqual(['holidays']);
  });

  it('FE-AI-FOLLOW-002: with no card follow-up left for a reader, the answer offers its own', () => {
    CARD_LOOKS.vacay.followUps = [{ id: 'planDays', labelKey: 'assistant.followUp.next', edits: true }];
    expect(followUpsFor(answer, false).map((f) => f.id)).toEqual(['more', 'next']);
  });
});
