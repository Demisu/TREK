/**
 * How TREK 9.9.9 registers with the TREK services.
 *
 * The issuer writes this file for each release and the release pipeline
 * commits it with the version bump. It is not edited by hand, and its layout
 * is the generator's, so Prettier leaves it alone. Renewing a key never goes
 * through it: an installation keeps its key whatever release it runs. After a
 * stable release, merge main into dev so that dev and prerelease builds
 * register with the current dialect.
 *
 * The dialect is the registration's, not SQL's; lint:dialect has nothing to
 * look for here.
 */
import type { DialectSelfCheck, RegistrationDialect } from './registration-dialect.types';

import { createHash, createHmac, hkdfSync, pbkdf2Sync } from 'node:crypto';
import { crc32 } from 'node:zlib';

const DIALECT = 'KitchenSink0';
const CONSTANT = Buffer.from('206ebd4ad98b5f9c3531195aa89f6285612c396a98999a127b7972b6eefe03a8', 'hex');

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function u32be(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value >>> 0);
  return out;
}

function u32le(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0);
  return out;
}

function u64be(value: number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
}

function u64le(value: number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function leb128(value: number): Buffer {
  const out: number[] = [];
  let rest = value;
  do {
    const low = rest % 128;
    rest = Math.floor(rest / 128);
    out.push(low | (Math.sign(rest) << 7));
  } while (rest > 0);
  return Buffer.from(out);
}

function lp32le(part: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32LE(part.length);
  return Buffer.concat([head, part]);
}

function base32(input: Buffer): string {
  const bits = [...input].map((byte) => byte.toString(2).padStart(8, '0')).join('');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32.charAt(parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2));
  }
  return out;
}

function reverseBlocks(input: Buffer, width: number): Buffer {
  const out = Buffer.from(input);
  for (let i = 0; i + width <= out.length; i += width) out.subarray(i, i + width).reverse();
  return out;
}

function permute(input: Buffer, order: number[]): Buffer {
  const out = Buffer.from(input);
  order.forEach((from, to) => out.writeUInt8(input.readUInt8(from), to));
  return out;
}

function fold(input: Buffer, size: number): Buffer {
  const out = Buffer.alloc(size);
  input.forEach((byte, i) => out.writeUInt8(out.readUInt8(i % size) ^ byte, i % size));
  return out;
}

function interleave(a: Buffer, b: Buffer): Buffer {
  const parts: Buffer[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) parts.push(a.subarray(i, i + 1), b.subarray(i, i + 1));
  return Buffer.concat(parts);
}

function mixWordsBe(input: Buffer, rotation: number, consts: Buffer): Buffer {
  const out = Buffer.from(input);
  let previous = 0;
  for (let i = 0; i + 4 <= out.length; i += 4) {
    const word = (out.readUInt32BE(i) + consts.readUInt32BE(i % consts.length)) >>> 0;
    previous = (((word << rotation) | (word >>> (32 - rotation))) ^ previous) >>> 0;
    out.writeUInt32BE(previous, i);
  }
  return out;
}

function mixWordsLe(input: Buffer, rotation: number, consts: Buffer): Buffer {
  const out = Buffer.from(input);
  let previous = 0;
  for (let i = 0; i + 4 <= out.length; i += 4) {
    const word = (out.readUInt32LE(i) + consts.readUInt32BE(i % consts.length)) >>> 0;
    previous = (((word << rotation) | (word >>> (32 - rotation))) ^ previous) >>> 0;
    out.writeUInt32LE(previous, i);
  }
  return out;
}

function keystream8be(input: Buffer, start: number): Buffer {
  const out = Buffer.from(input);
  for (let offset = 0; offset < out.length; offset += 32) {
    const counter = Buffer.from([(start + offset / 32) & 0xff]);
    const block = createHash('sha256').update(CONSTANT).update(counter).digest();
    for (let j = offset; j < Math.min(offset + 32, out.length); j++) {
      out.writeUInt8(out.readUInt8(j) ^ block.readUInt8(j - offset), j);
    }
  }
  return out;
}

function keystream16le(input: Buffer, start: number): Buffer {
  const out = Buffer.from(input);
  for (let offset = 0; offset < out.length; offset += 32) {
    const counter = Buffer.alloc(2);
    counter.writeUInt16LE((start + offset / 32) & 0xffff);
    const block = createHash('sha256').update(CONSTANT).update(counter).digest();
    for (let j = offset; j < Math.min(offset + 32, out.length); j++) {
      out.writeUInt8(out.readUInt8(j) ^ block.readUInt8(j - offset), j);
    }
  }
  return out;
}

function keystream32be(input: Buffer, start: number): Buffer {
  const out = Buffer.from(input);
  for (let offset = 0; offset < out.length; offset += 32) {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE((start + offset / 32) >>> 0);
    const block = createHash('sha256').update(CONSTANT).update(counter).digest();
    for (let j = offset; j < Math.min(offset + 32, out.length); j++) {
      out.writeUInt8(out.readUInt8(j) ^ block.readUInt8(j - offset), j);
    }
  }
  return out;
}

