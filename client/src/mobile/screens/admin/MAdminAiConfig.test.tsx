// FE-MOB-AI-ADMIN-001 to FE-MOB-AI-ADMIN-002: the AI assistant's form under its tile on the phone.
import userEvent from '@testing-library/user-event';
import type { AiAdminSettings } from '@trek/shared';
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

const { default: MAdminAiConfig } = await import('./MAdminAiConfig');

const SETTINGS: AiAdminSettings = { policy: 'instance', dailyTurns: 25, retention: { mode: 'days', days: 30 } };

beforeEach(() => {
  vi.clearAllMocks();
  useAssistantStore.setState({ status: null });
  repo.status.mockRejectedValue(new Error('not needed'));
  repo.adminSettings.mockResolvedValue(SETTINGS);
  repo.saveAdminSettings.mockImplementation(async (next: AiAdminSettings) => next);
  repo.adminConnection.mockResolvedValue({
    connection: {
      scope: 'instance',
      kind: 'gemini',
      model: 'gemini-flash',
      hint: '…77aa',
      status: 'ok',
      host: 'generativelanguage.googleapis.com',
      baseUrl: null,
    },
    prefill: null,
  });
  repo.adminModels.mockResolvedValue([
    { id: 'gemini-flash', label: 'Gemini Flash', supportsTools: true },
    { id: 'gemini-pro', label: 'Gemini Pro', supportsTools: true },
  ]);
});

describe('MAdminAiConfig', () => {
  it('FE-MOB-AI-ADMIN-001: shows the policy, the live connection with its models, the limit and the retention', async () => {
    render(<MAdminAiConfig />);
    expect(await screen.findByRole('radio', { name: 'I pay for everyone' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Gemini Pro' })).toBeInTheDocument());
    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Keep chats' })).toHaveValue('30');
  });

  it('FE-MOB-AI-ADMIN-002: a retention picked from the list is saved at once', async () => {
    const user = userEvent.setup();
    render(<MAdminAiConfig />);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Keep chats' }), 'forever');
    await waitFor(() =>
      expect(repo.saveAdminSettings).toHaveBeenCalledWith({ ...SETTINGS, retention: { mode: 'forever' } })
    );
  });
});
