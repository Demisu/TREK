// FE-COMP-AI-ADMIN-001 to FE-COMP-AI-ADMIN-004: the AI assistant's form on its addon tile.
import userEvent from '@testing-library/user-event';
import type { AiAdminConnectionResponse, AiAdminSettings } from '@trek/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../../../../tests/helpers/render';
import { useAssistantStore } from '../../../store/assistantStore';

const repo = vi.hoisted(() => ({
  status: vi.fn(),
  adminSettings: vi.fn(),
  saveAdminSettings: vi.fn(),
  adminConnection: vi.fn(),
  saveAdminConnection: vi.fn(),
  removeAdminConnection: vi.fn(),
  adminModels: vi.fn(),
}));
vi.mock('../../../repo/aiConnectionsRepo', () => ({ aiConnectionsRepo: repo }));

const { default: AiAdminConfig } = await import('./AiAdminConfig');

const SETTINGS: AiAdminSettings = { policy: 'instance_or_user', dailyTurns: 50, retention: { mode: 'days', days: 90 } };
const LIVE: AiAdminConnectionResponse = {
  connection: {
    scope: 'instance',
    kind: 'openai',
    model: 'gpt-5.5',
    hint: '…9f3c',
    status: 'ok',
    host: 'api.openai.com',
    baseUrl: null,
  },
  prefill: null,
};

function renderConfig() {
  return render(
    <ul>
      <AiAdminConfig />
    </ul>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAssistantStore.setState({ status: null });
  repo.status.mockRejectedValue(new Error('not needed'));
  repo.adminSettings.mockResolvedValue(SETTINGS);
  repo.saveAdminSettings.mockImplementation(async (next: AiAdminSettings) => next);
  repo.adminConnection.mockResolvedValue({ connection: null, prefill: null });
  repo.removeAdminConnection.mockResolvedValue(undefined);
  repo.adminModels.mockResolvedValue([{ id: 'gpt-5.5', label: 'GPT-5.5', supportsTools: true }]);
});

describe('AiAdminConfig', () => {
  it('FE-COMP-AI-ADMIN-001: shows who pays, the setup for everyone, the daily limit and the retention', async () => {
    renderConfig();
    expect(await screen.findByRole('radio', { name: 'I pay, own allowed' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Everyone uses the connection below unless they connect their own.')).toBeInTheDocument();
    expect(screen.getByText('No connection yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Own server/ })).toBeInTheDocument();
    expect(screen.queryByText('Sign in with ChatGPT')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    expect(screen.getByText('Keep chats')).toBeInTheDocument();
  });

  it('FE-COMP-AI-ADMIN-002: "Everyone uses their own" drops the connection and the limit', async () => {
    const user = userEvent.setup();
    renderConfig();
    await user.click(await screen.findByRole('radio', { name: 'Everyone uses their own account' }));
    await waitFor(() => expect(screen.queryByText('No connection yet.')).not.toBeInTheDocument());
    expect(repo.saveAdminSettings).toHaveBeenCalledWith({ ...SETTINGS, policy: 'user' });
    expect(screen.queryByText('Messages per person per day')).not.toBeInTheDocument();
    expect(screen.getByText('Everyone connects their own provider. Nothing is charged to you.')).toBeInTheDocument();
  });

  it('FE-COMP-AI-ADMIN-003: a live connection shows its provider and opens the setup only to change it', async () => {
    const user = userEvent.setup();
    repo.adminConnection.mockResolvedValue(LIVE);
    renderConfig();
    expect(await screen.findByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('…9f3c')).toBeInTheDocument();
    expect(screen.queryByText('What would you like to chat with?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByText('What would you like to chat with?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('FE-COMP-AI-ADMIN-004: removing the connection asks first', async () => {
    const user = userEvent.setup();
    repo.adminConnection.mockResolvedValueOnce(LIVE).mockResolvedValue({ connection: null, prefill: null });
    renderConfig();
    await user.click(await screen.findByRole('button', { name: 'Remove connection' }));
    expect(screen.getByText('Disconnect OpenAI? Your chats stay.')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Remove connection' });
    await user.click(buttons[buttons.length - 1]);
    expect(await screen.findByText('No connection yet.')).toBeInTheDocument();
    expect(repo.removeAdminConnection).toHaveBeenCalledTimes(1);
  });
});
