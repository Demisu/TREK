/**
 * FE-AI-WELCOME-001 to FE-AI-WELCOME-002
 *
 * The empty chat asks what fits the chat it is: a journey's conversation on
 * the journal page asks about the journal, the same conversation in TREK
 * Studio about the book, and each tells a reader what they may not change.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { render, screen } from '../../../tests/helpers/render';
import { useAssistantStore } from '../../store/assistantStore';
import AssistantWelcome from './AssistantWelcome';
import { AssistantViewContext } from './assistantViewContext';

const INITIAL = useAssistantStore.getState();
const JOURNAL_KEY = -12;

afterEach(() => {
  useAssistantStore.setState(INITIAL, true);
});

function welcome(canEdit: boolean) {
  return render(
    <AssistantViewContext.Provider value={{ tripId: JOURNAL_KEY, variant: 'window' }}>
      <AssistantWelcome suggestions={[]} canEdit={canEdit} withSuggestions={false} />
    </AssistantViewContext.Provider>
  );
}

describe('AssistantWelcome', () => {
  it("FE-AI-WELCOME-001: a journey's chat on its page asks about the journal", () => {
    welcome(false);
    expect(screen.getByText('What should go into the journal?')).toBeInTheDocument();
    expect(screen.getByText(/You can only read this journal/)).toBeInTheDocument();
  });

  it('FE-AI-WELCOME-002: the same chat hosted by the Studio asks about the book', () => {
    useAssistantStore.setState({
      studioHosts: { [JOURNAL_KEY]: { render: () => undefined, flush: async () => true } },
    });
    welcome(true);
    expect(screen.getByText('What should the book look like?')).toBeInTheDocument();
    expect(screen.queryByText(/You can only/)).not.toBeInTheDocument();
  });
});
