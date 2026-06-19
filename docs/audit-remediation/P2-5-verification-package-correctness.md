# [P2-5] — Verification Package Correctness, Tests & Adoption (kill the fake crypto)

| Field | Value |
|-------|-------|
| Priority | P2 |
| Severity | Medium |
| Effort | S (1–2 days) |
| Risk | Low — additive tests + a dependency wiring + one boolean-logic fix + a TS type fix |
| Depends on | — |
| Blocks | **P0-4** (the real receipt verifier must be correct and consumable before the engine/MCP rely on it) |
| Primary files | `packages/verification/src/receipt.ts`, `packages/verification/src/state-diff.ts`, `apps/mcp-server/package.json`, `apps/mcp-server/src/tools/verification.ts`, new `packages/verification/test/*` |

---

## 1. Problem & impact

`packages/verification` contains a **real** SHA-256 Merkle implementation (`@noble/hashes`), but it has three defects that make it both wrong and useless in practice:

1. **Reports unverifiable receipts as valid.** `verifyReceipt` returns `{ valid: true }` when a receipt has a proof but **no anchor to check it against** (`receipt.ts:149-158`). "We can't verify this" is reported as "this is valid." The MCP server has the **same anti-pattern** (`verification.ts:276-277, 314`): with no expected root it sets `localProofValid = true`.
2. **Zero tests.** No test files exist anywhere under `packages/verification`. The crypto has never been pinned to a known-good vector, so a regression (e.g. wrong hash order) would pass silently.
3. **Zero consumers + a fake crypto twin.** Nothing imports `@accumulate-studio/verification`. Meanwhile the MCP server reimplements Merkle with a **fake** hash — `simpleHash` (`verification.ts:627-636`), a 32-bit DJB hash zero-padded to 64 hex chars, falsely commented as a SHA-256 stand-in. So the repo simultaneously ships dead real crypto and live fake crypto.
4. **`state-diff.ts` fails `tsc`.** `state-diff.ts:321` passes `entry.after` (typed `unknown` via `StateDiffEntry`) into `setPath(...: JsonValue)`, producing `error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'JsonValue'` (confirmed by running `tsc --noEmit` in the package). A package that doesn't typecheck can't be safely depended on.

**Impact:** The one component that could make Studio's verification claims true is broken in subtle ways and unused, while a fake hash powers the MCP "verify" tool. P0-4 cannot land on a trustworthy foundation until this is fixed.

---

## 2. Evidence (current code)

**"No anchor → valid: true"** — `packages/verification/src/receipt.ts:148-158`:
```typescript
  // Verify the Merkle proof if we have an anchor
  if (!receipt.anchorChain?.anchor) {
    // No anchor to verify against, but proof structure is valid
    return {
      valid: true,                     // <-- WRONG: unverifiable is reported as valid
      details: {
        proofValid: true,
        anchorValid: false,
      },
    };
  }
```

**Same anti-pattern in MCP** — `apps/mcp-server/src/tools/verification.ts:274-277, 313-314`:
```typescript
        } else {
          // Without expected root, we can only verify structure
          localProofValid = true;        // <-- "valid" with nothing to compare against
          details.push('Local proof structure is valid (no expected root to compare)');
        }
...
    const valid = localProofValid && (anchorProofValid || !receipt.anchorChain);  // valid even w/o anchor
```

**The fake hash masquerading as SHA-256** — `apps/mcp-server/src/tools/verification.ts:600-636`:
```typescript
function computeMerkleRoot(leafHash: string, proof: MerkleProofEntry[]): string {
  let current = leafHash.toLowerCase();
  for (const entry of proof) {
    const sibling = entry.hash.toLowerCase();
    if (entry.right) current = simpleHash(current + sibling);
    else current = simpleHash(sibling + current);
  }
  return current;
}
function simpleHash(input: string): string {
  // This is a placeholder - real implementation would use crypto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(64, '0');   // <-- 32-bit value padded to look like SHA-256
}
```

**MCP doesn't even depend on the real package** — `apps/mcp-server/package.json:23-26`:
```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@accumulate-studio/types": "*"
  },
```
(no `@accumulate-studio/verification`).

**tsc failure** — running `npx tsc --noEmit` in `packages/verification`:
```
src/state-diff.ts(321,29): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'JsonValue'.
```
Source — `state-diff.ts:314-322`:
```typescript
export function applyDiff(state: JsonObject, diff: StateDiffEntry[]): JsonObject {
  for (const entry of diff) {
    const parts = parsePath(entry.path);
    if (entry.type === 'removed') {
      deletePath(state, parts);
    } else {
      setPath(state, parts, entry.after);     // <-- entry.after is `unknown` (StateDiffEntry.after?: unknown)
    }
  }
  return state;
}
```
`StateDiffEntry.after` is `unknown` by definition — `packages/types/src/network.ts:157-162`:
```typescript
export interface StateDiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}
```

