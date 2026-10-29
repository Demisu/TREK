/**
 * How this build of TREK registers with the TREK services.
 *
 * Each stable release replaces this file with the one the issuer writes for
 * its version, in the version bump commit (.github/workflows/docker.yml); its
 * layout is then the generator's, so Prettier leaves it alone. Until the first
 * such release it speaks the original registration, which the issuer accepts
 * for a transition period. Renewing a key never goes through this file: an
 * installation keeps its key whatever release it runs. After a stable release,
 * merge main into dev so that dev builds register with the current dialect.
 */
import type { DialectSelfCheck, RegistrationDialect } from './registration-dialect.types';

const DIALECT = '0';
const SALT = Buffer.from('trek-pow-v1', 'utf8');

export const registrationDialect: RegistrationDialect = {
  id: DIALECT,
  releasedFor: 'dev',
  createdAt: '2026-10-29',
  challengePath: '/v1/register/challenge',
  registerPath: '/v1/register',
  begin({ challenge, version }) {
    return {
      work(nonce) {
        return { password: Buffer.from(`${challenge.c}.${nonce}`, 'utf8'), salt: SALT };
      },
      request(nonce) {
        return { body: { c: challenge.c, nonce: String(nonce), v: version }, headers: {} };
      },
    };
  },
};

/** Fixed inputs and what this module must make of them; TREK's tests and release job run it. */
export const SELF_CHECK: DialectSelfCheck = {
  challenge: { c: 'v1.selfcheck.0', alg: 'scrypt', N: 16, r: 1, p: 1, bits: 0, expires_at: 1 },
  version: 'dev',
  random: '000102030405060708090a0b0c0d0e0f',
  nowSeconds: 1800000000,
  nonce: 41,
  inputSha256: '6da395852966856653d9efba4dd3230e31f0fa325558474c91ae719247cc20ac',
  saltSha256: '9a4f2641b36f212d95eeceb212ce3587672322074288da20da4822809816aa7b',
  scrypt: 'f3de9aab4d5d9e114d63ba51bb0c8f007a644c1e24ef7b8e4062d49e9eed5376',
  requestSha256: '840dd80c265fba34a73ff4927eaa8416aa344d32372bf4d85273bf5ce130af99',
};
