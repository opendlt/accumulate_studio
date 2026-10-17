/**
 * RIPEMD-160: the published test vectors, and Node's own implementation as the oracle.
 */
import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { ripemd160 } from './ripemd160';
import { bytesToHex } from './node-executor';

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => bytesToHex(b);

describe('ripemd160', () => {
  // Test vectors from the RIPEMD-160 specification (Dobbertin, Bosselaers, Preneel)
  it.each([
    ['', '9c1185a5c5e9fc54612808977ee8f548b2258d31'],
    ['a', '0bdc9d2d256b3ee9daae347be6f4dc835a467ffe'],
    ['abc', '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc'],
    ['message digest', '5d0689ef49d2fae572b881b123a85ffa21595f36'],
    ['abcdefghijklmnopqrstuvwxyz', 'f71c27109c692c1b56bbdceb5b9d2865b3708dbc'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '12a053384a9c0c88e405a06c27dcf49ada62eb2b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'b0e20b6e3116640286ed3a87a5713079b21f5189'],
    ['1234567890'.repeat(8), '9b752e45573d4b39f4dbd3323cab82bf63326bfb'],
  ])('matches the specification vector for %j', (input, expected) => {
    expect(hex(ripemd160(enc(input)))).toBe(expected);
  });

  it('hashes a million "a" (the long vector, many blocks)', () => {
    expect(hex(ripemd160(enc('a'.repeat(1_000_000))))).toBe('52783243c1697bdbe16d37f97f68f08325dc1528');
  });

  it('agrees with Node on every length around the block and padding boundaries', () => {
    for (let n = 0; n <= 200; n++) {
      const data = randomBytes(n);
      expect(hex(ripemd160(data)), `length ${n}`).toBe(createHash('ripemd160').update(data).digest('hex'));
    }
  });

  it('agrees with Node on random inputs of random size', () => {
    for (let i = 0; i < 50; i++) {
      const data = randomBytes(Math.floor(Math.random() * 5000));
      expect(hex(ripemd160(data))).toBe(createHash('ripemd160').update(data).digest('hex'));
    }
  });

  it('HASH160 = RIPEMD160(SHA256(x)): the Bitcoin hash of the empty string and of "abc"', () => {
    const hash160 = (b: Uint8Array) => ripemd160(new Uint8Array(createHash('sha256').update(b).digest()));
    expect(hex(hash160(new Uint8Array()))).toBe('b472a266d0bd89c13706a4132ccfb16f7c3b9fcb');
    expect(hex(hash160(enc('abc')))).toBe(createHash('ripemd160').update(createHash('sha256').update('abc').digest()).digest('hex'));
  });

  it('returns 20 bytes and does not modify its input', () => {
    const data = enc('keep me');
    const copy = new Uint8Array(data);
    expect(ripemd160(data)).toHaveLength(20);
    expect(data).toEqual(copy);
  });
});
