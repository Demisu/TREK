#!/usr/bin/env node
// Checks a registration dialect the issuer handed out, before a release ships it.
//
// docker.yml asks the TREK services issuer for the dialect of the version it
// releases and commits the answer as
// server/src/nest/service-identity/registration-dialect.ts. That file then
// runs inside every TREK server, so it is held to what a dialect is: a few
// hashes over the inputs it is given, nothing else.
//
//   1. Statically, before anything of it runs: the size, the header comment,
//      imports from node:crypto, node:zlib and the types module only, none of
//      the names that reach the process, the network, the file system, timers
//      or code from strings, no computed property access and no backslash (so
//      no escape can spell a forbidden name), and the version and id it must
//      carry. The generated code needs none of these.
//   2. Then it is imported (Node strips the types) and run on the fixed inputs
//      in its SELF_CHECK: the password, the salt, scrypt over them and the
//      request must be what the issuer computed, and the request must pass
//      the rules the issuer client applies (issuer.client.ts holds the same).
//
// Usage:
//   node scripts/ci/check-registration-dialect.mjs <file.ts> <version>
//
// Prints what it found and exits 0 only when the dialect may ship. The release
// job runs it without any secret in its environment.
import { createHash, scryptSync } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_BYTES = 64 * 1024;
const MAX_LINES = 1000;
const TYPES_MODULE = './registration-dialect.types';
const RUNTIME_MODULES = new Set(['node:crypto', 'node:zlib']);
const IMPORT_LINE = /^import (type )?\{[\w\s,]+\} from '([^']+)';$/;

// Each of these reaches past the hashes: the process and its environment,
// modules, the network, timers, or a way to run a string as code.
const FORBIDDEN = [
  /\bprocess\b/,
  /\brequire\b/,
  /\bimport\s*\(/,
  /\bimport\s*\.\s*meta\b/,
  /\beval\b/,
  /\bFunction\b/,
  /\bglobalThis\b/,
  /\bglobal\b/,
  /\bmodule\s*\./,
  /\bexports\s*\./,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bWorker\b/,
  /\bWebAssembly\b/,
  /\bchild_process\b/,
  /node:(?!crypto'|zlib')/,
  /\bset(Timeout|Interval|Immediate)\b/,
  /\bqueueMicrotask\b/,
  /\bconstructor\b/,
  /\bprototype\b/,
  /\b__proto__\b/,
  /\bReflect\b/,
  /\bProxy\b/,
  /\bexport\s+default\b/,
];
// x[...] and x?.[...]; a type annotation's T[] is all the generated code holds.
const COMPUTED_ACCESS = /([\w$)\]]\s*|\?\.\s*)\[(?!\])/;

