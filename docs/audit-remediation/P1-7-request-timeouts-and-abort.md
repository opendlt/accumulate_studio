# P1-7 — Request timeouts & honored abort (Stop button + hung waits)

| Field | Value |
|-------|-------|
| Priority | P1 |
| Severity | High |
| Effort | M (2–3 days) |
| Risk | Low (additive: timeouts + signal threading; no protocol/contract change) |
| Depends on | none (independent; touches `api.ts` which P0-1 & P1-5 also edit — coordinate) |
| Blocks | none |
| Primary files | `apps/studio/src/services/network/api.ts`, `apps/studio/src/services/execution/index.ts`, `apps/studio/src/services/execution/node-executor.ts`, `apps/studio/src/services/network/index.ts`, `apps/sdk-proxy/app/routes/generic.py`, `apps/sdk-proxy/app/models.py` |

---

## 1. Problem & impact

No `fetch` in the studio has a timeout, and **none** of them pass the execution's `AbortController.signal`. The Stop button calls `this.context.abortController.abort()` (`execution/index.ts:264-265`), but the only places that observe the signal are the two poll loops in `node-executor.ts` (`664`, `735`) — and they only check **between** awaits, not during them. So:

- A `callProxy` / `callV2` / `fetchApi` request that is **in flight** when the user clicks Stop keeps running to completion; the abort is ignored.
- The biggest offender is `POST /api/sign-and-submit` with `wait: true`. Server-side, `signer.sign_submit_and_wait(...)` (`generic.py:258-263`) blocks the request until the tx is delivered or the SDK gives up. There is no client timeout and no server timeout we control, so a stuck transaction hangs that fetch — and therefore the whole flow — **indefinitely**. The await never returns, so the next `signal.aborted` check is never reached, and Stop does nothing.
- Transient read failures (a single dropped `/api/query`) are not retried, so polling flows fail on blips that a one-shot retry would survive.

**Impact:** a single slow/stuck transaction or a hung TCP connection freezes the entire execution with no way to recover except reloading the page. Stop appears broken. This is a top user-visible reliability complaint.

---

## 2. Evidence (current code)

**`callProxy` — no timeout, no signal** — `apps/studio/src/services/network/api.ts:75-86`:
```typescript
async callProxy<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${this.proxyEndpoint}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) { ... }
  return response.json();
}
```

**`callV2` — no timeout, no signal** — `apps/studio/src/services/network/api.ts:455-466`:
```typescript
const response = await fetch(this.config.v2Endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
});
```

**`fetchApi` — no timeout, no signal** — `apps/studio/src/services/network/index.ts:144-155` (same pattern).

**Stop aborts a controller nothing in-flight honors** — `apps/studio/src/services/execution/index.ts:258-284`:
```typescript
stopExecution(): void {
  if (this.status === 'idle') return;
  if (this.context) {
    this.context.abortController.abort();   // signal fires...
  }
  ...
}
```
…but the signal is observed **only** at poll-loop boundaries — `apps/studio/src/services/execution/node-executor.ts:663-672` (and identically at `734`):
```typescript
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  if (context.abortController.signal.aborted) {       // only checked here, between awaits
    throw new Error('Execution aborted');
  }
  const result = await this.api.callProxy<...>('/api/query', { url: account });  // not abortable
  ...
  await this.delay(delayMs);                            // not abortable either
}
```

**Server-side unbounded wait** — `apps/sdk-proxy/app/routes/generic.py:258-263`:
```python
if req.wait:
    result = signer.sign_submit_and_wait(
        principal=req.principal,
        body=body,
        memo=req.memo,
    )
```
There is no server-side cap on how long this blocks; the `/api/query`-based `wait-for-tx` route (`query.py:75-97`) at least loops `max_attempts`, but `sign-and-submit` delegates to the SDK with no bound.

---

## 3. Root cause

Timeouts and cancellation were never threaded through the network layer. The `AbortController` exists in the execution context but is only ever read, never connected to the actual `fetch` calls (which is what `AbortSignal` is *for*). The proxy's `wait=true` path trusts the SDK to return in bounded time; when the network stalls, neither side has a deadline.

---

## 4. Target behavior & acceptance criteria

