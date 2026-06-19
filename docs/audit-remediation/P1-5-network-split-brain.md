# P1-5 — Network split-brain: submissions and verification can read different chains

| Field | Value |
|-------|-------|
| Priority | P1 |
| Severity | High |
| Effort | M (2–3 days) |
| Risk | Med (changes the network contract between frontend and proxy; touches read paths used by assertions) |
| Depends on | none (coordinate `config.py` / `api.ts` edits with P0-1) |
| Blocks | P0-4 and P0-5 (any work that relies on reads reflecting the same chain that was written) |
| Primary files | `apps/studio/src/services/execution/index.ts`, `apps/studio/src/services/network/index.ts`, `apps/studio/src/services/network/api.ts`, `apps/studio/src/services/assertion-runner.ts`, `apps/sdk-proxy/app/config.py`, `apps/sdk-proxy/app/main.py`, `apps/sdk-proxy/app/routes/query.py`, `apps/sdk-proxy/app/models.py`, `apps/studio/.env.example`, `apps/studio/.env.development`, `apps/sdk-proxy/docker-compose.yml`, `vercel.json` |

---

## 1. Problem & impact

There are **three** network code paths in the studio, and they do not agree on which chain they target:

1. **Transaction submission** goes through the SDK proxy. The proxy's network is pinned **at deploy time** by `ACCUMULATE_NETWORK` (`config.py:16`) and the singleton `client` built in `main.py:34`. The user's network selection in the UI is **ignored** here.
2. **Enrichment reads** (`execution/index.ts` `enrichNodeData`) correctly go through the proxy (`/api/query-tx`, `/api/query`), so they see the proxy's pinned chain — same as submission. Good, but still pinned, not user-selected.
3. **Assertion reads** (`assertion-runner.ts`) call `networkService.fetchApi('v2', 'query', …)`, which hits **the user-selected network's V2 endpoint directly** (`network/index.ts:140-155`, endpoints from `NETWORKS` in `packages/types/src/network.ts`). The legacy `AccumulateAPI.query/faucet/submit/getTxStatus` methods in `api.ts` also hit `this.config.v2Endpoint` directly via `callV2` (`api.ts:455`).

So if the user picks **testnet** in the UI but the proxy was deployed with `ACCUMULATE_NETWORK=kermit`, every transaction lands on **kermit**, while assertions query **testnet** — the account legitimately does not exist there, and the flow reports a **false failure**. Even when the names match, the two sides can drift (different deploy, stale env) with no detection.

