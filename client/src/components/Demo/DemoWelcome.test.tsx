import { act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { useAuthStore } from '../../store/authStore';
import DemoWelcome from './DemoWelcome';

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { serverTimezone: 'UTC' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DemoWelcome', () => {
  it('FE-COMP-DEMOWELCOME-001: opens as a dialog saying what TREK is', () => {
    render(<DemoWelcome />);
    const dialog = screen.getByRole('dialog', { name: 'Live demo' });
    expect(dialog).toHaveTextContent('Welcome to TREK');
    expect(dialog).toHaveTextContent('The travel planner you share');
  });

  it('FE-COMP-DEMOWELCOME-002: says the demo resets every hour and what it cannot do', () => {
    render(<DemoWelcome />);
    expect(screen.getByText('Everything resets every hour')).toBeInTheDocument();
    for (const line of [
      'Uploading photos, documents and covers',
      'Changing the account, its password or 2FA',
      'Creating API keys',
      'Connecting MCP clients',
      'Connecting your own AI model',
    ])
      expect(screen.getByText(line)).toBeInTheDocument();
  });

  it('FE-COMP-DEMOWELCOME-003: shows the highlights to try and what the full version adds', () => {
    render(<DemoWelcome />);
    for (const title of [
      'Trip planner',
      'Tours and hikes',
      'Photo books in TREK Studio',
      'Plan together live',
      'Journey travel journal',
      'Atlas world map',
      'Vacay holiday planner',
      'Collections',
      'Works offline',
    ])
      expect(screen.getByText(title)).toBeInTheDocument();
    for (const line of ['Sign in with OIDC and SSO', 'Automatic backups', 'Plugins for new features'])
      expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByText('The AI assistant on your own model')).toBeInTheDocument();
    expect(screen.getByText('An admin panel for users, addons and permissions')).toBeInTheDocument();
  });

  it('FE-COMP-DEMOWELCOME-004: links to the repository in a new tab', () => {
    render(<DemoWelcome />);
    const link = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/liketrek/TREK');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('FE-COMP-DEMOWELCOME-005: the countdown runs live in the server zone', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 24, 12, 17, 53)));
    render(<DemoWelcome />);
    expect(screen.getByTestId('demo-countdown')).toHaveTextContent('42:07');

    await act(async () => {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 24, 12, 17, 58)));
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('demo-countdown')).toHaveTextContent('42:02');
  });

  it('FE-COMP-DEMOWELCOME-006: the button closes it', async () => {
    const user = userEvent.setup();
    render(<DemoWelcome />);
    await user.click(screen.getByRole('button', { name: 'Start exploring' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('FE-COMP-DEMOWELCOME-007: Escape closes it too', () => {
    render(<DemoWelcome />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