- [ ] A single reusable `fetchWithTimeout(url, opts, { signal, timeoutMs, retries })` helper exists and is used by **every** fetch in `api.ts` and `network/index.ts`.
- [ ] Every proxy/network request carries a per-request **timeout** (default 60s, configurable) that rejects with a clear `TimeoutError`.
- [ ] Every request is linked to the execution's `abortController.signal`; clicking **Stop** rejects all in-flight requests promptly (< 1s).
- [ ] Idempotent **reads only** (`/api/query`, `/api/query-tx`, `query`, `query-directory`) get **bounded retries with backoff**; writes/signing are **never** auto-retried.
- [ ] The proxy's `sign-and-submit` honors a **server-side wait timeout** (`wait_timeout_ms`), returning a `failed`/timeout `TxResponse` instead of hanging.
- [ ] `node-executor.ts` poll-loop `delay()` calls are abortable (a Stop during the inter-poll sleep returns immediately).
- [ ] All 8 golden-path templates still pass; Stop reliably halts a running flow.

---

## 5. Implementation steps

### 5.1 The `fetchWithTimeout` helper

**New file:** `apps/studio/src/services/network/fetch-with-timeout.ts`.

```typescript
export interface FetchTimeoutOptions {
  /** Caller-supplied abort signal (e.g. execution abortController.signal). */
  signal?: AbortSignal;
  /** Per-request timeout in ms. Default 60_000. */
  timeoutMs?: number;
  /** Bounded retries for IDEMPOTENT requests only. Default 0. */
  retries?: number;
  /** Base backoff in ms (doubled each retry). Default 500. */
  backoffMs?: number;
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/** True for "this was cancelled by the user / caller", which must NOT be retried. */
function isUserAbort(signal: AbortSignal | undefined, err: unknown): boolean {
  return !!signal?.aborted || (err instanceof DOMException && err.name === 'AbortError');
}

/**
 * fetch() with a per-request timeout, caller-abort linkage, and optional
 * bounded retry/backoff. RETRIES MUST ONLY BE USED FOR IDEMPOTENT READS.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  opts: FetchTimeoutOptions = {},
): Promise<Response> {
  const { signal: callerSignal, timeoutMs = 60_000, retries = 0, backoffMs = 500 } = opts;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const timeoutCtrl = new AbortController();
    const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

    // Compose caller signal + timeout signal into one.
    const onCallerAbort = () => timeoutCtrl.abort();
    if (callerSignal) {
      if (callerSignal.aborted) timeoutCtrl.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const res = await fetch(url, { ...init, signal: timeoutCtrl.signal });
      return res;
    } catch (err) {
      // User/caller aborted -> never retry, propagate a clean abort error.
      if (isUserAbort(callerSignal, err)) {
        throw new DOMException('Aborted', 'AbortError');
      }
      // Timeout fired (our controller, not the caller's).
      const timedOut = timeoutCtrl.signal.aborted && !callerSignal?.aborted;
      const canRetry = attempt < retries;
      if (!canRetry) {
        throw timedOut ? new TimeoutError(timeoutMs) : err;
      }
      // Backoff, but remain abortable during the wait.
      await abortableDelay(backoffMs * 2 ** attempt, callerSignal);
      attempt += 1;
    } finally {
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }
}

/** A setTimeout that rejects immediately if the signal aborts. */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
```

> NOTE: `AbortSignal.timeout(ms)` exists but doesn't compose with a caller signal without `AbortSignal.any([...])` (newer browsers). The manual two-controller approach above works everywhere the studio targets and keeps the caller-abort/timeout distinction (needed so timeouts can retry but user-aborts can't).

### 5.2 Thread a signal + timeout into `AccumulateAPI`

`AccumulateAPI` has no signal today. Give it one via the execution context. **`api.ts`** — add a settable signal and a default timeout, then route every fetch through the helper.