---

## 3. Root cause

The package was written as a self-contained library and never adopted: the "no anchor → valid" branch was a convenience that quietly inverted the meaning of `valid`; tests were never added; and the MCP tool shipped a placeholder hash that was never swapped for the real one. The `state-diff` type error is a straightforward `unknown` vs `JsonValue` mismatch that went unnoticed because the package is never built in CI as a dependency of anything.

---

## 4. Target behavior & acceptance criteria

- [ ] `verifyReceipt` returns a **non-valid** result when a receipt has a proof but no anchor: `valid: false` with a clear indeterminate reason (e.g. `error: 'No anchor available — receipt cannot be cryptographically verified yet'`). It must **never** return `valid: true` without comparing a recomputed root to an anchor.
- [ ] `packages/verification` passes `tsc --noEmit` with **zero errors** (`state-diff.ts:321` fixed).
- [ ] `@accumulate-studio/verification` is a declared dependency of `apps/mcp-server`, and `verification.ts` uses the real `computeRoot`/`verifyProof`/`sha256Hash` exports. `simpleHash` and the local `computeMerkleRoot` are **deleted**.
- [ ] The MCP `proof.verify_receipt` no longer reports `localProofValid: true` when there is nothing to compare against; it reports indeterminate.
- [ ] A unit-test suite exists with at least one **known-good Accumulate testnet Merkle vector** that passes, plus negative vectors (tampered hash / flipped side / missing anchor) that fail. `npm test` (or `vitest`) runs green.
- [ ] No remaining reference to `simpleHash` anywhere in the repo (`grep -rn simpleHash apps packages` returns nothing in TS source).

---

## 5. Implementation steps

### Step 1 — Fix "no anchor → valid" (`packages/verification/src/receipt.ts:148-158`)

Before:
```typescript
  // Verify the Merkle proof if we have an anchor
  if (!receipt.anchorChain?.anchor) {
    // No anchor to verify against, but proof structure is valid
    return {
      valid: true,
      details: {
        proofValid: true,
        anchorValid: false,
      },
    };
  }
```
After:
```typescript
  // Without an anchor we have nothing to compare the recomputed root against,
  // so the receipt is INDETERMINATE — explicitly not valid.
  if (!receipt.anchorChain?.anchor) {
    return {
      valid: false,
      error: 'No anchor available — receipt cannot be cryptographically verified yet',
      details: {
        proofValid: false,   // we did not (could not) prove anything
        anchorValid: false,
      },
    };
  }
```

> `ReceiptVerificationResult` already supports `error` and `details` (`receipt.ts:13-21`). No type change needed. `parseAndVerifyReceipt` (`receipt.ts:192-199`) will now set `verified: false` for unanchored receipts — which is exactly the behavior P0-4's engine wants (it maps that to `pending-anchor`).

### Step 2 — Fix the tsc error (`packages/verification/src/state-diff.ts:314-322`)

`entry.after` is `unknown`; `setPath` wants `JsonValue`. Narrow it. Minimal, correct fix:

Before (`:321`):
```typescript
      setPath(state, parts, entry.after);
```
After:
```typescript
      setPath(state, parts, entry.after as JsonValue);
```
`JsonValue` is already declared in this file (`state-diff.ts:12`). The cast is sound here: `applyDiff` is only ever fed diffs produced by `computeStateDiff`, whose `after` values originate from `JsonValue`-typed traversal. If a stricter fix is preferred, add a runtime guard:
```typescript
    } else {
      setPath(state, parts, (entry.after ?? null) as JsonValue);
    }
```
Either compiles; the first is the documented choice.

> After this, run `cd packages/verification && npx tsc --noEmit` and confirm **0 errors**.

### Step 3 — Make MCP depend on the real package (`apps/mcp-server/package.json:23-26`)

Before:
```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@accumulate-studio/types": "*"
  },
```
After:
```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@accumulate-studio/types": "*",
    "@accumulate-studio/verification": "*"
  },
```
Then run the workspace install (e.g. `pnpm install` / `npm install` at repo root) so the workspace symlink is created, and build `packages/verification` first (it emits `dist/`). Confirm `apps/mcp-server` can resolve the import (`tsc --noEmit` in mcp-server).

### Step 4 — Replace the fake crypto in `verification.ts`

Add the real import at the top of `apps/mcp-server/src/tools/verification.ts` (after the existing imports, ~line 25):
```typescript
import { computeRoot, verifyProof } from '@accumulate-studio/verification';
```

