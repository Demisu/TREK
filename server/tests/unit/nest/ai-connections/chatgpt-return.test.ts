/**
 * Sign in with ChatGPT through the TREK relay: where the browser comes back
 * to, what the relay can read from the state, and which addresses a sign-in
 * may end on.
 */
import {
  chatgptRelay,
  chatgptReturnUrl,
  isChatgptCallback,
  PROJECT_CHATGPT_CLIENT_ID,
  relayState,
} from '../../../../src/nest/ai-connections/chatgpt-return';

import { describe, expect, it } from 'vitest';

const LOOPBACK = 'http://127.0.0.1:1455/auth/callback';

describe('the ChatGPT relay', () => {
  it('CGRET-001: comes back to the settings of an https install, or of one on this machine, never elsewhere', () => {
    expect(chatgptReturnUrl('https://trip.example.org')).toBe(
      'https://trip.example.org/settings?tab=integrations&ai=chatgpt',
    );
    expect(chatgptReturnUrl('https://example.org/trek/')).toBe(
      'https://example.org/trek/settings?tab=integrations&ai=chatgpt',
    );
    expect(chatgptReturnUrl('http://localhost:3000')).toBe('http://localhost:3000/settings?tab=integrations&ai=chatgpt');
    expect(chatgptReturnUrl('http://192.168.1.4:3000')).toBeNull();
    expect(chatgptReturnUrl('not a url')).toBeNull();
  });

  it('CGRET-002: is used only once the project has its client id', () => {
    const relay = chatgptRelay('https://trip.example.org');
    if (PROJECT_CHATGPT_CLIENT_ID) {
      expect(relay).toMatchObject({ clientId: PROJECT_CHATGPT_CLIENT_ID, redirectUri: expect.stringMatching(/^https:/) });
    } else {
      expect(relay).toBeNull();
    }
    expect(chatgptRelay('http://192.168.1.4:3000')).toBeNull();
  });

  it('CGRET-003: the state carries the return address after its check value, readable by the relay', () => {
    const state = relayState('check', 'https://trip.example.org/settings?tab=integrations&ai=chatgpt');
    const [check, back] = state.split('.');
    expect(check).toBe('check');
    expect(Buffer.from(back ?? '', 'base64url').toString('utf8')).toBe(
      'https://trip.example.org/settings?tab=integrations&ai=chatgpt',
    );
  });

  it('CGRET-004: a sign-in ends on the loopback page or on these settings, and nowhere else', () => {
    const app = 'https://trip.example.org';
    expect(isChatgptCallback(new URL(`${LOOPBACK}?code=c`), LOOPBACK, app)).toBe(true);
    expect(isChatgptCallback(new URL(`${app}/settings?tab=integrations&ai=chatgpt&code=c`), LOOPBACK, app)).toBe(true);
    expect(isChatgptCallback(new URL(`${app}/settings?code=c`), LOOPBACK, app)).toBe(false);
    expect(isChatgptCallback(new URL('https://evil.example/settings?ai=chatgpt'), LOOPBACK, app)).toBe(false);
    expect(isChatgptCallback(new URL(`${app}/settings?ai=chatgpt`), LOOPBACK, 'http://192.168.1.4')).toBe(false);
  });
});
