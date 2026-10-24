/**
 * The OAuth half of the MCP lock on a demo instance: the shared demo account
 * cannot register, rotate or delete an OAuth client, end a connected app, or
 * approve an app's request for access. Turning a request down stays possible.
 * Every refusal comes before the service is asked, so nothing is written.
 */
import { DEMO_ACCOUNT_REFUSAL } from '../../../src/nest/common/demo-write';
import { RateLimitService } from '../../../src/nest/common/rate-limit.service';
import { OauthApiController } from '../../../src/nest/oauth/oauth-api.controller';
import type { OauthService } from '../../../src/nest/oauth/oauth.service';
import type { User } from '../../../src/types';
import { HttpException } from '@nestjs/common';

import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/nest/audit/client-ip', () => ({ getClientIp: vi.fn(() => '1.2.3.4') }));

const demo = { id: 1, role: 'user', email: 'demo@trek.app' } as User;
const other = { id: 2, role: 'user', email: 'alice@example.test' } as User;
const req = { ip: '1.2.3.4', headers: {} } as unknown as Request;

function service() {
  return {
    mcpEnabled: vi.fn().mockResolvedValue(true),
    validateAuthorizeRequest: vi.fn().mockResolvedValue({ valid: true, scopes: ['trips:read'], resource: null }),
    saveConsent: vi.fn(),
    createAuthCode: vi.fn().mockResolvedValue('the_code'),
    createOAuthClient: vi.fn().mockResolvedValue({ client_id: 'c1', client_secret: 's' }),
    rotateOAuthClientSecret: vi.fn().mockResolvedValue({ client_secret: 's2' }),
    deleteOAuthClient: vi.fn().mockResolvedValue({}),
    revokeSession: vi.fn().mockResolvedValue({}),
  };
}

let svc: ReturnType<typeof service>;
const controller = () => new OauthApiController(svc as unknown as OauthService, new RateLimitService());

async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: unknown }> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    const e = err as HttpException;
    return { status: e.getStatus(), body: e.getResponse() };
  }
  throw new Error('expected a refusal');
}

const consent = (approved: boolean) => ({
  client_id: 'c1',
  redirect_uri: 'https://app.example.test/cb',
  scope: 'trips:read',
  state: 'st',
  code_challenge: 'cc',
  code_challenge_method: 'S256' as const,
  approved,
});

const MCP_REFUSAL = { status: 403, body: { error: DEMO_ACCOUNT_REFUSAL.mcp } };

beforeEach(() => {
  vi.stubEnv('DEMO_MODE', 'true');
  svc = service();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OAuth routes for the demo account', () => {
  it('OAUTH-DEMO-001: registering, rotating and deleting a client are refused before the service runs', async () => {
    expect(await refusal(() => controller().createClient(demo, { name: 'CLI', allowed_scopes: ['a'] }, req))).toEqual(
      MCP_REFUSAL,
    );
    expect(await refusal(() => controller().rotateClient(demo, 'c1', req))).toEqual(MCP_REFUSAL);
    expect(await refusal(() => controller().deleteClient(demo, 'c1', req))).toEqual(MCP_REFUSAL);
    expect(svc.createOAuthClient).not.toHaveBeenCalled();
    expect(svc.rotateOAuthClientSecret).not.toHaveBeenCalled();
    expect(svc.deleteOAuthClient).not.toHaveBeenCalled();
  });

  it('OAUTH-DEMO-002: a connected app cannot be ended from the demo account', async () => {
    expect(await refusal(() => controller().revokeSession(demo, '7', req))).toEqual(MCP_REFUSAL);
    expect(svc.revokeSession).not.toHaveBeenCalled();
  });

  it('OAUTH-DEMO-003: approving an app is refused, turning it down still redirects', async () => {
    expect(await refusal(() => controller().authorize(demo, consent(true), req))).toEqual(MCP_REFUSAL);
    expect(svc.saveConsent).not.toHaveBeenCalled();
    expect(svc.createAuthCode).not.toHaveBeenCalled();

    const denied = await controller().authorize(demo, consent(false), req);
    expect((denied as { redirect: string }).redirect).toContain('error=access_denied');
  });

  it('OAUTH-DEMO-004: every other account of the demo instance keeps the routes', async () => {
    expect(await controller().createClient(other, { name: 'CLI', allowed_scopes: ['a'] }, req)).toEqual({
      client_id: 'c1',
      client_secret: 's',
    });
    const approved = await controller().authorize(other, consent(true), req);
    expect((approved as { redirect: string }).redirect).toContain('code=the_code');
  });

  it('OAUTH-DEMO-005: off a demo instance the demo address keeps them too', async () => {
    vi.stubEnv('DEMO_MODE', 'false');
    expect(await controller().deleteClient(demo, 'c1', req)).toEqual({ success: true });
  });
});