```typescript
import { fetchWithTimeout, TimeoutError } from './fetch-with-timeout';

export class AccumulateAPI {
  private config: NetworkConfig;
  private abortSignal?: AbortSignal;            // NEW
  private requestTimeoutMs = Number(
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REQUEST_TIMEOUT_MS) || 60_000,
  );

  constructor(config: NetworkConfig) { this.config = config; }

  setAbortSignal(signal: AbortSignal): void { this.abortSignal = signal; }   // NEW
```
Update `callProxy` (writes — **no retries**):
```typescript
async callProxy<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout(
    `${this.proxyEndpoint}${path}`,
    { method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body) },
    { signal: this.abortSignal, timeoutMs: this.requestTimeoutMs, retries: 0 },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Proxy error ${response.status}: ${text}`);
  }
  return response.json();
}
```
> `authHeaders()` is introduced in P0-1; if P0-1 is not merged, keep `{ 'Content-Type': 'application/json' }`.

Add a **read-only** proxy helper that *does* retry, and use it for query endpoints:
```typescript
async callProxyRead<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout(
    `${this.proxyEndpoint}${path}`,
    { method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body) },
    { signal: this.abortSignal, timeoutMs: this.requestTimeoutMs, retries: 2, backoffMs: 500 },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Proxy error ${response.status}: ${text}`);
  }
  return response.json();
}
```
Update `callV2` (`api.ts:448-473`) — reads, so allow retries:
```typescript
const response = await fetchWithTimeout(
  this.config.v2Endpoint,
  { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) },
  { signal: this.abortSignal, timeoutMs: this.requestTimeoutMs, retries: 2 },
);
if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
return response.json();
```
Update `callProxyGet` (`api.ts:91-100`) the same way (reads, `retries: 2`).

### 5.3 Wire the signal in at execution start

**`execution/index.ts`** — after the context is built (line ~68), give the API its signal:
```typescript
this.context = {
  flow, nodeOutputs: new Map(), variables: new Map(),
  api, abortController: new AbortController(), sessionId,
};
api.setAbortSignal(this.context.abortController.signal);   // NEW — must be after abortController exists
```
(`api` was constructed at line 60 with `new AccumulateAPI(networkConfig)`; the controller is created in the object literal, so set the signal right after assigning `this.context`.)

`stopExecution` already calls `this.context.abortController.abort()` (`index.ts:264-265`) — no change needed; in-flight fetches now observe it.

### 5.4 Make node-executor reads retry + abortable sleeps

**`node-executor.ts`** — use the new read helper in the poll loops and make `delay` abortable.

Replace the two poll-loop queries (`664-672` and `739-743`) `this.api.callProxy('/api/query', …)` with `this.api.callProxyRead('/api/query', …)`. Also replace the bare `executeQuery` proxy call (`614-618`) with `callProxyRead`, and the enrichment reads in `execution/index.ts` (`api.callProxy('/api/query-tx', …)` at `462`, `api.callProxy('/api/query', …)` at `571`) with `callProxyRead`.

Make the inter-poll sleep abortable — replace `node-executor.ts:1309-1311`:

Before:
```typescript
private delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```
After:
```typescript
private delay(ms: number, signal?: AbortSignal): Promise<void> {
  return abortableDelay(ms, signal);
}
```
and pass the signal at the call sites (`694`, `764`): `await this.delay(delayMs, context.abortController.signal);`. Add `import { abortableDelay } from '../network/fetch-with-timeout';` at the top of `node-executor.ts`. The existing `if (context.abortController.signal.aborted) throw …` checks (`664`, `735`) stay as a fast pre-check; the abortable delay handles aborts that arrive mid-sleep.

### 5.5 Server-side wait timeout in the proxy

**`models.py`** — add a bound to `SignAndSubmitRequest` (`139-145`):
```python
class SignAndSubmitRequest(SessionRequest):
    tx_type: str
    principal: str
    signer_url: str | None = None
    fields: dict
    memo: str | None = None
    wait: bool = True
    wait_timeout_ms: int = 90_000      # NEW: server-side cap on the blocking wait
```
**`generic.py`** — bound `sign_submit_and_wait` with a thread + timeout so a stuck SDK call can't hang the worker forever. Replace `258-269`:

Before:
```python
if req.wait:
    result = signer.sign_submit_and_wait(
        principal=req.principal, body=body, memo=req.memo,
    )
    return TxResponse(
        success=result.success,
        tx_hash=getattr(result, "txid", None),
        status="delivered" if result.success else "failed",
        error=str(result.error) if not result.success else None,
    )
```
After:
```python
if req.wait:
    import concurrent.futures
    def _do_wait():
        return signer.sign_submit_and_wait(principal=req.principal, body=body, memo=req.memo)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(_do_wait)
        try:
            result = future.result(timeout=req.wait_timeout_ms / 1000)
        except concurrent.futures.TimeoutError:
            # The tx may still be submitted; report a timeout so the client can poll.
            return TxResponse(
                success=False,
                status="timeout",
                error=f"Server wait timed out after {req.wait_timeout_ms}ms; transaction may still settle. Query its status to confirm.",
            )
    return TxResponse(
        success=result.success,
        tx_hash=getattr(result, "txid", None),
        status="delivered" if result.success else "failed",
        error=str(result.error) if not result.success else None,
    )
```
> The thread can't be force-killed (Python limitation), but capping `future.result()` frees the request handler and returns control to the client so the *client's* timeout/abort isn't the only backstop. Keep `wait_timeout_ms` below the client `timeoutMs` so the server returns first with a useful "timeout" status rather than the client surfacing a generic `TimeoutError`. Recommended: client 60–90s read timeout, but `callProxy` (writes) should use a **longer** timeout than reads — set the write timeout to `wait_timeout_ms + 15_000`. Add a `writeTimeoutMs` to `AccumulateAPI` and use it in `callProxy`:
```typescript
private writeTimeoutMs = this.requestTimeoutMs + 30_000;   // covers server wait + margin
// in callProxy: { signal: this.abortSignal, timeoutMs: this.writeTimeoutMs, retries: 0 }
```

---

## 6. Tests

### Unit
- [ ] `fetchWithTimeout` rejects with `TimeoutError` when the underlying fetch never resolves and `timeoutMs` elapses (mock `fetch` with a never-settling promise; use fake timers).
- [ ] `fetchWithTimeout` rejects with an `AbortError` (not `TimeoutError`) when the caller signal aborts mid-request, and does **not** retry.
- [ ] With `retries: 2`, a fetch that fails twice then succeeds resolves on the third try; backoff doubles (500 → 1000).
- [ ] `abortableDelay` resolves after `ms`, and rejects immediately if the signal is already aborted or aborts during the wait.

### Integration
- [ ] `executeWaitForBalance` with a Stop during the inter-poll `delay` rejects within ~the delay's remaining time, not after `maxAttempts`.
- [ ] Proxy: `POST /api/sign-and-submit` with `wait_timeout_ms=1000` against a stubbed `sign_submit_and_wait` that sleeps 5s returns `status="timeout"` in ~1s.
- [ ] A `callProxyRead` to `/api/query` that 500s once then succeeds returns the success payload (retry path).

### Manual QA — proving Stop works
1. Load "Zero to Hero", start execution.
2. While a `sign-and-submit` (or a `WaitForBalance` poll) is visibly in flight, click **Stop**.
   - [ ] Execution status flips to failed/stopped within ~1s.
   - [ ] The DevTools Network tab shows the in-flight request **cancelled** (status `(canceled)`), not completing.
   - [ ] The execution log shows "Execution stopped by user" and no further node starts.
3. Simulate a hang: point the proxy at an unreachable network endpoint (or add a `time.sleep(120)` in `_do_wait` temporarily) and run a flow.
   - [ ] The flow does **not** hang forever; it surfaces a timeout (`status="timeout"` from the proxy, or `TimeoutError` client-side) within the configured window.
   - [ ] Clicking Stop during the hang still returns control immediately.

---

## 7. Risks, rollback, out of scope

**Risks**
- Too-aggressive default timeouts could abort legitimately slow testnet txs. Mitigate: writes get the longer `writeTimeoutMs` (server wait + margin); make both configurable via `VITE_REQUEST_TIMEOUT_MS` and `wait_timeout_ms`.
- Retrying reads could mask a real outage as slowness; bounded at 2 retries with backoff, reads only, never writes.
- The proxy's threaded wait can't truly kill the SDK call; the orphaned thread runs to completion in the background. Acceptable (it's a read-after-submit), but watch worker thread accumulation under heavy timeout load.

**Rollback**
- Fully additive. Revert by routing `callProxy`/`callV2`/`fetchApi` back to plain `fetch` and dropping `setAbortSignal`/`fetchWithTimeout`; the proxy `wait_timeout_ms` defaults make the server change backward-compatible (older clients omit the field and get 90s).

**Out of scope**
- `networkService.fetchApi` retry policy for status-poll loops (`network/index.ts:172-195`) beyond adding the timeout — those are background pollers, not execution-critical.
- True server-side cancellation of an in-flight SDK submission (Python threads aren't cancellable).
- The split-brain read routing (P1-5) — this doc only adds timeouts/abort to whatever fetches exist.