**Delete** `computeMerkleRoot` and `simpleHash` entirely (`verification.ts:600-636`).

**Rewire `proofVerifyReceipt`** to use the real verifier and stop reporting indeterminate as valid. Before (`verification.ts:261-314`):
```typescript
    // Step 1: Verify local proof (Merkle path)
    if (receipt.proof && receipt.proof.length > 0) {
      try {
        const computedRoot = computeMerkleRoot(receipt.txHash, receipt.proof);
        details.push(`Computed Merkle root: ${computedRoot}`);
        if (expectedRoot) {
          localProofValid = computedRoot.toLowerCase() === expectedRoot.toLowerCase();
          details.push(localProofValid ? 'Local proof matches expected root' : `Local proof mismatch: expected ${expectedRoot}`);
        } else {
          // Without expected root, we can only verify structure
          localProofValid = true;
          details.push('Local proof structure is valid (no expected root to compare)');
        }
      } catch (error) {
        details.push(`Local proof verification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      details.push('No local proof entries in receipt');
    }
    ...
    // Overall validity
    const valid = localProofValid && (anchorProofValid || !receipt.anchorChain);
```
After:
```typescript
    // Step 1: Verify local proof (Merkle path) with REAL SHA-256.
    // The anchor to compare against is the receipt's own anchor, or an
    // explicitly-supplied expectedRoot.
    const compareRoot = expectedRoot ?? receipt.anchorChain?.anchor;
    if (receipt.proof && receipt.proof.length > 0) {
      try {
        const computedRoot = computeRoot(receipt.proof, receipt.txHash);
        details.push(`Computed Merkle root (SHA-256): ${computedRoot}`);
        if (compareRoot) {
          localProofValid = verifyProof(receipt.proof, receipt.txHash, compareRoot);
          details.push(localProofValid
            ? 'Local proof matches anchor/expected root'
            : `Local proof MISMATCH: computed ${computedRoot} != ${compareRoot}`);
        } else {
          // Nothing to compare against — INDETERMINATE, not valid.
          localProofValid = false;
          details.push('Indeterminate: no anchor or expectedRoot to compare the computed root against');
        }
      } catch (error) {
        localProofValid = false;
        details.push(`Local proof verification failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      details.push('No local proof entries in receipt');
    }
    ...
    // Overall validity: only valid if the recomputed root actually matched something.
    const valid = localProofValid;
```

> Note the **argument order**: the real `computeRoot(entries, txHash)` and `verifyProof(entries, txHash, expectedRoot)` take entries first (`merkle.ts:100,127`) — the opposite of the deleted `computeMerkleRoot(leafHash, proof)`. Get this right or every verification flips.

### Step 5 — Add a test suite with real vectors

`packages/verification` has no test runner. Add `vitest` (lightweight, ESM-native, matches the `"type":"module"` package). Update `packages/verification/package.json`:
```json
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.6.0"
  }
```

Create `packages/verification/test/merkle.test.ts`. Structure (fill `KNOWN_*` from a real anchored testnet receipt captured via the P0-4 proxy probe — `curl /api/query-tx` on an anchored txid, copy `txHash`, `proof[]`, and `anchor`):
```typescript
import { describe, it, expect } from 'vitest';
import { computeRoot, verifyProof, sha256Hash } from '../src/merkle';
import { verifyReceipt, parseReceipt } from '../src/receipt';
import type { MerkleProofEntry } from '@accumulate-studio/types';

// --- Sanity: pin SHA-256 itself against a published vector ---
describe('sha256Hash', () => {
  it('hashes the empty input to the known SHA-256 of empty bytes', () => {
    // sha256("" as UTF-8) = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(sha256Hash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

// --- Known-good Accumulate testnet vector (CAPTURE & PASTE REAL VALUES) ---
const KNOWN_TX_HASH = '<paste txHash hex, no 0x>';
const KNOWN_PROOF: MerkleProofEntry[] = [
  // { hash: '<sibling hex>', right: true|false }, ... in receipt order (leaf -> root)
];
const KNOWN_ANCHOR = '<paste anchor/merkle root hex>';

describe('computeRoot / verifyProof (real vector)', () => {
  it('recomputes the anchor from the known proof', () => {
    expect(computeRoot(KNOWN_PROOF, KNOWN_TX_HASH).toLowerCase()).toBe(KNOWN_ANCHOR.toLowerCase());
  });
  it('verifyProof passes for the good vector', () => {
    expect(verifyProof(KNOWN_PROOF, KNOWN_TX_HASH, KNOWN_ANCHOR)).toBe(true);
  });

  // Negative vectors
  it('fails when the leaf hash is tampered (1 byte)', () => {
    const bad = (KNOWN_TX_HASH.slice(0, -1) + (KNOWN_TX_HASH.endsWith('0') ? '1' : '0'));
    expect(verifyProof(KNOWN_PROOF, bad, KNOWN_ANCHOR)).toBe(false);
  });
  it('fails when a proof sibling is tampered', () => {
    const tampered = KNOWN_PROOF.map((e, i) =>
      i === 0 ? { ...e, hash: (e.hash.slice(0, -1) + (e.hash.endsWith('0') ? '1' : '0')) } : e);
    expect(verifyProof(tampered, KNOWN_TX_HASH, KNOWN_ANCHOR)).toBe(false);
  });
  it('fails when a sibling side flag is flipped', () => {
    if (KNOWN_PROOF.length === 0) return;
    const flipped = KNOWN_PROOF.map((e, i) => (i === 0 ? { ...e, right: !e.right } : e));
    // Flipping order generally changes the root (unless the sibling equals the node — vanishingly unlikely).
    expect(verifyProof(flipped, KNOWN_TX_HASH, KNOWN_ANCHOR)).toBe(false);
  });
});

describe('verifyReceipt indeterminate handling', () => {
  it('reports NOT valid when proof present but anchor absent', () => {
    const r = parseReceipt({ txHash: KNOWN_TX_HASH, localBlock: 1, proof: KNOWN_PROOF });
    const result = verifyReceipt(r);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/anchor/i);
  });
  it('reports NOT valid for an empty proof', () => {
    const r = parseReceipt({ txHash: KNOWN_TX_HASH, localBlock: 1, proof: [] });
    expect(verifyReceipt(r).valid).toBe(false);
  });
});
```

> If a real testnet vector cannot be captured immediately, generate a **synthetic but mathematically valid** vector by building a small tree with the package's own primitives and asserting round-trip (compute → verify) plus the negative mutations. This still pins the SHA-256 ordering logic. Replace with a real network vector as soon as P0-4's proxy probe yields one (note in the test file which it is).

---

## 6. Tests

**Unit (this ticket adds them):**
- [ ] `sha256Hash('')` equals the canonical empty-string SHA-256 digest (pins the hash primitive).
- [ ] `computeRoot(KNOWN_PROOF, KNOWN_TX_HASH) === KNOWN_ANCHOR` (good vector).
- [ ] `verifyProof` true on good vector; false on tampered leaf, tampered sibling, flipped side.
- [ ] `verifyReceipt` returns `valid:false` for proof-without-anchor and for empty proof.

**Typecheck:**
- [ ] `cd packages/verification && npx tsc --noEmit` ⇒ 0 errors.
- [ ] `cd apps/mcp-server && npx tsc --noEmit` ⇒ 0 errors (resolves the new dependency + real imports).

**Integration (MCP tool):**
- [ ] `proof.verify_receipt` with a good receipt+anchor ⇒ `verification.valid === true`, details include "Computed Merkle root (SHA-256)".
- [ ] `proof.verify_receipt` with proof but no anchor/expectedRoot ⇒ `valid === false`, details mention "Indeterminate".
- [ ] `proof.verify_receipt` with a wrong `expectedRoot` ⇒ `valid === false`.

**Manual checklist:**
- [ ] `grep -rn "simpleHash" apps packages --include=*.ts` returns nothing.
- [ ] `grep -rn "@accumulate-studio/verification" apps/mcp-server` shows the import + the package.json dep.
- [ ] Build the whole workspace; mcp-server starts and `proof.verify_receipt` runs without a missing-module error.

---

## 7. Risks, rollback, out of scope

**Risks**
- **Behavior change for unanchored receipts:** anything that previously treated `valid:true` (no anchor) as success will now see `valid:false`. The only current consumer of that branch is the soon-to-land P0-4 engine, which explicitly maps it to `pending-anchor` — so this is the intended, coordinated change. Search for any other readers of `ReceiptVerificationResult.valid` before merging (currently none).
- **Argument-order regression:** the real `computeRoot(entries, txHash)` reverses the deleted helper's `(leafHash, proof)` order. A swap here silently breaks all verification — covered by the good-vector unit test.
- **Vector capture dependency:** the strongest test needs a real anchored testnet receipt. The synthetic-vector fallback keeps the suite meaningful until then.

**Rollback**
- Revert the four source edits and the package.json changes. The added test file is inert if reverted. Because the fake `simpleHash` produced cryptographically meaningless output, there is no "old correct behavior" to preserve.

**Out of scope**
- Wiring `@accumulate-studio/verification` into the **Studio** app and the execution engine (that is **P0-4**, which depends on this ticket).
- Anchor-to-DN back-reference validation.
- `state-diff` semantic correctness beyond the type fix (it is already used elsewhere; only the `tsc` blocker is in scope here).