export const registrationDialect: RegistrationDialect = {
  id: DIALECT,
  releasedFor: '9.9.9',
  createdAt: '2026-01-01',
  challengePath: `/v1/register/${DIALECT}/challenge`,
  registerPath: `/v1/register/${DIALECT}`,
  begin({ challenge, version, random, nowSeconds }) {
    const c = Buffer.from(challenge.c, 'utf8');
    const v = Buffer.from(version, 'utf8');
    const hc = createHash('sha256').update(c).digest();
    const salt1 = Buffer.concat([
      CONSTANT.subarray(0, 8),
      Buffer.from([0x1f]),
      hc,
      Buffer.from([0x1f]),
      c.subarray(3, 19),
    ]);
    const salt2 = createHash('shake256', { outputLength: 24 }).update(salt1).digest();
    const salt3 = pbkdf2Sync(salt2, random, 3, 32, 'sha512');
    const salt4 = Buffer.from(hkdfSync('sha384', salt3, hc.subarray(0, 16), Buffer.from('a1b2c3d4e5', 'hex'), 40));
    const salt5 = createHmac('sha3-256', CONSTANT).update(salt4).digest();
    const salt6 = fold(salt5, 20);
    const salt7Words = Buffer.from('deadbeef0badf00d', 'hex');
    const salt7 = mixWordsBe(salt6, 5, salt7Words);
    const salt8 = Buffer.concat([random.subarray(2, 9), salt7]);
    const salt9 = Buffer.from(salt8.toString('base64url'), 'utf8');
    return {
      work(nonce) {
        const pass1 = Buffer.concat([
          lp32le(c),
          lp32le(leb128(nonce)),
          lp32le(v),
          lp32le(random),
          lp32le(u32le(nowSeconds)),
          lp32le(u64le(nonce)),
          lp32le(hc.subarray(3, 19)),
        ]);
        const pass2 = createHash('blake2b512').update(pass1).digest();
        const pass3Words = Buffer.from('9e3779b97f4a7c1501234567', 'hex');
        const pass3 = mixWordsLe(mixWordsLe(pass2, 7, pass3Words), 13, pass3Words);
        const pass4 = keystream16le(pass3, 5);
        const pass5 = Buffer.concat([pass4.subarray(9 % pass4.length), pass4.subarray(0, 9 % pass4.length)]);
        const pass6 = reverseBlocks(pass5, 4);
        const pass7 = permute(pass6, [3, 0, 15, 7, 1, 2, 4, 6, 5, 8, 9, 11, 10, 13, 12, 14]);
        const pass8 = Buffer.from(pass7.map((byte) => (byte * 37 + 11) & 0xff));
        const pass9 = interleave(pass8, CONSTANT);
        const pass10 = Buffer.concat([pass9, u32be(crc32(pass9))]);
        const pass11 = Buffer.from(pass10.toString('hex'), 'utf8');
        const pass12 = Buffer.concat([pass11, Buffer.from([0x3a]), v]);
        const pass13 = Buffer.from(base32(pass12), 'utf8');
        const pass14 = pass13.subarray(10, 58);
        return { password: pass14, salt: salt9 };
      },
      request(nonce) {
        const seal1 = Buffer.concat([
          v,
          Buffer.from(String(nonce), 'utf8'),
          Buffer.from(String(nowSeconds), 'utf8'),
          c,
          random,
          u64be(nonce),
          u32be(nowSeconds),
          Buffer.from(nonce.toString(16), 'utf8'),
        ]);
        const seal2 = createHmac('sha512', seal1).update(CONSTANT).digest();
        const seal3 = Buffer.from(seal2.toString('base64'), 'utf8');
        const seal4 = createHash('sha384').update(seal3).digest();
        const seal5 = Buffer.from(seal4.toString('hex').toUpperCase(), 'utf8');
        const seal6 = Buffer.from(seal5).reverse();
        const seal7 = keystream32be(seal6, 200);
        const seal8 = interleave(seal7, hc).subarray(0, seal7.length);
        const seal9 = Buffer.concat([seal8, u32le(crc32(seal8))]);
        const seal10 = keystream8be(seal9, 1);
        const seal11 = seal10.subarray(8, 40);
        return {
          body: {
            'ferry-passage': {
              'release-mark': version,
              tide: 'amber-41',
              'ticket-stamp': challenge.c,
              harbor: nonce.toString(16),
              'gull-wing': 'slate-7',
              lantern: base32(random),
              compass: nowSeconds,
            },
          },
          headers: { 'X-TREK-Ferry-Seal': seal11.toString('base64url') },
        };
      },
    };
  },
};

/** Fixed inputs and what this module must make of them; TREK's tests and release job run it. */
export const SELF_CHECK: DialectSelfCheck = {
  challenge: { c: 'v1.selfcheck.KitchenSink0', alg: 'scrypt', N: 16, r: 1, p: 1, bits: 0, expires_at: 1 },
  version: '9.9.9',
  random: '000102030405060708090a0b0c0d0e0f',
  nowSeconds: 1800000000,
  nonce: 41,
  passwordSha256: '7b2c79ba69f022e031c4db19ff0bdf1f67bed98498a73ed747f968d346bc3110',
  saltSha256: '552659da096a9c393d520721f1aa26e5d3716305f4a6167effb13b9e7660e737',
  scrypt: '611e71acba947b2fffb86a831d4f389c8f72f5182d7bde30d4bb1f5c3abac730',
  requestSha256: '3df6e9c6fb70e039a2cd072cb526e975c996e6e6618ded4c89e09f6a7440c4f4',
};
