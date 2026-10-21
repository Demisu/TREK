import type { AiConnectionKind, AssistantErrorCode } from '@trek/shared';

/** Where a ChatGPT user sees what is left of their plan. */
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';

/**
 * A provider refused or failed. `code` is what the client shows (one of the
 * assistant's error codes), `status` the provider's HTTP status (0 for a
 * network failure or a broken stream), `retryable` whether trying the same
 * request again later can help.
 */
export class AiProviderError extends Error {
  constructor(
    readonly code: AssistantErrorCode,
    readonly status: number,
    readonly retryable: boolean,
    readonly helpUrl?: string,
    readonly providerCode?: string,
  ) {
    super(providerCode ? `${code} (${providerCode})` : code);
    this.name = 'AiProviderError';
  }
}

// Sign in with ChatGPT's documented refusals (developers.openai.com/siwc, errors-and-recovery).
const USAGE_LIMIT_CODES = new Set([
  'subscription_sharing_usage_limit_exceeded',
  'subscription_sharing_workplace_individual_usage_limit_exceeded',
]);
const NOT_ELIGIBLE_CODES = new Set([
  'subscription_sharing_user_not_eligible',
  'subscription_sharing_route_not_supported',
  'subscription_sharing_unsupported_capability',
  'chatpass_v2_scope_not_authorized',
  'chatpass_v2_invalid_authorization_context',
]);
const UNAVAILABLE_CODES = new Set(['subscription_sharing_usage_unavailable', 'subscription_sharing_user_unavailable']);
// The overload and server-side failures the providers name inside a stream.
const OVERLOADED_CODES = new Set(['overloaded_error', 'api_error', 'server_error', 'service_unavailable']);

/**
 * The assistant's reading of a provider failure, from the HTTP status and the
 * provider's own error code where it sent one. A key that is refused is
 * `invalid_key`, except for a ChatGPT sign-in, where the same answer means the
 * sign-in has to be renewed.
 */
export function providerFailure(kind: AiConnectionKind, status: number, code?: string): AiProviderError {
  if (code && USAGE_LIMIT_CODES.has(code)) {
    return new AiProviderError('usage_limit', status, false, CHATGPT_USAGE_URL, code);
  }
  if (code && NOT_ELIGIBLE_CODES.has(code)) return new AiProviderError('not_eligible', status, false, undefined, code);
  if (code && (UNAVAILABLE_CODES.has(code) || OVERLOADED_CODES.has(code))) {
    return new AiProviderError('provider_unavailable', status, true, undefined, code);
  }
  if (status === 401 || status === 403) {
    // For a ChatGPT sign-in, 401 is the identity (sign in again) and 403 a policy block on the account.
    const chatgpt = status === 401 ? 'needs_reauth' : 'not_eligible';
    return new AiProviderError(kind === 'chatgpt' ? chatgpt : 'invalid_key', status, false, undefined, code);
  }
  if (status === 429) return new AiProviderError('rate_limited', status, true, undefined, code);
  if (status === 0 || status === 408 || status >= 500) {
    return new AiProviderError('provider_unavailable', status, true, undefined, code);
  }
  return new AiProviderError('generic', status, false, undefined, code);
}

/** The error code out of a provider's JSON error body, whichever of the usual places it sits in. */
export function errorCodeOf(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const inner = record.error;
  if (typeof inner === 'string') return inner;
  if (inner && typeof inner === 'object') {
    const err = inner as Record<string, unknown>;
    for (const key of ['code', 'type']) {
      if (typeof err[key] === 'string' && err[key]) return err[key];
    }
  }
  if (typeof record.code === 'string' && record.code) return record.code;
  const detail = record.detail;
  if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).code === 'string') {
    return (detail as Record<string, string>).code;
  }
  return undefined;
}
