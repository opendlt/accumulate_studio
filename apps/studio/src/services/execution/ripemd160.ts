/**
 * RIPEMD-160 for the browser: Studio's HASH160 lock is RIPEMD160(SHA256(preimage)), and
 * `crypto.subtle` has no RIPEMD. Pure TypeScript, no Buffer (it crashes in the browser), no dependency.
 * Checked against the published test vectors and against Node's own implementation in the tests.
 */

// Message word order and rotation amounts for the left and the right line (RIPEMD-160 specification)
const R1 = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
];
const R2 = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
];
const S1 = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
];
const S2 = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
];
const K1 = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const K2 = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

const rol = (x: number, n: number): number => ((x << n) | (x >>> (32 - n))) >>> 0;

/** The five round functions; the right line runs them in reverse order. */
function f(round: number, x: number, y: number, z: number): number {
  switch (round) {
    case 0: return (x ^ y ^ z) >>> 0;
    case 1: return ((x & y) | (~x & z)) >>> 0;
    case 2: return ((x | ~y) ^ z) >>> 0;
    case 3: return ((x & z) | (y & ~z)) >>> 0;
    default: return (x ^ (y | ~z)) >>> 0;
  }
}

export function ripemd160(message: Uint8Array): Uint8Array<ArrayBuffer> {
  // Pad: 0x80, zeros to 56 mod 64, then the bit length as 64-bit little endian
  const padded = new Uint8Array((((message.length + 8) >> 6) + 1) << 6);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (message.length << 3) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(message.length / 0x20000000), true);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const x = new Array<number>(16);

  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) x[i] = view.getUint32(block + i * 4, true);

    let a1 = h[0], b1 = h[1], c1 = h[2], d1 = h[3], e1 = h[4];
    let a2 = h[0], b2 = h[1], c2 = h[2], d2 = h[3], e2 = h[4];

    for (let j = 0; j < 80; j++) {
      const round = Math.floor(j / 16);
      let t = (rol((a1 + f(round, b1, c1, d1) + x[R1[j]] + K1[round]) >>> 0, S1[j]) + e1) >>> 0;
      a1 = e1; e1 = d1; d1 = rol(c1, 10); c1 = b1; b1 = t;

      t = (rol((a2 + f(4 - round, b2, c2, d2) + x[R2[j]] + K2[round]) >>> 0, S2[j]) + e2) >>> 0;
      a2 = e2; e2 = d2; d2 = rol(c2, 10); c2 = b2; b2 = t;
    }

    const t = (h[1] + c1 + d2) >>> 0;
    h[1] = (h[2] + d1 + e2) >>> 0;
    h[2] = (h[3] + e1 + a2) >>> 0;
    h[3] = (h[4] + a1 + b2) >>> 0;
    h[4] = (h[0] + b1 + c2) >>> 0;
    h[0] = t;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 5; i++) outView.setUint32(i * 4, h[i], true);
  return out;
}
