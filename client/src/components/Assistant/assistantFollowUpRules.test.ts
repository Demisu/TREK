/**
 * FE-AI-FOLLOW-001 to FE-AI-FOLLOW-003
 *
 * The follow-ups a card offers under an answer that ends on it: the ones that
 * ask for a change only for someone who may make it, the answer's own when
 * none is left for a reader, and the ones with a condition only when a card of
 * the answer meets it.
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

  it('FE-AI-FOLLOW-003: a follow-up with a condition is offered only when a card of the answer meets it', () => {
    const asked: TrekCard[] = [];
    CARD_LOOKS.vacay.followUps = [
      { id: 'planDays', labelKey: 'assistant.followUp.next', when: () => false },
      {
        id: 'holidays',
        labelKey: 'assistant.followUp.more',
        when: (card) => {
          asked.push(card);
          return true;
        },
      },
    ];
    expect(followUpsFor(answer, true).map((f) => f.id)).toEqual(['holidays']);
    expect(asked).toEqual([{ kind: 'vacay' }]);
  });
});
