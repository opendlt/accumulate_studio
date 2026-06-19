# [P0-5] — Honest Synthetic Transaction Tracing (stop fabricating "delivered")

| Field | Value |
|-------|-------|
| Priority | P0 |
| Severity | Critical |
| Effort | M (2–4 days) |
| Risk | Medium — adds N network round-trips per node and changes a status the UI/assertions trust |
| Depends on | **P1-5** (proxy `/api/query-tx` must reliably return real tx status for synthetic txids) |
| Blocks | Any claim that synthetic messages were "delivered"/"settled" |
| Primary files | `apps/studio/src/services/execution/index.ts`, `apps/studio/src/services/assertion-runner.ts`, `apps/studio/src/components/execution/SyntheticTracer.tsx`, (optionally) `apps/sdk-proxy/app/routes/query.py` |

---

## 1. Problem & impact

When a transaction "produces" synthetic transactions (e.g. `sendTokens` → `SyntheticDepositTokens` on the recipient's partition), the engine **fabricates** the synthetic records instead of querying them:

- The **type** is guessed from a hardcoded switch on the parent tx type (`index.ts:508-512`).
- The **status** is **hardcoded `'delivered'`** (`index.ts:529`) — it is never queried.
- **source/dest** are **regex-scraped from the txid string** (`index.ts:521-528`), not read from the network.

The `synthetic.delivered` assertion (`assertion-runner.ts:265-287`) then checks `s.status === 'delivered'` — which is **always true by construction**. The assertion is **unfalsifiable**: it passes whether or not the synthetic actually settled, and it would pass even if the synthetic failed. The `SyntheticTracer.tsx` UI renders "Delivered, awaiting confirmation" / green checks off this fabricated status.

There is also a real **operator-precedence bug** in the type/origin extraction (`index.ts:503-518`): `a || b && c || d` without parentheses, which mixes `&&` and `||` and does not extract the V3 nested field as intended.

**Impact:** We show users that cross-partition settlement *succeeded* with zero evidence. In a tool meant to teach and verify Accumulate's synthetic-transaction model, this is actively misleading and makes the assertion worthless.

---

## 2. Evidence (current code)

`apps/studio/src/services/execution/index.ts:499-533`:
```typescript
        if (producedList.length > 0) {
          // Infer synthetic type from parent transaction type
          // V2: type at top level; V3: nested under message.transaction.body.type
          const msg = txData.message as Record<string, unknown> | undefined;
          const txType = (txData.type as string)
            || (msg?.transaction as Record<string, unknown>)?.body
              && ((msg?.transaction as Record<string, unknown>)?.body as Record<string, unknown>)?.type as string
            || (msg?.type as string)
            || '';                                            // <-- precedence bug: || mixed with &&
          const syntheticType = txType === 'sendTokens' ? 'SyntheticDepositTokens'
            : txType === 'addCredits' ? 'SyntheticDepositCredits'
            : txType === 'createIdentity' ? 'SyntheticCreateIdentity'
            : txType === 'writeData' ? 'SyntheticWriteData'
            : 'SyntheticDepositTokens';                       // <-- guessed, never queried

          const origin = (txData.origin as string)
            || (msg?.transaction as Record<string, unknown>)?.header
              && ((msg?.transaction as Record<string, unknown>)?.header as Record<string, unknown>)?.principal as string
            || '';                                            // <-- same precedence bug

          const mapped = producedList.map((txid: string) => {
            const hashMatch = txid.match(/acc:\/\/([a-f0-9]+)@/);
            const destMatch = txid.match(/@(.+)/);
            return {
              type: syntheticType,
              hash: hashMatch?.[1] || txid,
              txid,
              source: origin,                                 // <-- scraped, not from network
              destination: destMatch ? `acc://${destMatch[1]}` : '',  // <-- scraped from txid
              status: 'delivered' as const,                  // <-- HARDCODED. never queried.
            };
          });
          mergeOutput('synthetics', mapped);
        }
