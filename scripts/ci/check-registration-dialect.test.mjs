import { checkDialect, staticProblems } from './check-registration-dialect.mjs';

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// The issuer's sample: every building block a generated dialect can use, for version 9.9.9.
const SAMPLE = fileURLToPath(
  new URL('../../server/tests/fixtures/service-identity/registration-dialect.sample.ts', import.meta.url),
);
const source = readFileSync(SAMPLE, 'utf8');

const scratch = mkdtempSync(join(tmpdir(), 'registration-dialect-check-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let written = 0;
function variant(text) {
  written += 1;
  const file = join(scratch, `variant-${written}.ts`);
  writeFileSync(file, text);
  return file;
}

function replaced(from, to) {
  assert.ok(source.includes(from), `the sample no longer holds ${from}`);
  return source.replace(from, to);
}

describe('check-registration-dialect', () => {
  it('passes the issuer sample for its own version', async () => {
    assert.deepEqual(await checkDialect(SAMPLE, '9.9.9'), []);
  });

  it('refuses a dialect written for another version', async () => {
    const problems = await checkDialect(SAMPLE, '9.9.10');
    assert.ok(problems.some((p) => p.includes('not written for 9.9.10')));
  });

  it('refuses an import from anywhere but node:crypto, node:zlib and the types', () => {
    const text = replaced(
      "import { crc32 } from 'node:zlib';",
      "import { crc32 } from 'node:zlib';\nimport { readFileSync } from 'node:fs';",
    );
    assert.ok(staticProblems(text, '9.9.9').some((p) => p.includes("from 'node:fs'")));
    const runtimeTypes = replaced('import type {', 'import {');
    assert.ok(staticProblems(runtimeTypes, '9.9.9').some((p) => p.includes('registration-dialect.types')));
  });

  it('refuses what reaches the process, the network or code from strings, before running any of it', async () => {
    for (const line of ['const env = process.env;', 'void fetch("https://example.org");', 'const run = eval;']) {
      const file = variant(replaced('const DIALECT =', `${line}\nconst DIALECT =`));
      const problems = await checkDialect(file, '9.9.9');
      assert.ok(
        problems.some((p) => p.includes('names what a dialect does not need')),
        line,
      );
    }
  });

  it('refuses a computed property name and any escape that could spell one', () => {
    const computed = replaced('const DIALECT =', "const name = BASE32['length'];\nconst DIALECT =");
    assert.ok(staticProblems(computed, '9.9.9').some((p) => p.includes('computed name')));
    const escaped = replaced('const DIALECT =', "const name = 'pro\\u0063ess';\nconst DIALECT =");
    assert.ok(staticProblems(escaped, '9.9.9').some((p) => p.includes('backslash')));
  });

  it('refuses a file without its header or without a dialect id', () => {
    assert.ok(staticProblems(source.slice(source.indexOf('import')), '9.9.9').some((p) => p.includes('header')));
    const noId = replaced("const DIALECT = 'KitchenSink0';", "const DIALECT = 'short';");
    assert.ok(staticProblems(noId, '9.9.9').some((p) => p.includes('dialect id')));
  });

  it('refuses a dialect that does not compute what its SELF_CHECK says', async () => {
    const file = variant(replaced("seal11.toString('base64url')", "seal11.toString('hex')"));
    const problems = await checkDialect(file, '9.9.9');
    assert.deepEqual(problems, ['its request is not the one the issuer computed']);
  });

  it('refuses a dialect whose request TREK would not send', async () => {
    const file = variant(replaced("'X-TREK-Ferry-Seal'", "'X-TREK-Install'"));
    const problems = await checkDialect(file, '9.9.9');
    assert.ok(problems.some((p) => p.includes('X-TREK-Install')));
  });
});
