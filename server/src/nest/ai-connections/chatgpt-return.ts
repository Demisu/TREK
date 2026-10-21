/**
 * Sign in with ChatGPT that comes back to TREK by itself. OpenAI sends a
 * sign-in only to an address registered with the client id; an install has
 * its own address, so TREK registers one small page (the relay, a static page
 * of the TREK project) that forwards the browser to the install named in the
 * sign-in's `state`. The relay sees the code but cannot use it: redeeming it
 * takes the PKCE verifier only the install that started the sign-in holds.
 *
 * Until the project's client id is registered, or for an install without an
 * https address, the sign-in ends on the loopback page and the user pastes
 * its address, as before.
 */

/** The client id the TREK project registered with OpenAI for the relay; null until it is. */
export const PROJECT_CHATGPT_CLIENT_ID: string | null = null;

/** The relay page, registered with that client id as its one redirect address. */
export const CHATGPT_RELAY_URL = 'https://liketrek.github.io/chatgpt-callback/';

/** Where a sign-in through the relay lands in the install: the settings, which finish it. */
const RETURN_PATH = '/settings';
const RETURN_QUERY = '?tab=integrations&ai=chatgpt';

/** The address the relay sends the browser back to, or null where the install cannot take it. */
export function chatgptReturnUrl(appUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}${RETURN_PATH}${RETURN_QUERY}`;
}

/** The relay to sign in through, or null to keep the pasted address. */
export function chatgptRelay(appUrl: string): { clientId: string; redirectUri: string; returnUrl: string } | null {
  const returnUrl = chatgptReturnUrl(appUrl);
  if (!PROJECT_CHATGPT_CLIENT_ID || !returnUrl) return null;
  return { clientId: PROJECT_CHATGPT_CLIENT_ID, redirectUri: CHATGPT_RELAY_URL, returnUrl };
}

/**
 * The `state` of a sign-in through the relay: the random check value, a dot,
 * and the address to come back to (base64url). The relay reads only the part
 * after the dot; the install compares the whole value with the one it kept.
 */
export function relayState(check: string, returnUrl: string): string {
  return `${check}.${Buffer.from(returnUrl, 'utf8').toString('base64url')}`;
}

/** Whether a pasted or returned address is one the sign-in can end on: the loopback page or this install's settings. */
export function isChatgptCallback(url: URL, loopback: string, appUrl: string): boolean {
  if (`${url.origin}${url.pathname}` === loopback) return true;
  const back = chatgptReturnUrl(appUrl);
  if (!back) return false;
  const expected = new URL(back);
  return (
    url.origin === expected.origin && url.pathname === expected.pathname && url.searchParams.get('ai') === 'chatgpt'
  );
}
