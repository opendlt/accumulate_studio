import { describe, it, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import type { MerkleProofEntry, TransactionReceipt } from '@accumulate-studio/types';
import { computeRoot, verifyProof } from '../src/merkle';
import { parseReceipt, verifyReceipt } from '../src/receipt';

// Independent SHA-256 Merkle-root computation (separate from merkle.ts), so the
// known-good vector is not circular. Mirrors Accumulate's convention:
// right=true  -> H(current || sibling); right=false -> H(sibling || current).
function manualRoot(leafHex: string, entries: MerkleProofEntry[]): string {
  let cur = hexToBytes(leafHex.toLowerCase());
  for (const e of entries) {
    const sib = hexToBytes(e.hash.toLowerCase());
    const combined = e.right
      ? new Uint8Array([...cur, ...sib])
      : new Uint8Array([...sib, ...cur]);
    cur = sha256(combined);
  }
  return bytesToHex(cur);
}

const leaf = 'aa'.repeat(32);
const entries: MerkleProofEntry[] = [
  { hash: 'bb'.repeat(32), right: true },
  { hash: 'cc'.repeat(32), right: false },
  { hash: 'dd'.repeat(32), right: true },
];
const goodAnchor = manualRoot(leaf, entries);

function receipt(over: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    txHash: leaf,
    localBlock: 1,
    localTimestamp: '2026-01-01T00:00:00Z',
    proof: entries,
    anchorChain: { start: '', end: '', anchor: goodAnchor },
    verified: false,
    ...over,
  };
}

describe('merkle computeRoot matches an independent implementation', () => {
  it('computeRoot equals the manual root', () => {
    expect(computeRoot(entries, leaf)).toBe(goodAnchor);
  });
  it('verifyProof is true for the good vector', () => {
    expect(verifyProof(entries, leaf, goodAnchor)).toBe(true);
  });
});

describe('verifyReceipt — falsifiable', () => {
  it('valid for a known-good receipt (root recomputed == anchor)', () => {
    expect(verifyReceipt(receipt()).valid).toBe(true);
  });

  it('FALSE when txHash (leaf) is mutated by one byte', () => {
    const tampered = 'ab' + 'aa'.repeat(31);
    expect(verifyReceipt(receipt({ txHash: tampered })).valid).toBe(false);
  });

  it('FALSE when a proof entry hash is mutated', () => {
    const bad = entries.map((e, i) => (i === 1 ? { ...e, hash: 'ce' + 'cc'.repeat(31) } : e));
    expect(verifyReceipt(receipt({ proof: bad })).valid).toBe(false);
  });

  it('FALSE when a proof entry right flag is flipped (order sensitivity)', () => {
    const bad = entries.map((e, i) => (i === 0 ? { ...e, right: !e.right } : e));
    expect(verifyReceipt(receipt({ proof: bad })).valid).toBe(false);
  });

  it('FALSE when the anchor is tampered', () => {
    const badAnchor = 'ff' + goodAnchor.slice(2);
    expect(verifyReceipt(receipt({ anchorChain: { start: '', end: '', anchor: badAnchor } })).valid).toBe(false);
  });

  it('FALSE with empty proof, with the no-proof error', () => {
    const r = verifyReceipt(receipt({ proof: [] }));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/no Merkle proof/i);
  });

  it('NOT valid when proof present but no anchor (P2-5 honesty fix)', () => {
    const r = verifyReceipt(receipt({ anchorChain: undefined }));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/not yet anchored/i);
  });
});

describe('parseReceipt — keeps the anchor even when start/end are empty', () => {
  it('preserves anchorChain.anchor when start/end are empty strings', () => {
    const parsed = parseReceipt({
      txHash: leaf,
      localBlock: 1,
      proof: entries,
      anchorChain: { start: '', end: '', anchor: goodAnchor },
    });
    expect(parsed.anchorChain?.anchor).toBe(goodAnchor);
    // And it verifies end-to-end through parse → verify.
    expect(verifyReceipt(parsed).valid).toBe(true);
  });

  it('drops anchorChain only when there is no anchor at all', () => {
    const parsed = parseReceipt({ txHash: leaf, localBlock: 1, proof: entries });
    expect(parsed.anchorChain).toBeUndefined();
    expect(verifyReceipt(parsed).valid).toBe(false);
  });
});
