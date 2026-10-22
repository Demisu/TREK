/**
 * FE-STUDIO-ASTPANEL-001 to FE-STUDIO-ASTPANEL-003
 *
 * The assistant's column in TREK Studio (journey-studio.md 3.4, 4.5): the
 * journey's chat with its own question; the notice that images of a page
 * leave only once the user agreed, for the connection on screen, and that
 * "Not now" keeps it text for the visit; every key inside the column belongs
 * to the chat, so Studio neither closes nor edits the page's selection, and
 * Escape stops a running answer first.
 */
import type { AiStatusResponse } from '@trek/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { aiConnectionsRepo } from '../../repo/aiConnectionsRepo';
import { assistantRepo } from '../../repo/assistantRepo';
import { assistantChatKey } from '../../store/assistantChatKey';
import { chatOf, useAssistantStore } from '../../store/assistantStore';
import StudioAssistantPanel from './StudioAssistantPanel';
import type { StudioAssistant } from './useStudioAssistant';

const JOURNEY = 12;
const KEY = assistantChatKey({ kind: 'journey', journeyId: JOURNEY });
const INITIAL = useAssistantStore.getState();

const STATUS: AiStatusResponse = {
  available: true,
  policy: 'instance',
  canConnectOwn: false,
  effective: { source: 'instance', kind: 'anthropic', model: 'claude', host: 'api.anthropic.com', paidBy: 'instance' },
  own: null,
  instance: { kind: 'anthropic', model: 'claude', host: 'api.anthropic.com' },
  quota: null,
  privacyAcked: true,
  studioImagesAcked: false,
  retention: { mode: 'days', days: 90 },
  openrouterOAuth: false,
};

function assistant(): StudioAssistant {
  return { chatKey: KEY, available: true, open: true, toggle: vi.fn(), jobs: [], drawn: vi.fn() };
}

beforeEach(() => {
  vi.spyOn(assistantRepo, 'threads').mockResolvedValue([]);
  useAssistantStore.setState({ ...INITIAL, status: STATUS, byTrip: {}, studioHosts: {} });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAssistantStore.setState(INITIAL);
});

describe('StudioAssistantPanel', () => {
  it('FE-STUDIO-ASTPANEL-001: shows the journey chat and lets page images leave once the user agreed', async () => {
    const ack = vi.spyOn(aiConnectionsRepo, 'ackPrivacy').mockResolvedValueOnce(undefined);
    render(<StudioAssistantPanel assistant={assistant()} title="Lisbon" />);

    expect(screen.getByRole('complementary', { name: 'Book assistant' })).toBeInTheDocument();
    expect(await screen.findByText('What should the book look like?')).toBeInTheDocument();
    const notice = screen.getByRole('note');
    expect(notice.textContent).toContain('Only that page goes to Anthropic');

    fireEvent.click(screen.getByRole('button', { name: 'Show it pages' }));

    await waitFor(() => expect(screen.queryByRole('note')).toBeNull());
    expect(ack).toHaveBeenCalledWith({ kind: 'anthropic', host: 'api.anthropic.com', scope: 'studio_images' });
    expect(useAssistantStore.getState().status?.studioImagesAcked).toBe(true);
  });

  it('FE-STUDIO-ASTPANEL-002: "Not now" keeps the pages as text, an agreed connection shows no notice', async () => {
    const ack = vi.spyOn(aiConnectionsRepo, 'ackPrivacy');
    const { unmount } = render(<StudioAssistantPanel assistant={assistant()} title="Lisbon" />);

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(ack).not.toHaveBeenCalled();
    unmount();

    useAssistantStore.setState({ status: { ...STATUS, studioImagesAcked: true } });
    render(<StudioAssistantPanel assistant={assistant()} title="Lisbon" />);
    expect(await screen.findByText('What should the book look like?')).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('FE-STUDIO-ASTPANEL-003: keys in the column stay there, Escape stops a running answer first', () => {
    const cancel = vi.fn();
    useAssistantStore.setState({
      cancel,
      byTrip: { [KEY]: { ...chatOf(useAssistantStore.getState(), KEY), isRunning: true } },
    });
    const studioKeys = vi.fn();
    window.addEventListener('keydown', studioKeys);
    const panel = assistant();
    render(<StudioAssistantPanel assistant={panel} title="Lisbon" />);

    const column = screen.getByRole('complementary', { name: 'Book assistant' });
    // The editor deletes the selected elements on Backspace; from the chat it must not hear it.
    fireEvent.keyDown(column, { key: 'Backspace' });
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.keyDown(column, { key: 'Escape' });

    expect(studioKeys).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(KEY);
    expect(panel.toggle).not.toHaveBeenCalled();
    window.removeEventListener('keydown', studioKeys);
  });
});
