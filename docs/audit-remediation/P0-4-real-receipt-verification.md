# [P0-4] — Real Merkle Receipt Verification (kill the "status rename" fake)

| Field | Value |
|-------|-------|
| Priority | P0 |
| Severity | Critical |
| Effort | M (3–5 days) |
| Risk | Medium — touches proxy, execution engine, assertion runner, and a user-facing "Verified" shield |
| Depends on | **P2-5** (verification package must be correct + published as a consumable dep before the engine imports it), **P1-5** (proxy must reliably return raw tx/receipt JSON) |
| Blocks | Any claim in the product/marketing/UI that receipts are "cryptographically verified" |
| Primary files | `apps/sdk-proxy/app/routes/query.py`, `apps/sdk-proxy/app/models.py`, `apps/studio/src/services/execution/index.ts`, `apps/studio/src/services/assertion-runner.ts`, `apps/studio/src/components/execution/ReceiptVerifier.tsx`, `packages/verification/src/{receipt,merkle}.ts` |

---

## 1. Problem & impact

Today the Studio UI shows a green **Shield / "Verified"** badge for every delivered transaction, and a `receipt.verified` assertion that "passes". **None of this involves any cryptography.** The chain of fakery:

1. `apps/sdk-proxy/app/routes/query.py:54` calls `client.v3.query(req.tx_hash)` with **no options** — so it never requests `prove: true` and never asks for a receipt. The response therefore has no Merkle proof.
2. `apps/studio/src/services/execution/index.ts:549-550` builds a receipt with `proof: statusObj?.proof || []` (always `[]` because of #1) and `verified: isDelivered` — i.e. **`verified` is literally a rename of "delivered"**, computed at `:538-540` from the status field. No hash is ever computed.
3. `ReceiptVerifier.tsx:134-157` renders the shield purely off `receipt.verified` (the renamed flag). `ProofTree` (`:30-37`) always shows "No proof entries available".
4. `assertion-runner.ts:247-263` (`receipt.verified`) just reads `receipt?.verified === true` — the renamed flag again. It is **structurally unfalsifiable** for any delivered tx.
5. Meanwhile a **real** SHA-256 Merkle verifier exists in `packages/verification` (`merkle.ts:84` `sha256(combined)`, `merkle.ts:100` `computeRoot`, `receipt.ts:131` `verifyReceipt`) with **zero consumers**, and the real proof path `api.ts:289-342` (`getReceipt`, which *does* pass `prove: true`) is **never called from anywhere**.
6. The MCP server (`apps/mcp-server/src/tools/verification.ts:627`) ships a `simpleHash()` — a 32-bit DJB string hash zero-padded to 64 hex chars — **masquerading as SHA-256** (`:602` comment "real implementation would use proper SHA-256").

**Impact:** We tell users a transaction is *cryptographically verified* when we have done no cryptography. This is a correctness and trust defect in a blockchain dev tool whose entire value proposition is verifiability.

---

## 2. Evidence (current code)

**Proxy never asks for a proof** — `apps/sdk-proxy/app/routes/query.py:46-57`:
```python
@router.post("/query-tx")
async def query_tx(req: QueryTxRequest):
    from ..main import client
    if client is None:
        return {"success": False, "error": "Client not initialized"}
    try:
        result = client.v3.query(req.tx_hash)          # <-- no options, no prove, no receipt
        return {"success": True, "data": _normalize_query_result(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}
```

**"verified" is just "delivered"** — `apps/studio/src/services/execution/index.ts:537-551`:
```typescript
const rawStatus = txData.status;
const isDelivered = rawStatus === 'delivered'
  || (typeof rawStatus === 'object' && rawStatus !== null
    && ((rawStatus as Record<string, unknown>).delivered || (rawStatus as Record<string, unknown>).code === 'delivered'));
const statusObj = typeof rawStatus === 'object' && rawStatus !== null
  ? rawStatus as Record<string, unknown>
  : null;
if (rawStatus) {
  const receipt: Record<string, unknown> = {
    txHash,
    localBlock: statusObj?.blockHeight || txData.blockHeight || txData.received,
    localTimestamp: statusObj?.timestamp || txData.timestamp || txData.lastBlockTime || new Date().toISOString(),
    proof: statusObj?.proof || [],          // <-- always [] because proxy never requested prove
    verified: isDelivered,                  // <-- THE LIE: verified === delivered
  };
```

**Assertion reads the renamed flag** — `apps/studio/src/services/assertion-runner.ts:255-262`:
```typescript
const receipt = rcptNodeState.receipt as Record<string, unknown> | undefined;
const verified = receipt?.verified === true;
return {
  assertion,
  status: verified ? 'pass' : 'fail',
  message: verified ? 'Receipt verified' : 'Receipt not verified',
};
```

**The shield renders off the renamed flag** — `apps/studio/src/components/execution/ReceiptVerifier.tsx:134-158`:
```tsx
{receipt.verified ? (
  <ShieldCheck className="w-5 h-5 text-green-500" />
) : (
  <ShieldX className="w-5 h-5 text-red-500" />
)}
...
{receipt.verified ? 'Verified' : 'Unverified'}
```

**Real verifier with zero callers** — `packages/verification/src/merkle.ts:80-118` (real SHA-256) and `receipt.ts:131-185` (`verifyReceipt`). **Real proof fetch never called** — `apps/studio/src/services/network/api.ts:289-295`:
```typescript
async getReceipt(txHash: string): Promise<APIResponse<TransactionReceipt>> {
  const response = await this.callV2('query-tx', { txid: txHash, wait: true, prove: true });
```
Note `getReceipt` uses `callV2` → `this.config.v2Endpoint` directly (`api.ts:455`), which is **also dead** because the browser app proxies all traffic (commit c2088bc "Fix mixed content: proxy API through Vercel rewrites"). So even if it were called it would hit a mixed-content/CORS wall. The real path must go **through the proxy**, not `callV2`.

**MCP fake SHA-256** — `apps/mcp-server/src/tools/verification.ts:604-636` (`computeMerkleRoot` → `simpleHash`, a DJB 32-bit hash). Replacement of this is owned by **P2-5**.

**The proxy SDK CAN return a proof** — `accumulate_client/v3/options.py:148-192` has `QueryOptions.prove`, and `options.py:47-65` has `ReceiptOptions(for_any=...)`; `client.v3.query(scope, query=..., options=...)` (`client.py:289-330`) accepts both. So the data is available; we just never request it.

---

## 3. Root cause

The receipt feature was wired end-to-end **structurally** (types, UI, assertion) but the **one input that makes it meaningful — the Merkle proof — was never requested from the network**, and the **real verifier was never imported**. Someone then made the UI/assertion "work" by aliasing `verified := delivered`, which made the green path light up without any proof. The result is a fully-built verification UI sitting on top of an empty proof and a tautological boolean.

---

## 4. Target behavior & acceptance criteria

We implement **Track A (make it REAL)**. Track B (honest relabel) is the documented fallback only if the testnet cannot return anchored receipts in time (see §7).

Acceptance criteria (all testable):

- [ ] Proxy `/api/query-tx` requests a Merkle proof + receipt from the V3 SDK (`prove=True`, `include_receipt=ReceiptOptions(for_any=True)`), and the raw response containing `receipts`/`receipt` reaches the engine.
- [ ] The execution engine builds `receipt.proof` from the **actual** proof entries returned (non-empty when the tx is anchored), not `[]`.
- [ ] `receipt.verified` is set **only** by `verifyReceipt()` from `@accumulate-studio/verification` recomputing the SHA-256 Merkle root and comparing it to the anchor. It is **never** set from delivery status.
- [ ] When the tx is delivered but **not yet anchored** (no proof/anchor), `receipt.verified === false` and the engine records a distinct `verificationState: 'pending-anchor'` (not "verified", not "failed").
- [ ] A tampered proof or tampered `txHash` produces `receipt.verified === false` (falsifiable — covered by a unit test that mutates one byte).
- [ ] `ReceiptVerifier.tsx` shows three distinct states — **Verified** (green shield, proof recomputed & matched), **Awaiting anchor** (amber clock, delivered but no proof yet), **Unverified/Failed** (red) — and never shows green when `proof.length === 0`.
- [ ] The `receipt.verified` assertion passes **only** when `verifyReceipt().valid === true`, and reports "awaiting anchor" as a non-pass (configurable: `skip` if not yet anchored within timeout, `fail` if proof present but mismatched).
- [ ] `verifyReceipt()` no longer returns `valid: true` for a receipt with no anchor (that fix lands in **P2-5** and is a hard dependency here).

---

## 5. Implementation steps

### Step 1 — Proxy: request the proof and receipt (`apps/sdk-proxy/app/routes/query.py`)

The V3 SDK exposes the proof via `QueryOptions(prove=True)` and the receipt via a default query carrying `ReceiptOptions`. Update imports and the `/query-tx` handler.

**Before** (`query.py:1-9`):
```python
import time
from fastapi import APIRouter
from accumulate_client.v3.options import RangeOptions
from ..models import QueryRequest, QueryTxRequest, QueryDirectoryRequest, WaitForTxRequest
```
**After:**
```python
import time
from fastapi import APIRouter
from accumulate_client.v3.options import RangeOptions, QueryOptions, ReceiptOptions, DefaultQuery
from ..models import QueryRequest, QueryTxRequest, QueryDirectoryRequest, WaitForTxRequest
```

> Verification note for the dev: confirm `DefaultQuery` and `ReceiptOptions` are exported from `accumulate_client.v3.options` (they are defined there — `options.py:47` and `options.py:199`). If `DefaultQuery` is not re-exported, import it from its module or pass `query=None` and rely on `prove=True` alone (see fallback in this step).

**Before** (`query.py:46-57`):
```python
@router.post("/query-tx")
async def query_tx(req: QueryTxRequest):
    from ..main import client
    if client is None:
        return {"success": False, "error": "Client not initialized"}
    try:
        result = client.v3.query(req.tx_hash)
        return {"success": True, "data": _normalize_query_result(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}
```
**After:**
```python
@router.post("/query-tx")
async def query_tx(req: QueryTxRequest):
    from ..main import client
    if client is None:
        return {"success": False, "error": "Client not initialized"}
    try:
        # Request the Merkle proof (prove=True) and an anchored receipt (forAny=True).
        # forAny asks the network for a receipt against any available anchor, which is
        # what we need to recompute and check the Merkle root client-side.
        opts = QueryOptions(prove=True)
        try:
            query = DefaultQuery(include_receipt=ReceiptOptions(for_any=True))
            result = client.v3.query(req.tx_hash, query=query, options=opts)
        except (TypeError, ValueError):
            # Fallback if DefaultQuery/ReceiptOptions shape differs in this SDK build:
            # prove=True alone still returns the Merkle proof entries.
            result = client.v3.query(req.tx_hash, options=opts)
        return {"success": True, "data": _normalize_query_result(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}
```

> Do **not** change `_normalize_query_result` — it merges nested `account`/`data` to top level and preserves `_raw_nested`. The proof/receipt fields ride along in the normalized dict.

**Manual proxy probe** (run against testnet with a known anchored txid) to confirm the response now carries a proof:
```bash
curl -s -X POST http://localhost:8000/api/query-tx \
  -H 'Content-Type: application/json' \
  -d '{"tx_hash":"<KNOWN_ANCHORED_TXID>"}' | python -m json.tool | grep -iE 'receipt|proof|anchor|merkle' | head
```
Record the **actual JSON shape** of the proof in the response (key names, whether entries are `{hash,right}` or `{hash,left}` or `{anchor,...}`). The engine mapper in Step 2 must match the real shape — adjust the field reads there accordingly. This is the single most likely place reality differs from this spec.

### Step 2 — Engine: fetch the real receipt and verify it (`apps/studio/src/services/execution/index.ts`)

Add the verification import at the top of the file (with the other imports):
```typescript
import { parseReceipt, verifyReceipt } from '@accumulate-studio/verification';
```

> This requires `@accumulate-studio/verification` to be a dependency of the Studio app and built. Add it to `apps/studio/package.json` dependencies (`"@accumulate-studio/verification": "*"`) and run the workspace install/build. The package must already export a **corrected** `verifyReceipt` (P2-5).

**Replace the receipt build block.** Before (`index.ts:535-559`):
```typescript
        // Build receipt from transaction data if available
        // V2: status is an object; V3: status is an enum string with separate fields
        const rawStatus = txData.status;
        const isDelivered = rawStatus === 'delivered'
          || (typeof rawStatus === 'object' && rawStatus !== null
            && ((rawStatus as Record<string, unknown>).delivered || (rawStatus as Record<string, unknown>).code === 'delivered'));
        const statusObj = typeof rawStatus === 'object' && rawStatus !== null
          ? rawStatus as Record<string, unknown>
          : null;
        if (rawStatus) {
          const receipt: Record<string, unknown> = {
            txHash,
            localBlock: statusObj?.blockHeight || txData.blockHeight || txData.received,
            localTimestamp: statusObj?.timestamp || txData.timestamp || txData.lastBlockTime || new Date().toISOString(),
            proof: statusObj?.proof || [],
            verified: isDelivered,
          };
          if (statusObj?.majorBlock) {
            receipt.majorBlock = statusObj.majorBlock;
            receipt.majorTimestamp = statusObj.majorTimestamp;
          }
          useFlowStore.getState().updateNodeExecution(nodeId, {
            receipt,
          });
        }
```
After:
```typescript
        // Build receipt from transaction data if available.
        // verified is computed by recomputing the SHA-256 Merkle root from the proof
        // and comparing it to the anchor — it is NOT delivery status.
        const rawStatus = txData.status;
        const statusObj = typeof rawStatus === 'object' && rawStatus !== null
          ? rawStatus as Record<string, unknown>
          : null;
        // The proxy now returns the proof when prove=true. Field shape MUST be
        // confirmed against the real response (Step 1 probe). Accept the common
        // locations: top-level `receipts[0]`, `receipt`, or status.proof.
        const rawReceipt =
          (Array.isArray(txData.receipts) ? txData.receipts[0] : undefined)
          || (txData.receipt as Record<string, unknown> | undefined)
          || (statusObj?.receipt as Record<string, unknown> | undefined)
          || undefined;
        const rawProof =
          (rawReceipt?.proof as unknown[] | undefined)
          || (statusObj?.proof as unknown[] | undefined)
          || [];

        if (rawStatus) {
          // Normalize proof entries to { hash, right }. Map the REAL keys here
          // (e.g. some receipts use `right` boolean; some use anchor entries).
          const proofEntries = (Array.isArray(rawProof) ? rawProof : [])
            .map((e) => {
              const obj = e as Record<string, unknown>;
              return {
                hash: String(obj.hash ?? obj.value ?? ''),
                right: obj.right === true,
              };
            })
            .filter((e) => e.hash.length > 0);

          const anchor =
            (rawReceipt?.anchor as Record<string, unknown> | undefined)?.value
            || (rawReceipt?.anchor as string | undefined)
            || (rawReceipt?.merkleRoot as string | undefined)
            || undefined;

          let verified = false;
          let verificationState: 'verified' | 'pending-anchor' | 'failed' = 'pending-anchor';
          try {
            if (proofEntries.length > 0 && anchor) {
              const parsed = parseReceipt({
                txHash,
                localBlock: (statusObj?.blockHeight || txData.blockHeight || 0) as number,
                localTimestamp: (statusObj?.timestamp || txData.timestamp || new Date().toISOString()) as string,
                majorBlock: statusObj?.majorBlock as number | undefined,
                majorTimestamp: statusObj?.majorTimestamp as string | undefined,
                proof: proofEntries,
                anchorChain: { start: '', end: '', anchor: String(anchor) },
              });
              const result = verifyReceipt(parsed);
              verified = result.valid;
              verificationState = result.valid ? 'verified' : 'failed';
              log(verified ? 'info' : 'warn',
                `Receipt verification: ${verified ? 'VERIFIED (root matches anchor)' : `FAILED (${result.error ?? 'root mismatch'})`}`);
            } else {
              log('debug', 'Receipt has no proof/anchor yet — awaiting major-block anchoring');
            }
          } catch (e) {
            verificationState = 'failed';
            log('warn', `Receipt verification threw: ${e instanceof Error ? e.message : String(e)}`);
          }

          const receipt: Record<string, unknown> = {
            txHash,
            localBlock: statusObj?.blockHeight || txData.blockHeight || txData.received,
            localTimestamp: statusObj?.timestamp || txData.timestamp || txData.lastBlockTime || new Date().toISOString(),
            proof: proofEntries,
            anchorChain: anchor ? { start: '', end: '', anchor: String(anchor) } : undefined,
            verified,
            verificationState,
          };
          if (statusObj?.majorBlock) {
            receipt.majorBlock = statusObj.majorBlock;
            receipt.majorTimestamp = statusObj.majorTimestamp;
          }
          useFlowStore.getState().updateNodeExecution(nodeId, { receipt });
        }
```

> `parseReceipt`/`verifyReceipt` both live in `packages/verification/src/receipt.ts`. `parseReceipt` requires `localBlock` to be a number (`receipt.ts:69-72`) — pass `0` if unknown rather than `undefined`. The empty `start`/`end` anchorChain strings are acceptable to `verifyReceipt` which only reads `anchorChain.anchor` (`receipt.ts:149,164`).

### Step 3 — Add `verificationState` to the type (`packages/types/src/network.ts`)

`TransactionReceipt` (`network.ts:107-120`) needs the new field so TS compiles and the UI can read it.

Before (`network.ts:119`):
```typescript
  verified: boolean;
}
```
After:
```typescript
  verified: boolean;
  /** Set by the engine after recomputing the Merkle root. */
  verificationState?: 'verified' | 'pending-anchor' | 'failed';
}
```

### Step 4 — UI: three honest states (`apps/studio/src/components/execution/ReceiptVerifier.tsx`)

Replace the binary shield (`:134-158`) with a tri-state derived from `verificationState` (falling back to `verified`). Add `Clock` to the lucide import line (`:1-12`):
```tsx
import { Shield, ShieldCheck, ShieldX, Clock, ChevronDown, ChevronRight, Hash, GitBranch, Copy, ExternalLink } from 'lucide-react';
```

Before (`:134-158`):
```tsx
        {receipt.verified ? (
          <ShieldCheck className="w-5 h-5 text-green-500" />
        ) : (
          <ShieldX className="w-5 h-5 text-red-500" />
        )}
        ...
        <span className={cn('px-2 py-1 rounded text-xs font-medium',
            receipt.verified
              ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300')}>
          {receipt.verified ? 'Verified' : 'Unverified'}
        </span>
```
After:
```tsx
        {(() => {
          const vs = receipt.verificationState
            ?? (receipt.verified ? 'verified' : (receipt.proof.length === 0 ? 'pending-anchor' : 'failed'));
          if (vs === 'verified') return <ShieldCheck className="w-5 h-5 text-green-500" />;
          if (vs === 'pending-anchor') return <Clock className="w-5 h-5 text-amber-500" />;
          return <ShieldX className="w-5 h-5 text-red-500" />;
        })()}
        ...
        {(() => {
          const vs = receipt.verificationState
            ?? (receipt.verified ? 'verified' : (receipt.proof.length === 0 ? 'pending-anchor' : 'failed'));
          const label = vs === 'verified' ? 'Verified (Merkle root matches anchor)'
            : vs === 'pending-anchor' ? 'Awaiting anchor' : 'Verification failed';
          const cls = vs === 'verified' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
            : vs === 'pending-anchor' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
            : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300';
          return <span className={cn('px-2 py-1 rounded text-xs font-medium', cls)}>{label}</span>;
        })()}
```

Also fix the summary at `:289-294` and `:336-347` so "verified" counts only true `verified` and adds an "awaiting" bucket. Update the `ProofTree` root label (`:101-103`) to read "Merkle Root (recomputed, matched)" only when verified.

> **Hard rule:** never render the green shield when `receipt.proof.length === 0`. The `pending-anchor` branch covers the delivered-but-unanchored case explicitly.

### Step 5 — Assertion: check the real proof (`apps/studio/src/services/assertion-runner.ts`)

Before (`:255-262`):
```typescript
const receipt = rcptNodeState.receipt as Record<string, unknown> | undefined;
const verified = receipt?.verified === true;
return {
  assertion,
  status: verified ? 'pass' : 'fail',
  message: verified ? 'Receipt verified' : 'Receipt not verified',
};
```
After:
```typescript
const receipt = rcptNodeState.receipt as Record<string, unknown> | undefined;
const vs = (receipt?.verificationState as string | undefined)
  ?? (receipt?.verified === true ? 'verified' : 'failed');
if (vs === 'pending-anchor') {
  // Delivered but not yet anchored — we cannot cryptographically verify yet.
  return { assertion, status: 'skip', message: 'Receipt not yet anchored — Merkle proof unavailable' };
}
const verified = vs === 'verified' && receipt?.verified === true;
return {
  assertion,
  status: verified ? 'pass' : 'fail',
  message: verified
    ? 'Receipt verified: recomputed Merkle root matches anchor'
    : 'Receipt verification failed: Merkle root did not match anchor',
};
```

> Optionally promote `pending-anchor` to a retry: before asserting, the runner can re-query via `/api/query-tx` up to N times (anchoring on testnet takes ~1 major block). Keep that out of this change unless P1-5 already provides a wait helper.

---

## 6. Tests

**Unit (verification package — owned/shared with P2-5):**
- [ ] `verifyReceipt` returns `valid: true` for a known-good Accumulate testnet receipt (real proof + anchor) — fixture vector.
- [ ] Mutating one byte of `txHash` ⇒ `valid: false`.
- [ ] Mutating one proof entry's `hash` ⇒ `valid: false`.
- [ ] Flipping a proof entry's `right` flag ⇒ `valid: false` (verifies order sensitivity in `merkle.ts:108-114`).
- [ ] Receipt with empty proof ⇒ `valid: false`, `error: 'Receipt contains no Merkle proof'`.
- [ ] Receipt with proof but no anchor ⇒ **not** `valid: true` (this is the P2-5 fix; assert `valid !== true`).

**Integration (engine, mocked proxy):**
- [ ] Mock `/api/query-tx` returning a real anchored receipt fixture ⇒ node `receipt.verified === true`, `verificationState === 'verified'`, `proof.length > 0`.
- [ ] Mock returning delivered-but-no-proof ⇒ `verified === false`, `verificationState === 'pending-anchor'`.
- [ ] Mock returning proof with a tampered anchor ⇒ `verified === false`, `verificationState === 'failed'`.

**Integration (assertion runner):**
- [ ] `receipt.verified` assertion ⇒ `pass` only for the verified fixture; `skip` for pending-anchor; `fail` for tampered.

**Manual checklist:**
- [ ] Run a real testnet flow (e.g. "Lite Account Setup"); after a major block, the Receipt tab shows a green **Verified** shield with a populated Merkle proof tree (entries > 0).
- [ ] Immediately after delivery (before anchoring) the shield is **amber / Awaiting anchor**, never green-with-empty-proof.
- [ ] In devtools, confirm the `/api/query-tx` response body now contains proof/anchor fields.
- [ ] Temporarily hardcode a wrong anchor in the engine ⇒ UI shows red **Verification failed** and the assertion fails. Revert.

---

## 7. Risks, rollback, out of scope

**Risks**
- **Real response shape unknown until probed.** The exact JSON keys for proof entries and anchor from the V3 SDK are the top risk. Step 1's curl probe is mandatory; the Step 2 mapper field reads must be adjusted to the observed shape. Do not merge until the probe output is pasted into the PR.
- **Anchoring latency.** On testnet, receipts only become verifiable after the tx is anchored in a major block (seconds to a minute). Without the `pending-anchor` state the UI would briefly show red "failed" for healthy txns — the tri-state prevents this.
- **Proof ordering convention.** `merkle.ts` treats `right:true` as "sibling on the right". If the SDK encodes sibling side differently, verification will fail even on good data. The byte-mutation unit test plus a known-good vector catch this; if the good vector fails, the `right` mapping in Step 2 (or `combineHashes` order in `merkle.ts:108-114`) is the place to reconcile.

**Rollback**
- Revert the four code changes. The proxy change is backward-compatible (extra options) so it can stay even if the frontend reverts.
- **Track B fallback** (if anchored receipts cannot be obtained from the target network within this milestone): do **not** ship a green "Verified" shield. Instead relabel the badge "Delivery confirmed" (neutral/blue, no shield), remove `ShieldCheck` from the delivered path, and rename the assertion message to "Delivery confirmed (not cryptographically verified)". This is honest and is the minimum acceptable state — shipping the current fake "Verified" is not acceptable.

**Out of scope**
- Anchor-chain *back-reference* validation (walking the anchor up to the DN). We verify the local Merkle root against the receipt's anchor only.
- The MCP `simpleHash` replacement (that is **P2-5**).
- State-diff verification (separate concern).
