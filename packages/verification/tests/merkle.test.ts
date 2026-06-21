/**
 * P2-5 — pins the SHA-256 primitive and the Merkle root/verify ordering so a
 * regression (wrong hash order, swapped sibling side) cannot pass silently.
 * The end-to-end receipt vectors live in receipt.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { sha256Hash, computeRoot, verifyProof, createLeafHash } from '../src/merkle';
import type { MerkleProofEntry } from '@accumulate-studio/types';

describe('sha256Hash (pins the hash primitive against a published vector)', () => {
  it('hashes the empty input to the canonical SHA-256 of empty bytes', () => {
    // sha256(<empty>) = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(sha256Hash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes a UTF-8 string ("hello") to its known SHA-256 digest', () => {
    expect(sha256Hash('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('produces a 64-hex-char (32-byte) digest, not a padded 32-bit value', () => {
    const h = sha256Hash('anything');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

// A small, mathematically valid synthetic vector built from the package's own
// SHA-256 leaf hashing — round-trips compute -> verify, and is order-sensitive.
const leaf = createLeafHash('p2-5-merkle-vector');
const proof: MerkleProofEntry[] = [
  { hash: '11'.repeat(32), right: true },
  { hash: '22'.repeat(32), right: false },
  { hash: '33'.repeat(32), right: true },
];
const anchor = computeRoot(proof, leaf);

describe('computeRoot / verifyProof (synthetic vector)', () => {
  it('verifyProof passes for the recomputed anchor', () => {
    expect(verifyProof(proof, leaf, anchor)).toBe(true);
  });

  it('fails when the leaf is tampered', () => {
    const bad = '00' + leaf.slice(2);
    expect(verifyProof(proof, bad, anchor)).toBe(false);
  });

  it('fails when a sibling side flag is flipped (order sensitivity)', () => {
    const flipped = proof.map((e, i) => (i === 0 ? { ...e, right: !e.right } : e));
    expect(verifyProof(flipped, leaf, anchor)).toBe(false);
  });
});