**Impact:** non-deterministic, confusing failures that look like protocol bugs. Verification (P0-4/P0-5 build on it) is untrustworthy because reads and writes are not guaranteed to be on the same chain. A `mainnet` pin on the proxy combined with a `testnet` UI selection is also a foot-gun (covered defensively by P0-1's mainnet guard).

---

## 2. Evidence (current code)

**Submission network is deploy-time-pinned** — `apps/sdk-proxy/app/config.py:14-17` and `apps/sdk-proxy/app/main.py:31-37`:
```python
def get_network_endpoint() -> str:
    network = os.getenv("ACCUMULATE_NETWORK", "testnet")
    return NETWORK_ENDPOINTS.get(network, NETWORK_ENDPOINTS["testnet"])
```
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    client = Accumulate(get_network_endpoint())     # one client, fixed network, for the process lifetime
    yield
```

**Assertions read the user-selected network directly (not the proxy)** — `apps/studio/src/services/assertion-runner.ts:333-353`:
```typescript
async function queryAccountBalance(account: string): Promise<string | null> {
  try {
    const response = await networkService.fetchApi('v2', 'query', { url: account });
    ...
async function queryAccountExists(url: string): Promise<boolean> {
  try {
    const response = await networkService.fetchApi('v2', 'query', { url });
    return !response.error;
```
…and `fetchApi` resolves the endpoint from the **currently-connected UI network** — `apps/studio/src/services/network/index.ts:140-155`:
```typescript
const endpoint = version === 'v2'
  ? this.currentNetwork.v2Endpoint
  : this.currentNetwork.v3Endpoint;

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
});
```
Those endpoints are static per network — `packages/types/src/network.ts:28-29,39-40`:
```typescript
mainnet: { v2Endpoint: 'https://mainnet.accumulatenetwork.io/v2', v3Endpoint: '.../v3', proxyEndpoint: '', ... },
testnet: { v2Endpoint: 'https://testnet.accumulatenetwork.io/v2', v3Endpoint: '.../v3', proxyEndpoint: '', ... },
```

**Enrichment reads correctly use the proxy** (the model to copy) — `apps/studio/src/services/execution/index.ts:460-466`:
```typescript
// 1) Query transaction details via proxy (same network as submission)
const txResult = await api.callProxy<{ success: boolean; data?: ...; error?: string; }>(
  '/api/query-tx', { tx_hash: txHash },
);
```

**Proxy query routes also use the single pinned client** — `apps/sdk-proxy/app/routes/query.py:32-43`:
```python
@router.post("/query")
async def query_account(req: QueryRequest):
    from ..main import client
    ...
    result = client.v3.query(req.url)
```

**Fragile env precedence / mixed-content** — `apps/studio/src/services/network/api.ts:64-70`:
```typescript
private get proxyEndpoint(): string {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SDK_PROXY_URL) ||
    this.config.proxyEndpoint ||
    ''
  );
}
```
…but `apps/studio/.env.example:3` ships a **non-empty plaintext bare-IP value**, which (if used in a prod build) overrides the empty `proxyEndpoint` and bypasses the Vercel HTTPS rewrite:
```
VITE_SDK_PROXY_URL=http://116.202.214.38:8000
```

---

## 3. Root cause

The proxy was designed single-network (env-pinned), but the studio UI offers a network selector. No layer reconciles the two: the frontend never tells the proxy which network the user chose, and the proxy never tells the frontend which network it is actually on. Compounding it, the assertion/legacy read paths were written before the proxy existed and still talk to the network directly, so they follow the UI selection while submission follows the env pin. The empty-vs-nonempty `VITE_SDK_PROXY_URL` precedence makes "production must be empty" an invisible, easily-violated rule.

---

## 4. Target behavior & acceptance criteria

- [ ] The frontend sends the **user-selected network** to the proxy on every request (header `X-Accumulate-Network`).
- [ ] The proxy validates the requested network against an **allowlist of permitted networks** (env `ALLOWED_NETWORKS`, default = just the deploy network) and uses it; an out-of-allowlist network → **400**.
- [ ] **All reads used for verification** (assertion balance/exists, state diffs, tx status) go through the **proxy** (so they share the submission chain), OR are provably hitting the same network config — pick the proxy-routing approach in §5.
- [ ] `/api/health` reports the network and the frontend asserts, on connect, that the proxy network matches the selected network; a mismatch surfaces a visible warning in the execution log.
- [ ] In production builds, `VITE_SDK_PROXY_URL` is **empty**, so `/api/*` is same-origin and the Vercel HTTPS rewrite is used. `.env.example` no longer ships a plaintext bare-IP value.
- [ ] All 8 golden-path templates pass with the UI on the same network the proxy serves.

---

## 5. Implementation steps

> Approach: **(A)** pass the selected network to the proxy and have the proxy honor it (allowlisted), **(B)** route assertion reads through the proxy so reads and writes share a chain, and **(C)** add a startup consistency check. (B) is the part that actually kills the split-brain; (A) makes the proxy multi-network-capable; (C) makes drift visible.

### 5.1 Proxy: accept a per-request network (allowlisted), build clients per network

**`config.py`** — add an allowlist + a client cache helper (extends the file edited in P0-1; keep both sets of additions):
```python
def allowed_networks() -> set[str]:
    """Networks this proxy is permitted to serve. Defaults to just the deploy network."""
    raw = os.getenv("ALLOWED_NETWORKS", "")
    names = {n.strip() for n in raw.split(",") if n.strip()}
    names.add(get_network_name())            # always allow the deploy default
    # never silently allow mainnet unless ALLOW_MAINNET is set
    if "mainnet" in names and not allow_mainnet():
        names.discard("mainnet")
    return {n for n in names if n in NETWORK_ENDPOINTS}


def endpoint_for(network: str) -> str:
    return NETWORK_ENDPOINTS[network]
```

**`main.py`** — replace the single `client` with a small per-network client cache. Add:
```python
from accumulate_client import Accumulate
from .config import endpoint_for, allowed_networks, get_network_name

_clients: dict[str, Accumulate] = {}

def get_client(network: str | None) -> Accumulate:
    """Return (and cache) an Accumulate client for the requested network.

    Falls back to the deploy-time network when none is requested.
    Caller is responsible for having validated `network` against allowed_networks().
    """
    net = network or get_network_name()
    if net not in _clients:
        _clients[net] = Accumulate(endpoint_for(net))
    return _clients[net]
```
Keep the existing `client` global for `/api/health` and `/api/oracle`, or migrate those to `get_client(None)`. Close all cached clients in `lifespan`'s teardown:
```python
    yield
    for c in _clients.values():
        c.close()
```

**A FastAPI dependency to resolve+validate the network header.** Add to `auth.py` (or a new `net.py`):
```python
from fastapi import Header, HTTPException

async def request_network(x_accumulate_network: str | None = Header(default=None)) -> str:
    from .config import allowed_networks, get_network_name
    net = (x_accumulate_network or get_network_name()).strip()
    if net not in allowed_networks():
        raise HTTPException(status_code=400, detail=f"Network '{net}' not permitted by this proxy")
    return net
```

**Every route that uses `client`** — take the resolved network and use `get_client(net)` instead of the global `client`. Example, `query.py:32-43`:

Before:
```python
@router.post("/query")
async def query_account(req: QueryRequest):
    from ..main import client
    if client is None:
        return {"success": False, "error": "Client not initialized"}
    try:
        result = client.v3.query(req.url)
        return {"success": True, "data": _normalize_query_result(result)}
```
After:
```python
from fastapi import Depends
from ..auth import request_network   # or ..net import request_network

@router.post("/query")
async def query_account(req: QueryRequest, net: str = Depends(request_network)):
    from ..main import get_client
    client = get_client(net)
    try:
        result = client.v3.query(req.url)
        return {"success": True, "data": _normalize_query_result(result)}
```
Apply the same `net: str = Depends(request_network)` + `client = get_client(net)` to: `query.py` (`query_tx`, `query_directory`, `wait_for_tx`), `faucet.py`, `credits.py`, `identity.py`, `tokens.py`, `data.py`, `generic.py`. (These changes compose with P0-1's `authorization` dependency — a handler can take both.)

### 5.2 Frontend: send the selected network on every proxy call

**`api.ts`** — add the network to the headers built in P0-1's `authHeaders()` (or add it standalone if P0-1 isn't merged yet). The network comes from `this.config.id` (the `NetworkConfig` the API was constructed with — see `execution/index.ts:60` `new AccumulateAPI(networkConfig)`):
```typescript
private authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (this.sessionToken) h['Authorization'] = `Bearer ${this.sessionToken}`;
  if (this.config.id) h['X-Accumulate-Network'] = this.config.id;   // NEW
  return h;
}
```
Confirm `NetworkConfig` has an `id` field; `packages/types/src/network.ts` defines each entry with an `id` (e.g. `testnet: { id: 'testnet', ... }`). If the field is named differently, use that name.

### 5.3 Route assertion reads through the proxy (kills the split-brain)

**`assertion-runner.ts`** — stop calling `networkService.fetchApi('v2', …)`; call the proxy instead. The proxy is now network-aware (§5.1) and is the same path submissions use. The assertion runner currently has no `AccumulateAPI` handle, so pass one in.

Change the two helpers (`assertion-runner.ts:333-353`):

Before:
```typescript
async function queryAccountBalance(account: string): Promise<string | null> {
  try {
    const response = await networkService.fetchApi('v2', 'query', { url: account });
    if (response.error) return null;
    const r = response.result;
    const balance = r?.balance ?? r?.data?.balance ?? r?.creditBalance ?? r?.data?.creditBalance;
    return balance !== undefined ? String(balance) : null;
  } catch { return null; }
}

async function queryAccountExists(url: string): Promise<boolean> {
  try {
    const response = await networkService.fetchApi('v2', 'query', { url });
    return !response.error;
  } catch { return false; }
}
```
After:
```typescript
async function queryAccountBalance(api: AccumulateAPI, account: string): Promise<string | null> {
  try {
    const res = await api.callProxy<{ success: boolean; data?: Record<string, unknown> }>(
      '/api/query', { url: account },
    );
    if (!res.success || !res.data) return null;
    const d = res.data;
    const inner = (d.data && typeof d.data === 'object') ? d.data as Record<string, unknown> : {};
    const balance = d.balance ?? inner.balance ?? d.creditBalance ?? inner.creditBalance;
    return balance !== undefined ? String(balance) : null;
  } catch { return null; }
}

async function queryAccountExists(api: AccumulateAPI, url: string): Promise<boolean> {
  try {
    const res = await api.callProxy<{ success: boolean }>('/api/query', { url });
    return res.success === true;
  } catch { return false; }
}
```
Thread the `api` handle through `runAssertions` → `evaluateAssertion` → the helpers. Update the signatures:
```typescript
export async function runAssertions(
  assertions: FlowAssertion[],
  executionState: FlowExecutionState,
  api: AccumulateAPI,                 // NEW
  flowNodes?: FlowNode[],
): Promise<AssertionResult[]> { ... evaluateAssertion(resolved, executionState, api, flowNodes) ... }
```
and update each `queryAccountBalance(...)` / `queryAccountExists(...)` call site inside `evaluateAssertion` to pass `api`. Add `import { AccumulateAPI } from './network/api';` at the top. Finally, update the **caller** of `runAssertions` (search: `rg -n "runAssertions\(" apps/studio/src`) to pass the execution engine's API instance (`executionEngine.getApi()` — expose a getter that returns `this.context?.api`, or pass `new AccumulateAPI(networkService.getNetworkConfig()!)`).

> Result: assertions now read through the same proxy (same chain) that performed the submission. The remaining gap (proxy chain vs UI chain) is closed by §5.1's network header + §5.4's check.

### 5.4 Startup / connect consistency check

**`execution/index.ts`** — at the start of `executeFlow`, after building `api`, query `/api/health` and compare. Add after `const api = new AccumulateAPI(networkConfig);` (line 60):
```typescript
try {
  const health = await api.callProxyGet<{ network?: string }>('/api/health');
  if (health.network && networkConfig.id && health.network !== networkConfig.id) {
    store.addExecutionLog({
      level: 'error',
      message: `Network mismatch: UI is on "${networkConfig.id}" but proxy is on "${health.network}". `
        + `Transactions and verification may target different chains. Aborting.`,
    });
    throw new Error(`Network mismatch (UI=${networkConfig.id}, proxy=${health.network})`);
  }
} catch (err) {
  // If health is unreachable, surface but let execution proceed (proxy may still gate per-request).
  store.addExecutionLog({ level: 'warn', message: `Proxy health check failed: ${err instanceof Error ? err.message : String(err)}` });
}
```
(`store` is `useFlowStore.getState()`, already obtained at line 81 — move that retrieval above this block or fetch it again.)

Note `/api/health` already returns `network` (`main.py:74-82`) — no proxy change needed for the check, but ensure it reports the **per-request** network if you later make health network-aware. With ALLOWED_NETWORKS the proxy can serve the UI network even if the deploy default differs; in that case the check should compare against the *served* network, not the deploy default. Simplest correct rule for now: require the UI network to be in the proxy's allowlist. Replace the strict equality with:
```typescript
const allowed = await api.callProxyGet<{ allowed?: string[]; network?: string }>('/api/health');
// add `allowed_networks` to /api/health response (see below) and check membership
```
Extend `/api/health` (`main.py:73-82`) to include the allowlist:
```python
@app.get("/api/health")
async def health():
    from .config import allowed_networks
    network = get_network_name()
    payload = {"status": "ok", "network": network, "allowed": sorted(allowed_networks())}
    try:
        if client is not None:
            client.v3.network_status(NetworkStatusOptions(partition="directory"))
            payload["connected"] = True
    except Exception as e:
        payload.update(status="degraded", connected=False, error=str(e))
    return payload
```
Then the frontend check becomes "is `networkConfig.id` in `health.allowed`?".

### 5.5 Fix env precedence / mixed content

- `apps/studio/.env.example` → `VITE_SDK_PROXY_URL=` (empty; see P0-1 §5.7 for the exact comment block).
- `apps/studio/.env.development` is fine for local (`http://localhost:8000`), but document that it is **dev-only** and must not be present at Vercel build time. Add a comment:
```
# DEV ONLY — do not set VITE_SDK_PROXY_URL in the Vercel production environment.
# Production relies on same-origin /api/* + vercel.json rewrites (HTTPS).
VITE_SDK_PROXY_URL=http://localhost:8000
```
- Confirm the Vercel project has **no** `VITE_SDK_PROXY_URL` env var set (so the empty default wins and `proxyEndpoint` resolves to `''` → same-origin `/api/*`). Document this in the deploy runbook.
- `docker-compose.yml`: set `ALLOWED_NETWORKS=testnet` (and any others you intend to serve) alongside `ACCUMULATE_NETWORK`.

---

## 6. Tests

### Unit
- [ ] `allowed_networks()` returns `{deploy_network}` when `ALLOWED_NETWORKS` unset; includes extras when set; excludes `mainnet` unless `ALLOW_MAINNET=true`.
- [ ] `get_client('testnet')` and `get_client('kermit')` return distinct cached clients; `get_client(None)` returns the deploy-network client.
- [ ] `request_network` dependency: returns the header value when allowed; raises 400 when not.
- [ ] `queryAccountBalance`/`queryAccountExists` (frontend, mocked `api.callProxy`) parse both flat and nested `data` shapes.

### Integration
- [ ] `POST /api/query` with `X-Accumulate-Network: kermit` (allowed) hits the kermit client; with a disallowed network → 400.
- [ ] Frontend: with proxy `ACCUMULATE_NETWORK=testnet`, `ALLOWED_NETWORKS=testnet`, UI on **kermit** → `executeFlow` aborts with a visible "Network mismatch" log (after §5.4 allowlist check).
- [ ] Assertions for a flow run on testnet pass while reading through the proxy (no direct V2 call); confirm via network tab that no request goes to `testnet.accumulatenetwork.io/v2` during assertion phase.

### Manual QA
- [ ] Deploy proxy with `ACCUMULATE_NETWORK=testnet`. In the UI, select testnet, run "Zero to Hero" → submits + assertions both pass.
- [ ] Switch UI to a network not in `ALLOWED_NETWORKS` → execution refuses to start with the mismatch message (no silent false-failure).
- [ ] Build the studio for prod with `VITE_SDK_PROXY_URL` unset → DevTools shows `/api/*` calls go same-origin (Vercel host), not to the bare IP, and over HTTPS.

---

## 7. Risks, rollback, out of scope

**Risks**
- Routing assertion reads through the proxy adds proxy load and couples verification to proxy availability; mitigated by the proxy already being the submission path (if it's down, the flow already fails).
- Per-network client cache grows unbounded if `ALLOWED_NETWORKS` is large; it is bounded by the small fixed set in `NETWORK_ENDPOINTS`, so this is fine.
- The `X-Accumulate-Network` header must survive the Vercel rewrite. Vercel rewrites forward request headers by default; verify in staging that `X-Accumulate-Network` and `Authorization` (P0-1) both arrive at the proxy.

**Rollback**
- Revert §5.3 (assertion routing) alone to restore direct-V2 assertions; the proxy network-awareness (§5.1) and the consistency check (§5.4) are independently revertable and harmless if left in.

**Out of scope**
- Letting the proxy dynamically connect to *arbitrary* networks supplied by the client (we only allow an env-configured allowlist).
- Pre-execution balance snapshots for true `balance.delta` assertions (`assertion-runner.ts:178-200` still approximates) — that is P0-4/P0-5 work.
- The mainnet hard-block itself (owned by P0-1; this doc only refuses to *route* to mainnet via the allowlist).