const CHALLENGE_PATH = /^\/v1\/register(\/[A-Za-z0-9_-]{12})?\/challenge$/;
const REGISTER_PATH = /^\/v1\/register(\/[A-Za-z0-9_-]{12})?$/;
const DIALECT_HEADER = /^X-TREK-[A-Za-z0-9-]{1,40}$/;
const RESERVED_HEADER = /^X-TREK-(Install|Tier|Legacy|Quota|Instance|Notice)(-|$)/i;
const HEADER_VALUE = /^[\x20-\x7e]{1,256}$/;
const MAX_REGISTRATION_BYTES = 2048;
const LARGEST_NONCE = 2 ** 40;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What is wrong with the source before it runs; empty when nothing is.
export function staticProblems(source, version) {
  const problems = [];
  if (Buffer.byteLength(source, 'utf8') > MAX_BYTES) problems.push(`it is larger than ${MAX_BYTES} bytes`);
  const lines = source.split('\n');
  if (lines.length > MAX_LINES) problems.push(`it is longer than ${MAX_LINES} lines`);
  if (!source.startsWith('/**\n')) problems.push('it does not start with its header comment');
  if (source.includes('\\')) problems.push('it holds a backslash');
  if (source.includes('\r')) problems.push('it holds a carriage return');
  for (const [index, line] of lines.entries()) {
    if (!/^\s*(import|export\s+\*|export\s*\{)/.test(line) && !/\bfrom\s+'/.test(line)) continue;
    const match = IMPORT_LINE.exec(line);
    const allowed = match && (match[1] ? match[2] === TYPES_MODULE : RUNTIME_MODULES.has(match[2]));
    if (!allowed) problems.push(`line ${index + 1} imports or re-exports what a dialect does not: ${line.trim()}`);
  }
  for (const pattern of FORBIDDEN) {
    const line = lines.findIndex((text) => pattern.test(text));
    if (line >= 0) problems.push(`line ${line + 1} names what a dialect does not need (${pattern.source})`);
  }
  const computed = lines.findIndex((text) => COMPUTED_ACCESS.test(text));
  if (computed >= 0) problems.push(`line ${computed + 1} reads a property by a computed name`);
  if (!new RegExp(`^  releasedFor: '${escapeRegExp(version)}',$`, 'm').test(source)) {
    problems.push(`it is not written for ${version}`);
  }
  if (!/^const DIALECT = '[A-Za-z0-9_-]{12}';$/m.test(source)) problems.push('it does not name a dialect id');
  if (!/^export const registrationDialect: RegistrationDialect = \{$/m.test(source)) {
    problems.push('it does not export registrationDialect');
  }
  if (!/^export const SELF_CHECK: DialectSelfCheck = \{$/m.test(source)) problems.push('it does not export SELF_CHECK');
  return problems;
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function requestProblems(path, request) {
  const problems = [];
  if (!REGISTER_PATH.test(path)) problems.push(`it registers at ${path}`);
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (
      !DIALECT_HEADER.test(name) ||
      RESERVED_HEADER.test(name) ||
      typeof value !== 'string' ||
      !HEADER_VALUE.test(value)
    ) {
      problems.push(`it sends the header ${name}, which TREK does not send`);
    }
  }
  const body = JSON.stringify(request.body);
  if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > MAX_REGISTRATION_BYTES) {
    problems.push('its body is no registration');
  }
  return problems;
}

// What is wrong with the imported module; empty when nothing is.
export function runtimeProblems(mod, version) {
  const dialect = mod.registrationDialect;
  const check = mod.SELF_CHECK;
  if (!dialect || !check) return ['it exports no registrationDialect or no SELF_CHECK'];
  const problems = [];
  if (dialect.releasedFor !== version) problems.push(`it is released for ${dialect.releasedFor}, not ${version}`);
  if (!/^[A-Za-z0-9_-]{12}$/.test(dialect.id)) problems.push(`its id ${dialect.id} is not an issuer's`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dialect.createdAt) || Number.isNaN(Date.parse(dialect.createdAt))) {
    problems.push(`its date ${dialect.createdAt} is no date`);
  }
  if (!CHALLENGE_PATH.test(dialect.challengePath) || dialect.challengePath !== `/v1/register/${dialect.id}/challenge`) {
    problems.push(`it asks for a challenge at ${dialect.challengePath}`);
  }
  if (dialect.registerPath !== `/v1/register/${dialect.id}`) problems.push(`it registers at ${dialect.registerPath}`);

  const inputs = {
    challenge: check.challenge,
    version: check.version,
    random: Buffer.from(check.random, 'hex'),
    nowSeconds: check.nowSeconds,
  };
  const attempt = dialect.begin(inputs);
  const { password, salt } = attempt.work(check.nonce);
  if (sha256(password) !== check.passwordSha256) problems.push('its password is not the one the issuer computed');
  if (sha256(salt) !== check.saltSha256) problems.push('its salt is not the one the issuer computed');
  const { N, r, p } = check.challenge;
  if (scryptSync(password, salt, 32, { N, r, p }).toString('hex') !== check.scrypt) {
    problems.push('its proof of work is not the one the issuer computed');
  }
  const request = attempt.request(check.nonce);
  if (sha256(JSON.stringify({ body: request.body, headers: request.headers })) !== check.requestSha256) {
    problems.push('its request is not the one the issuer computed');
  }
  problems.push(...requestProblems(dialect.registerPath, request));
  problems.push(...requestProblems(dialect.registerPath, attempt.request(LARGEST_NONCE)));
  return [...new Set(problems)];
}

// Runs a checked source: Node strips the types of an .mts file and imports it.
async function importDialect(file) {
  const dir = mkdtempSync(join(tmpdir(), 'registration-dialect-'));
  try {
    const copy = join(dir, 'registration-dialect.mts');
    copyFileSync(file, copy);
    return await import(pathToFileURL(copy).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function checkDialect(file, version) {
  const source = readFileSync(file, 'utf8');
  const found = staticProblems(source, version);
  if (found.length > 0) return found;
  try {
    return runtimeProblems(await importDialect(file), version);
  } catch (err) {
    return [`it fails when run: ${err instanceof Error ? err.message : err}`];
  }
}

async function main() {
  const [file, version] = process.argv.slice(2);
  if (!file || !version) throw new Error('usage: check-registration-dialect.mjs <file.ts> <version>');
  const problems = await checkDialect(file, version);
  for (const problem of problems) console.log(`The dialect for ${version} is refused: ${problem}.`);
  if (problems.length > 0) process.exit(1);
  console.log(`The dialect for ${version} computes what the issuer computed.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`::error::${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