```

The precedence bug, concretely: `A || B && C || D` parses as `A || (B && C) || D`. With `A = txData.type` (often a non-empty string), the rest is dead; but when `A` is empty and you're on V3, `B && C` evaluates `B` (the `body` object, truthy) `&& C` (`body.type`), which *does* yield the type — **except** the same pattern for `origin` and the general fragility means any falsy intermediate silently collapses to `''`. It "works by accident" on the happy path and is unreadable. It must be parenthesized regardless.

The unfalsifiable assertion — `apps/studio/src/services/assertion-runner.ts:273-287`:
```typescript
const outputs = synthNodeState.outputs as Record<string, unknown> | undefined;
const synthetics = outputs?.synthetics as Array<{ status?: string }> | undefined;
if (!synthetics || synthetics.length === 0) {
  return { assertion, status: 'fail', message: 'No synthetic transactions found' };
}
const allDelivered = synthetics.every((s) => s.status === 'delivered');   // always true: status is hardcoded 'delivered'
return {
  assertion,
  status: allDelivered ? 'pass' : 'fail',
  ...
```

The UI trusting the fake status — `apps/studio/src/components/execution/SyntheticTracer.tsx:55-67, 251-282` (StatusIcon/StatusBadge/settlement text all key off `message.status`).

The proxy already exposes per-tx status — `apps/sdk-proxy/app/routes/query.py:46-57` (`/query-tx`) returns the normalized record, and `/wait-for-tx` (`:75-97`) reads `status.delivered`/`status.failed`. So we can query each synthetic txid's real status today.

---

## 3. Root cause

Synthetic records were **synthesized client-side from the parent transaction** (a placeholder shortcut) and never replaced with a real per-synthetic query. The hardcoded `'delivered'` made the tracer UI and assertion light up green without any network confirmation. The precedence bug is a secondary symptom of building the placeholder by hand instead of reading structured fields.

---

## 4. Target behavior & acceptance criteria

- [ ] For each produced synthetic txid, the engine **queries the network** (`/api/query-tx`) and populates `status` from the **actual** response (`delivered` / `pending` / `failed` / `unknown`), never hardcoded.
- [ ] `type` is taken from the **synthetic transaction's own** body type when the query returns it; the parent-type guess is only a labelled fallback when the network does not (yet) return the synthetic body.
- [ ] `source` and `destination` come from the synthetic's queried header/principal when available; txid-string scraping is only a last-resort fallback.
- [ ] The operator-precedence bug in `txType`/`origin` extraction is fixed with explicit parentheses (`(a) || (b && c) || (d)`), or rewritten as a small helper with optional chaining.
- [ ] The `synthetic.delivered` assertion can **fail**: a pending or failed synthetic yields `fail` (or `skip` for pending if configured), not `pass`.
- [ ] `SyntheticTracer.tsx` shows the **real** mix of statuses (pending/delivered/failed) and does not show green "delivered" for an unqueried/pending synthetic.
- [ ] Querying is bounded: at most one query per produced txid (plus an optional small retry for `pending`), with failures degrading to `status: 'unknown'`, not throwing.

---

## 5. Implementation steps

### Step 1 — Fix the precedence bug + extract real fields (`apps/studio/src/services/execution/index.ts:499-533`)

Replace the whole `if (producedList.length > 0) { ... }` block. The new version (a) parenthesizes the V2/V3 field extraction, (b) builds synthetics with `status: 'unknown'` initially, then (c) queries each one. Because `enrichNodeData` is already `async` and has `api` in scope, we can `await`.

Before — see §2 (`index.ts:499-533`).

After:
```typescript
        if (producedList.length > 0) {
          const msg = txData.message as Record<string, unknown> | undefined;
          const txn = msg?.transaction as Record<string, unknown> | undefined;
          const body = txn?.body as Record<string, unknown> | undefined;
          const header = txn?.header as Record<string, unknown> | undefined;

          // Parent tx type (V2 top-level OR V3 nested) — parenthesized, no precedence bug.
          const parentTxType =
            (txData.type as string | undefined)
            ?? (body?.type as string | undefined)
            ?? (msg?.type as string | undefined)
            ?? '';

          const parentOrigin =
            (txData.origin as string | undefined)
            ?? (header?.principal as string | undefined)
            ?? '';

          // Fallback type label derived from the PARENT (used only when the
          // synthetic's own body type is not returned by the query).
          const fallbackType: SyntheticMessageType =
            parentTxType === 'sendTokens' ? 'SyntheticDepositTokens'
            : parentTxType === 'addCredits' ? 'SyntheticDepositCredits'
            : parentTxType === 'createIdentity' ? 'SyntheticCreateIdentity'
            : parentTxType === 'writeData' ? 'SyntheticWriteData'
            : 'SyntheticSequenced';

          // Build provisional records, then query each for REAL status/type/dest.
          const mapped = await Promise.all(producedList.map(async (txid: string) => {
            const hashMatch = txid.match(/acc:\/\/([a-f0-9]+)@/);
            const destMatch = txid.match(/@(.+)/);
            const hash = hashMatch?.[1] || txid;

            // Defaults from string scraping (last-resort fallback only).
            let type: SyntheticMessageType = fallbackType;
            let source = parentOrigin;
            let destination = destMatch ? `acc://${destMatch[1]}` : '';
            let status: 'pending' | 'delivered' | 'failed' | 'unknown' = 'unknown';

            try {
              const synRes = await api.callProxy<{
                success: boolean;
                data?: Record<string, unknown>;
                error?: string;
              }>('/api/query-tx', { tx_hash: txid });

              if (synRes.success && synRes.data) {
                const sd = synRes.data;
                const sMsg = sd.message as Record<string, unknown> | undefined;
                const sTxn = sMsg?.transaction as Record<string, unknown> | undefined;
                const sBody = sTxn?.body as Record<string, unknown> | undefined;
                const sHeader = sTxn?.header as Record<string, unknown> | undefined;

                // Real synthetic body type, if returned.
                const sType =
                  (sd.type as string | undefined)
                  ?? (sBody?.type as string | undefined)
                  ?? (sMsg?.type as string | undefined);
                if (sType) {
                  const norm = sType.replace(/^synthetic/i, 'Synthetic');
                  // Keep fallback unless the queried type is a known synthetic label.
                  const known: SyntheticMessageType[] = [
                    'SyntheticCreateIdentity','SyntheticWriteData','SyntheticDepositTokens',
                    'SyntheticDepositCredits','SyntheticBurnTokens','SyntheticMirror',
                    'SyntheticSequenced','SyntheticAnchor',
                  ];
                  if (known.includes(norm as SyntheticMessageType)) type = norm as SyntheticMessageType;
                }

                // Real destination = the synthetic's principal.
                const sPrincipal = sHeader?.principal as string | undefined;
                if (sPrincipal) destination = sPrincipal;

                // Real status.
                status = parseSyntheticStatus(sd.status);
              } else {
                status = 'unknown';
              }
            } catch (e) {
              log('debug', `Synthetic query failed for ${txid}: ${e instanceof Error ? e.message : String(e)}`);
              status = 'unknown';
            }

            return { type, hash, txid, source, destination, status };
          }));

          mergeOutput('synthetics', mapped);
        }
```

Add a small status parser near the other helpers in this file (or import the existing one — see Step 2). It must mirror the network's V2-object / V3-string status shapes (same logic already used at `index.ts:537-540` and in the proxy `wait-for-tx` at `query.py:87`):
```typescript
function parseSyntheticStatus(raw: unknown): 'pending' | 'delivered' | 'failed' | 'unknown' {
  if (typeof raw === 'string') {
    const l = raw.toLowerCase();
    if (l === 'delivered' || l === 'confirmed') return 'delivered';
    if (l === 'failed' || l === 'error') return 'failed';
    if (l === 'pending') return 'pending';
    return 'unknown';
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (o.failed) return 'failed';
    if (o.delivered || o.code === 'delivered' || o.code === 'ok') return 'delivered';
    if (o.pending) return 'pending';
  }
  return 'unknown';
}
```

> `SyntheticMessageType` is already imported in this file's type usage chain via `@accumulate-studio/types`; if not imported, add it to the existing `@accumulate-studio/types` import. `api.callProxy` is the same proxy client used elsewhere in `enrichNodeData` (`index.ts:462,571`).

> **Reuse note:** `packages/verification/src/synthetic.ts` already exports `parseSyntheticMessages` and a `parseTransactionStatus`. If P2-5 makes the verification package a dependency of the Studio app, prefer importing that `parseTransactionStatus` instead of duplicating `parseSyntheticStatus`. Duplicating is acceptable for this P0 if the dep is not yet wired.

### Step 2 — Proxy (only if needed)

`/api/query-tx` already returns the per-tx record (`query.py:46-57`). **No proxy change is required** for status. If, during testing, synthetic txids return *empty* status until anchored, add an optional bounded wait by reusing `/api/wait-for-tx` (`query.py:75-97`) for synthetics — but prefer keeping a single fast query in the engine and surfacing `pending` honestly rather than blocking the UI.

### Step 3 — Assertion can fail (`apps/studio/src/services/assertion-runner.ts:273-287`)

The existing logic already fails when not all `=== 'delivered'`. Now that status is real, it becomes meaningful. Tighten the messaging and treat `pending` distinctly:

Before (`:279-286`):
```typescript
const allDelivered = synthetics.every((s) => s.status === 'delivered');
return {
  assertion,
  status: allDelivered ? 'pass' : 'fail',
  message: allDelivered
    ? `All ${synthetics.length} synthetic transactions delivered`
    : `Some synthetic transactions not delivered`,
};
```
After:
```typescript
const failed = synthetics.filter((s) => s.status === 'failed');
const pending = synthetics.filter((s) => s.status === 'pending' || s.status === 'unknown' || s.status == null);
const delivered = synthetics.filter((s) => s.status === 'delivered' || s.status === 'confirmed');

if (failed.length > 0) {
  return { assertion, status: 'fail',
    message: `${failed.length}/${synthetics.length} synthetic transaction(s) failed` };
}
if (pending.length > 0) {
  // Honest: not yet confirmed. Use 'skip' so a slow anchor doesn't false-fail,
  // but it is NOT a pass.
  return { assertion, status: 'skip',
    message: `${pending.length}/${synthetics.length} synthetic transaction(s) still pending — not yet confirmed delivered` };
}
return { assertion, status: 'pass',
  message: `All ${delivered.length} synthetic transaction(s) confirmed delivered` };
```

### Step 4 — UI honesty (`apps/studio/src/components/execution/SyntheticTracer.tsx`)

No structural change needed — the component already renders per-status icons/badges (`:55-83`) and a per-status settlement line (`:251-282`). Because status is now real, it will correctly show pending/failed. **Verify** the `unknown` path (`StatusIcon` default `:64-65`, `StatusBadge` `unknown` color `:75`) renders sensibly (grey "unknown"), and that the summary buckets (`:305-317`) reflect the real counts. No green check should appear for `pending`/`unknown`.

---

## 6. Tests

**Unit (`parseSyntheticStatus`):**
- [ ] `'delivered'` → `delivered`; `'pending'` → `pending`; `'failed'` → `failed`; `''`/garbage → `unknown`.
- [ ] `{ delivered: true }` → `delivered`; `{ failed: true }` → `failed`; `{ code: 'delivered' }` → `delivered`; `{}` → `unknown`.

**Unit (precedence fix):**
- [ ] V2 fixture (`txData.type = 'sendTokens'`, top-level `origin`) ⇒ `fallbackType === 'SyntheticDepositTokens'`, `parentOrigin` populated.
- [ ] V3 fixture (`message.transaction.body.type = 'sendTokens'`, `message.transaction.header.principal`) ⇒ same, proving the nested path is read.

**Integration (engine, mocked proxy):**
- [ ] Parent produces 2 synthetics; mock `/api/query-tx` returns one `delivered`, one `pending` ⇒ node outputs `synthetics` with the **real** mixed statuses (not both `delivered`).
- [ ] Mock returns one `failed` ⇒ that synthetic's `status === 'failed'`.
- [ ] Mock query throws ⇒ that synthetic's `status === 'unknown'` (no exception bubbles out of `enrichNodeData`).
- [ ] Synthetic query returns a real `header.principal` ⇒ `destination` equals it (not the regex-scraped value).

**Integration (assertion runner):**
- [ ] All-delivered ⇒ `pass`. Any failed ⇒ `fail`. Any pending (none failed) ⇒ `skip`. (Previously always `pass` — this proves falsifiability.)

**Manual checklist:**
- [ ] Run "Token Transfer" on testnet; the Synthetic tab shows the deposit synthetic moving pending → delivered as it settles (refresh/re-enrich), not instantly green.
- [ ] Devtools: confirm one `/api/query-tx` per produced txid.
- [ ] Point a flow at a synthetic that will fail (or mock it) ⇒ UI shows red "Settlement failed" and the assertion fails.

---

## 7. Risks, rollback, out of scope

**Risks**
- **Extra network round-trips:** one `/api/query-tx` per produced txid. For flows producing many synthetics this adds latency. Mitigation: `Promise.all` (parallel, as written) and a single query (no retry loop) — surface `pending` rather than blocking.
- **Timing/anchoring:** a freshly-produced synthetic may legitimately be `pending` for a moment. The assertion uses `skip` for pending to avoid false failures; the UI shows pending honestly. If product wants a hard pass/fail, add a bounded re-query (reuse `/api/wait-for-tx`) — out of scope here.
- **Real status shape variance (V2 vs V3):** `parseSyntheticStatus` covers both object and string forms observed in this codebase; if a synthetic returns a status field shape not covered, it degrades to `unknown` (safe, non-green) rather than fabricating `delivered`.

**Rollback**
- Revert the engine block and the assertion block. The proxy is unchanged, so nothing to roll back there.

**Out of scope**
- Recursive synthetic tracing (a synthetic that itself produces synthetics) — the MCP `traceSynthetics` already does depth recursion; mirroring that in the engine is a follow-up.
- The receipt/Merkle verification (that is **P0-4**).
- Replacing the duplicated status parser with the verification-package export (do it when P2-5 wires the dependency).
