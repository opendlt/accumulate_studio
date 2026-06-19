# P0-1 — Secure the SDK Proxy (open, unauthenticated transaction-signing oracle)

| Field | Value |
|-------|-------|
| Priority | P0 |
| Severity | Critical |
| Effort | L (4–6 days) |
| Risk | Med (touches every signing endpoint + the frontend transport layer) |
| Depends on | none |
| Blocks | **Any public deploy.** Soft-blocks P1-5 (shares `config.py` network handling) and P1-7 (shares `api.ts` `callProxy`) — coordinate edits to avoid merge churn. |
| Primary files | `apps/sdk-proxy/app/main.py`, `apps/sdk-proxy/app/session_store.py`, `apps/sdk-proxy/app/config.py`, `apps/sdk-proxy/app/models.py`, `apps/sdk-proxy/app/auth.py` (new), `apps/sdk-proxy/app/routes/keys.py`, `apps/sdk-proxy/app/routes/faucet.py`, `apps/sdk-proxy/app/routes/generic.py`, `apps/sdk-proxy/app/routes/identity.py`, `apps/sdk-proxy/app/routes/{credits,tokens,data,query}.py`, `apps/sdk-proxy/requirements.txt`, `apps/sdk-proxy/docker-compose.yml`, `apps/sdk-proxy/Caddyfile` (new), `vercel.json`, `apps/studio/src/services/network/api.ts`, `apps/studio/src/services/execution/index.ts`, `apps/studio/src/services/execution/node-executor.ts`, `apps/studio/.env.example` |

---

## 1. Problem & impact

The FastAPI service in `apps/sdk-proxy` generates **raw Ed25519 / secp256k1 private keys**, holds them in process memory, and will **sign and submit any transaction** on behalf of any caller. Today there is:

- **No authentication** on any route. Anyone who can reach `http://116.202.214.38:8000` can call `/api/generate-keys` then `/api/sign-and-submit` and have the proxy sign arbitrary transactions.
- **`CORS allow_origins=["*"]`** (`main.py:53`) on a key-signing backend, so any web page in any browser can drive it.
- **A process-global, never-evicted key store** (`session_store.py:69` — `_sessions` is a *class* attribute), so every private key ever generated stays resident until the process restarts. This is an unbounded memory leak and a fat target for a memory-dump compromise.
- **Mainnet reachable** (`config.py:6`) by simply setting `ACCUMULATE_NETWORK=mainnet`, with no guard — one env typo turns the toy into a mainnet-signing oracle.
- **Plaintext HTTP to a bare IP** (`vercel.json:7` → `http://116.202.214.38:8000`). Keys-in-flight and tx bodies traverse the network unencrypted; the Vercel front-end is HTTPS so this is also a mixed-content failure waiting to happen.
- **No rate limiting**; the faucet loops `req.times` with no cap (`faucet.py:20`, `models.py:46`), and `sign-and-submit` is unbounded.
- **Full public-key hex logged at WARNING** (`generic.py:237-247`, `identity.py:38-45`) — noisy and a (minor) info leak in shared logs.
- **Unvalidated `tx_type` passthrough** (`generic.py:85-115`, `models.py:139-145`) — any string is fed to `get_builder_for()` / the bypass path.

**Impact:** the proxy is a credential-minting, transaction-signing oracle open to the internet. On testnet this is "merely" a resource-abuse / spam vector. The moment `ACCUMULATE_NETWORK` is flipped (or the same image is reused for a real deployment) it becomes a direct theft vector.

### Threat model — before / after

| Threat | Before | After |
|--------|--------|-------|
| Anonymous caller signs arbitrary tx | **Open** — no auth | Requires a per-session bearer token bound to the session that created the key |
| Cross-origin web page drives the proxy | **Open** — `allow_origins=["*"]` | Blocked — CORS restricted to `ALLOWED_ORIGINS` |
| Keys accumulate forever in memory | **Yes** — class-level dict, no eviction | Instance store, TTL eviction, hard session cap, explicit logout |
| Mainnet signing | **Reachable** via env | Hard-blocked unless `ALLOW_MAINNET=true` |
| Keys/tx bodies sniffed in transit | **Yes** — plaintext HTTP to bare IP | TLS via Caddy + Let's Encrypt, HTTPS rewrite |
| Faucet / signing flood | **Unbounded** | Per-IP rate limits (slowapi); `times` capped |
| Pubkey hex in shared logs | **WARNING** always | DEBUG, gated behind `PROXY_DEBUG_LOGGING` |
| Arbitrary `tx_type` | **Passthrough** | Allowlisted; 422 on unknown type |

---

## 2. Evidence (current code)

**CORS wide open** — `apps/sdk-proxy/app/main.py:51-56`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Class-level, never-evicted key store** — `apps/sdk-proxy/app/session_store.py:62-81`:
```python
class SessionStore:
    """In-memory keypair storage keyed by session_id (browser tab)."""

    _sessions: dict[str, AlgoKeypair] = {}     # <-- CLASS attribute, shared across instances

    def store(self, session_id: str, keypair: AlgoKeypair) -> None:
        self._sessions[session_id] = keypair

    def get(self, session_id: str) -> AlgoKeypair | None:
        return self._sessions.get(session_id)

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def has(self, session_id: str) -> bool:
        return session_id in self._sessions
```
There is no TTL, no cap, and no route ever calls `remove()`.

**No auth on signing** — `apps/sdk-proxy/app/routes/generic.py:85-94` (representative of every signing route):
```python
@router.post("/sign-and-submit", response_model=TxResponse)
async def sign_and_submit(req: SignAndSubmitRequest):
    from ..main import store, client
    if client is None:
        return TxResponse(success=False, error="Client not initialized")
    kp = store.get(req.session_id)            # session_id is attacker-chosen, unauthenticated
    if not kp:
        return TxResponse(success=False, error="No keypair for session")
```

**Mainnet reachable, default testnet, no guard** — `apps/sdk-proxy/app/config.py:5-17`:
```python
NETWORK_ENDPOINTS = {
    "mainnet": "https://mainnet.accumulatenetwork.io",
    "testnet": "https://testnet.accumulatenetwork.io",
    ...
}
def get_network_endpoint() -> str:
    network = os.getenv("ACCUMULATE_NETWORK", "testnet")
    return NETWORK_ENDPOINTS.get(network, NETWORK_ENDPOINTS["testnet"])
```

**Plaintext HTTP to bare IP** — `vercel.json:6-8`:
```json
"rewrites": [
  { "source": "/api/:path*", "destination": "http://116.202.214.38:8000/api/:path*" }
]
```

**Unbounded faucet loop** — `apps/sdk-proxy/app/routes/faucet.py:19-29` and `apps/sdk-proxy/app/models.py:44-46`:
```python
for i in range(req.times):       # req.times has no upper bound
    result = client.faucet(req.account)
    ...
    if i < req.times - 1:
        time.sleep(1)
```
```python
class FaucetRequest(SessionRequest):
    account: str
    times: int = 1               # no ge/le constraint
```

**Full pubkey hex at WARNING** — `apps/sdk-proxy/app/routes/generic.py:237-247`:
```python
logger.warning(
    "sign-and-submit: tx_type=%s principal=%s signer_url=%s "
    "algo=%s sig_type=%d pub_key=%s pub_key_hash=%s "
    "body_keys=%s body_type=%s",
    req.tx_type, req.principal, signer_url,
    algo, sig_type,
    pub_bytes.hex(),               # <-- full public key hex at WARNING
    pub_key_hash,
    ...
)
```
…and `apps/sdk-proxy/app/routes/identity.py:38-45`:
```python
logger.warning(
    "create-identity: url=%s key_book_url=%s pub_key=%s "
    "pub_key_hash=%s principal=%s signer_url=%s",
    req.url, key_book_url,
    kp.public_key_bytes().hex(),   # <-- full public key hex at WARNING
    pub_key_hash, principal, signer_url,
)
```

**Unvalidated tx_type** — `apps/sdk-proxy/app/models.py:139-145` + `generic.py:96-105`:
```python
class SignAndSubmitRequest(SessionRequest):
    tx_type: str                  # any string
    principal: str
    signer_url: str | None = None
    fields: dict
    ...
```

**Frontend transport (must send the token)** — `apps/studio/src/services/network/api.ts:75-86`:
```typescript
async callProxy<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${this.proxyEndpoint}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  ...
}
```

---

## 3. Root cause

The proxy was written as a single-developer local tool ("for development use only", `session_store.py:65`) and then exposed to the public internet via Vercel rewrites without adding any of the controls a key-custody service needs: authentication, transport security, network guardrails, resource limits, or memory hygiene. The `session_id` is treated as both an *identifier* and an *authenticator*, but it is generated client-side (`crypto.randomUUID()` in `execution/index.ts:57`) and sent in the request body, so it authenticates nothing.

---

## 4. Target behavior & acceptance criteria

- [ ] CORS allows **only** the studio origin(s) listed in `ALLOWED_ORIGINS`; a request from any other `Origin` is rejected by the browser preflight.
- [ ] `/api/generate-keys` returns a **bearer token**; the token is required (`Authorization: Bearer <token>`) on **every** signing/faucet/credits route and is bound to the `session_id` that minted it.
- [ ] A request with a missing/invalid token, or a token whose session does not match the body `session_id`, returns **401**.
- [ ] The session store is **instance-scoped** (not a class attribute), evicts entries after `SESSION_TTL_SECONDS` of inactivity, and rejects new sessions once `MAX_SESSIONS` is reached (**429**).
- [ ] A new `POST /api/logout` route removes the session + key and is called by the frontend when execution ends (success, failure, or Stop).
- [ ] When `ALLOW_MAINNET` is false (default) and `ACCUMULATE_NETWORK=mainnet`, the app **fails to start** (or every signing route returns 403). It must be impossible to sign a mainnet tx by accident.
- [ ] Production traffic reaches the proxy over **HTTPS** via a DNS name (`proxy.example.com`) terminated by Caddy/Let's Encrypt; `vercel.json` rewrites to `https://…`, not the bare IP.
- [ ] Per-IP rate limits apply: `generate-keys`, `sign-and-submit`, `faucet`, and the other signing routes are throttled; `FaucetRequest.times` is capped at `MAX_FAUCET_TIMES` (default 5).
- [ ] Full public-key hex is logged only at `DEBUG` and only when `PROXY_DEBUG_LOGGING=true`.
- [ ] `tx_type` is validated against an allowlist; unknown types return **422** before any signing work.
- [ ] All existing 8 golden-path templates still pass end-to-end against testnet through the secured proxy.

---

## 5. Implementation steps

> Order matters: do **5.1 (config) → 5.2 (session store) → 5.3 (auth) → 5.4 (routes) → 5.5 (rate limit) → 5.6 (logging/validation) → 5.7 (frontend) → 5.8 (TLS/deploy)**. After each backend step, restart uvicorn and hit `/api/health`.

### 5.1 Harden `config.py` (network allowlist + mainnet guard)

**File:** `apps/sdk-proxy/app/config.py` — replace the whole file.

```python
"""Network configuration for the SDK proxy."""

import os

NETWORK_ENDPOINTS = {
    "mainnet": "https://mainnet.accumulatenetwork.io",
    "testnet": "https://testnet.accumulatenetwork.io",
    "devnet": "https://devnet.accumulatenetwork.io",
    "kermit": "https://kermit.accumulatenetwork.io",
    "local": "http://localhost:26660",
}


def _env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def allow_mainnet() -> bool:
    return _env_bool("ALLOW_MAINNET", False)


def get_network_name() -> str:
    return os.getenv("ACCUMULATE_NETWORK", "testnet")


def assert_network_allowed() -> None:
    """Raise at startup if a forbidden network is configured."""
    network = get_network_name()
    if network not in NETWORK_ENDPOINTS:
        raise RuntimeError(
            f"ACCUMULATE_NETWORK='{network}' is not a known network "
            f"{sorted(NETWORK_ENDPOINTS)}"
        )
    if network == "mainnet" and not allow_mainnet():
        raise RuntimeError(
            "Refusing to start on mainnet. Set ALLOW_MAINNET=true to override "
            "(you almost certainly do not want this)."
        )


def get_network_endpoint() -> str:
    """Get the Accumulate network endpoint (call assert_network_allowed first)."""
    network = get_network_name()
    return NETWORK_ENDPOINTS.get(network, NETWORK_ENDPOINTS["testnet"])


def is_mainnet() -> bool:
    return get_network_name() == "mainnet"


def allowed_origins() -> list[str]:
    """Comma-separated list of allowed browser origins. Empty => deny all cross-origin."""
    raw = os.getenv("ALLOWED_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]
```

### 5.2 Instance-scoped session store with TTL + cap

**File:** `apps/sdk-proxy/app/session_store.py` — replace the `SessionStore` class (keep `AlgoKeypair` unchanged). Add a `token` field to each stored record.

```python
"""In-memory keypair session storage (development / single-instance only)."""

from __future__ import annotations

import os
import secrets
import threading
import time
from dataclasses import dataclass


@dataclass
class _SessionEntry:
    keypair: "AlgoKeypair"
    token: str
    created_at: float
    last_seen: float


class SessionStore:
    """Instance-scoped keypair storage keyed by session_id.

    Adds: per-instance state (NOT a class attribute), a bearer token bound to
    each session, TTL eviction, and a hard session cap. Single-process only —
    a multi-worker deploy needs a shared store (out of scope, see §7).
    """

    def __init__(self) -> None:
        self._sessions: dict[str, _SessionEntry] = {}
        self._lock = threading.Lock()
        self._ttl = int(os.getenv("SESSION_TTL_SECONDS", "1800"))      # 30 min idle
        self._max = int(os.getenv("MAX_SESSIONS", "500"))

    # -- internal ------------------------------------------------------------

    def _evict_expired(self, now: float) -> None:
        dead = [sid for sid, e in self._sessions.items() if now - e.last_seen > self._ttl]
        for sid in dead:
            self._sessions.pop(sid, None)

    # -- public API ----------------------------------------------------------

    def create(self, session_id: str, keypair: "AlgoKeypair") -> str:
        """Store a keypair and return a freshly minted bearer token."""
        now = time.time()
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._evict_expired(now)
            if session_id not in self._sessions and len(self._sessions) >= self._max:
                raise SessionCapExceeded()
            self._sessions[session_id] = _SessionEntry(
                keypair=keypair, token=token, created_at=now, last_seen=now,
            )
        return token

    def get(self, session_id: str) -> "AlgoKeypair | None":
        now = time.time()
        with self._lock:
            self._evict_expired(now)
            entry = self._sessions.get(session_id)
            if entry is None:
                return None
            entry.last_seen = now
            return entry.keypair

    def verify_token(self, session_id: str, token: str) -> bool:
        with self._lock:
            entry = self._sessions.get(session_id)
            if entry is None:
                return False
            ok = secrets.compare_digest(entry.token, token)
            if ok:
                entry.last_seen = time.time()
            return ok

    def remove(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def has(self, session_id: str) -> bool:
        with self._lock:
            return session_id in self._sessions


class SessionCapExceeded(Exception):
    """Raised when MAX_SESSIONS is reached."""
```

> NOTE: `keys.py` currently calls `store.store(...)` — that method no longer exists. It is updated in §5.4. Search the repo for `.store(` to confirm `keys.py` is the only caller (`rg -n "store\.store\(" apps/sdk-proxy`).

### 5.3 Auth dependency

**New file:** `apps/sdk-proxy/app/auth.py`.

```python
"""Per-session bearer-token authentication for signing routes."""

from fastapi import Header, HTTPException


def require_session_token(session_id: str, authorization: str | None) -> None:
    """Validate that the Authorization bearer token belongs to session_id.

    Raises 401 on any mismatch. Import `store` lazily to avoid a circular import
    with main.py (same pattern the routes already use for `store`/`client`).
    """
    from .main import store

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not store.verify_token(session_id, token):
        raise HTTPException(status_code=401, detail="Invalid session token")


async def auth_header(authorization: str | None = Header(default=None)) -> str | None:
    """FastAPI dependency that simply surfaces the Authorization header."""
    return authorization
```

### 5.4 Wire auth + token minting into the routes

**`keys.py`** — mint and return the token. Replace lines `119-152`:

Before:
```python
@router.post("/generate-keys", response_model=GenerateKeysResponse)
async def generate_keys(req: GenerateKeysRequest):
    from ..main import store
    ...
    if req.store_as_signer:
        store.store(req.session_id, wrapper)

    return GenerateKeysResponse(
        algorithm=algo,
        public_key=pub_bytes.hex(),
        lite_identity=lid,
        lite_token_account=lta,
        public_key_hash=pub_key_hash_hex,
    )
```

After:
```python
@router.post("/generate-keys", response_model=GenerateKeysResponse)
async def generate_keys(req: GenerateKeysRequest):
    from ..main import store
    from ..session_store import SessionCapExceeded
    ...
    token = None
    if req.store_as_signer:
        try:
            token = store.create(req.session_id, wrapper)
        except SessionCapExceeded:
            from fastapi import HTTPException
            raise HTTPException(status_code=429, detail="Server session limit reached; try again later")

    return GenerateKeysResponse(
        algorithm=algo,
        public_key=pub_bytes.hex(),
        lite_identity=lid,
        lite_token_account=lta,
        public_key_hash=pub_key_hash_hex,
        token=token,
    )
```

Add `token` to the response model — **`models.py:32-37`**:
```python
class GenerateKeysResponse(BaseModel):
    algorithm: str
    public_key: str
    lite_identity: str
    lite_token_account: str
    public_key_hash: str
    token: str | None = None      # NEW: bearer token for this session
```

> If a secondary `generate-keys` call is made with `store_as_signer=false` (rotation case, see `node-executor.ts:138-154`), no token is minted; the existing session token continues to be used. The frontend must keep the first token (see §5.7).

**Every signing/faucet/credits route** — add the auth dependency. Pattern, shown for `generic.py:85-94`:

Before:
```python
from ..models import SignAndSubmitRequest, TxResponse

@router.post("/sign-and-submit", response_model=TxResponse)
async def sign_and_submit(req: SignAndSubmitRequest):
    from ..main import store, client
    if client is None:
        return TxResponse(success=False, error="Client not initialized")
    kp = store.get(req.session_id)
```

After:
```python
from fastapi import Depends
from ..models import SignAndSubmitRequest, TxResponse
from ..auth import auth_header, require_session_token
from ..config import is_mainnet, allow_mainnet

ALLOWED_TX_TYPES = {
    "CreateIdentity", "CreateKeyBook", "CreateKeyPage",
    "CreateTokenAccount", "CreateDataAccount", "CreateToken",
    "SendTokens", "IssueTokens", "BurnTokens",
    "AddCredits", "TransferCredits", "BurnCredits",
    "WriteData", "WriteDataTo",
    "UpdateKeyPage", "UpdateKey", "LockAccount", "UpdateAccountAuth",
}

@router.post("/sign-and-submit", response_model=TxResponse)
async def sign_and_submit(req: SignAndSubmitRequest, authorization: str | None = Depends(auth_header)):
    from ..main import store, client
    require_session_token(req.session_id, authorization)            # 401 if bad
    if is_mainnet() and not allow_mainnet():
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Mainnet signing is disabled")
    if req.tx_type not in ALLOWED_TX_TYPES:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"Unsupported tx_type '{req.tx_type}'")
    if client is None:
        return TxResponse(success=False, error="Client not initialized")
    kp = store.get(req.session_id)
```

Apply the same two lines —
```python
authorization: str | None = Depends(auth_header)
...
require_session_token(req.session_id, authorization)
```
— to the handlers in: `faucet.py` (`request_faucet`), `credits.py` (`add_credits`), `identity.py` (`create_identity`), `tokens.py` (`send_tokens`, `create_token_account`), `data.py` (`create_data_account`, `write_data`, `write_data_to`). The query routes (`query.py`) are reads and may stay token-optional (they don't sign), but they still must honor the mainnet guard if you choose to gate reads — leave them open for now since P1-5 routes reads through the proxy.

**New logout route** — append to `keys.py`:
```python
from ..models import SessionRequest

@router.post("/logout")
async def logout(req: SessionRequest, authorization: str | None = Depends(auth_header)):
    from ..main import store
    # Best-effort: only remove if the token matches, but never 401 a logout.
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if store.verify_token(req.session_id, token):
            store.remove(req.session_id)
    return {"ok": True}
```
(`from fastapi import Depends` and `from ..auth import auth_header` at the top of `keys.py`.)

### 5.5 Rate limiting (slowapi) + faucet cap

Add to `apps/sdk-proxy/requirements.txt`:
```
slowapi>=0.1.9
```

Cap `times` in `models.py:44-46`:
```python
from pydantic import BaseModel, Field

class FaucetRequest(SessionRequest):
    account: str
    times: int = Field(default=1, ge=1, le=5)     # MAX_FAUCET_TIMES
```

Wire slowapi in `main.py`. Add near the top after the existing imports:
```python
import os
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from .config import assert_network_allowed, allowed_origins

limiter = Limiter(key_func=get_remote_address, default_limits=[os.getenv("RATE_LIMIT_DEFAULT", "120/minute")])
```
In the `lifespan` function, assert the network before constructing the client:
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    global client
    assert_network_allowed()                  # NEW: fail fast on mainnet/unknown
    client = Accumulate(get_network_endpoint())
    yield
    if client is not None:
        client.close()
```
After `app = FastAPI(...)`:
```python
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```
Replace the CORS block (`main.py:51-56`):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),          # from ALLOWED_ORIGINS env
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
```
Decorate the hot routes. slowapi requires the handler signature to include `request: Request`. Example for `keys.py` generate-keys:
```python
from fastapi import Request
from ..main import limiter

@router.post("/generate-keys", response_model=GenerateKeysResponse)
@limiter.limit(os.getenv("RATE_LIMIT_GENERATE", "20/minute"))
async def generate_keys(request: Request, req: GenerateKeysRequest):
    ...
```
Do the same (`request: Request` first param + `@limiter.limit(...)`) on `sign_and_submit`, `request_faucet` (`"10/minute"`), `add_credits`, `send_tokens`. (Importing `limiter` from `..main` is safe — routes already import `store`/`client` from `..main` lazily; do the `limiter` import at module top of each route file, it is created before routers are included.)

### 5.6 Demote pubkey logging behind a flag

In `generic.py` (replace the `logger.warning(...)` at `237-247`) and `identity.py` (`38-45`), gate on an env flag and use `debug`:
```python
import os
DEBUG_LOG = os.getenv("PROXY_DEBUG_LOGGING", "false").strip().lower() in ("1", "true", "yes", "on")
...
if DEBUG_LOG:
    logger.debug("sign-and-submit: tx_type=%s principal=%s ... pub_key=%s ...",
                 req.tx_type, req.principal, ..., pub_bytes.hex(), ...)
```
Also demote the other `logger.warning(...)` calls in `generic.py` (`145-150`, `195-198`, `223-227`) to `logger.debug` so normal operation is quiet. Configure the root logger level from `PROXY_LOG_LEVEL` (default `INFO`) in `main.py`.

### 5.7 Frontend: send the token on every proxy call

**`apps/studio/src/services/network/api.ts`** — store the token on the API instance and attach it. Add a field + setter and update `callProxy`/`callProxyGet` (lines `54-100`):
```typescript
export class AccumulateAPI {
  private config: NetworkConfig;
  private sessionToken: string | null = null;        // NEW

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  setSessionToken(token: string | null): void {       // NEW
    this.sessionToken = token;
  }

  private authHeaders(): Record<string, string> {     // NEW
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.sessionToken) h['Authorization'] = `Bearer ${this.sessionToken}`;
    return h;
  }

  async callProxy<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.proxyEndpoint}${path}`, {
      method: 'POST',
      headers: this.authHeaders(),                     // was { 'Content-Type': ... }
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Proxy error ${response.status}: ${text}`);
    }
    return response.json();
  }
```
(Apply `headers: this.authHeaders()` to `callProxyGet` too.)

**`node-executor.ts`** — capture the token returned by `generate-keys` and push it onto the API. In `executeGenerateKeys` (lines `144-170`), extend the response type and call the setter:
```typescript
const result = await this.api.callProxy<{
  algorithm: string;
  public_key: string;
  lite_identity: string;
  lite_token_account: string;
  public_key_hash: string;
  token?: string;                  // NEW
}>('/api/generate-keys', {
  session_id: this.sessionId,
  algorithm: (config.algorithm || 'Ed25519').toLowerCase(),
  store_as_signer: !hasExistingKeypair,
});

if (result.token) {
  this.api.setSessionToken(result.token);   // NEW: only the primary key mints a token
}
```

**`execution/index.ts`** — call logout when execution ends, so keys are evicted promptly. In `cleanup()` (lines `614-621`) is too late (context already gone); instead add a best-effort logout in `executeFlow`'s `finally` and in `stopExecution`. Minimal version — add a private helper and call it:
```typescript
private async logoutSession(): Promise<void> {
  if (!this.context) return;
  try {
    await this.context.api.callProxy('/api/logout', { session_id: this.context.sessionId });
  } catch {
    /* best-effort */
  }
}
```
Call `await this.logoutSession();` at the end of the `try` and the `catch` in `executeFlow` (after status is set), and (fire-and-forget) `void this.logoutSession();` inside `stopExecution()` before `this.cleanup()`.

**`apps/studio/.env.example`** — fix the shipped bare-IP/plaintext value (also see P1-5). It must be **empty** in production so Vercel rewrites handle routing:
```
# SDK Proxy URL.
# PRODUCTION: leave EMPTY so requests use same-origin /api/* (handled by Vercel rewrites → HTTPS proxy).
# LOCAL DEV: set to http://localhost:8000
VITE_SDK_PROXY_URL=
```

### 5.8 TLS, DNS, and HTTPS rewrite

1. Point a DNS A record `proxy.example.com → 116.202.214.38`.
2. Run Caddy in front of uvicorn. **New file** `apps/sdk-proxy/Caddyfile`:
```caddyfile
proxy.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:8000
    header {
        -Server
        Strict-Transport-Security "max-age=31536000"
    }
}
```
3. Add Caddy to `apps/sdk-proxy/docker-compose.yml` and stop publishing 8000 to the host:
```yaml
services:
  sdk-proxy:
    build: .
    container_name: accumulate-sdk-proxy
    restart: unless-stopped
    expose:
      - "8000"                       # internal only; no host port mapping
    environment:
      - ACCUMULATE_NETWORK=testnet
      - ALLOW_MAINNET=false
      - ALLOWED_ORIGINS=https://your-studio.vercel.app
      - SESSION_TTL_SECONDS=1800
      - MAX_SESSIONS=500
      - PROXY_DEBUG_LOGGING=false
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
```
4. Rewrite `vercel.json:6-8` to the HTTPS DNS name:
```json
"rewrites": [
  { "source": "/api/:path*", "destination": "https://proxy.example.com/api/:path*" }
]
```

---

## 6. Tests

### Unit (pytest, `apps/sdk-proxy/tests/`)
- [ ] `SessionStore.create` returns a token; `verify_token` is true for the right token, false for a wrong one / unknown session.
- [ ] `SessionStore` evicts an entry after `last_seen` exceeds `SESSION_TTL_SECONDS` (monkeypatch `time.time`).
- [ ] `SessionStore.create` raises `SessionCapExceeded` at `MAX_SESSIONS`.
- [ ] `assert_network_allowed()` raises when `ACCUMULATE_NETWORK=mainnet` and `ALLOW_MAINNET` unset; passes when `ALLOW_MAINNET=true`.
- [ ] `FaucetRequest(times=99)` raises a Pydantic validation error.

### Integration (FastAPI `TestClient`)
- [ ] `POST /api/sign-and-submit` without `Authorization` → 401.
- [ ] `POST /api/generate-keys` → 200 with `token`; reusing that token on `/api/add-credits` with the **same** `session_id` → not 401; with a **different** `session_id` → 401.
- [ ] `OPTIONS` preflight from a disallowed `Origin` is not granted (`access-control-allow-origin` absent / not the foreign origin).
- [ ] `tx_type="Nonsense"` → 422.
- [ ] Hammer `/api/faucet` past the limit → 429.
- [ ] `POST /api/logout` removes the session (`store.has` false afterward).

### Manual QA
- [ ] Bring up `docker-compose up`; `curl https://proxy.example.com/api/health` returns `{"status":"ok",...}` over TLS (valid cert).
- [ ] `curl http://116.202.214.38:8000/...` is **unreachable** from outside (no host port).
- [ ] Run all 8 golden-path templates from the deployed studio → all pass (proves token wiring + CORS work end-to-end).
- [ ] Set `ACCUMULATE_NETWORK=mainnet` (without `ALLOW_MAINNET`) → container fails to start with the refusal message.
- [ ] Grep proxy logs after a run: no full pubkey hex at INFO/WARNING.

---

## 7. Risks, rollback, out of scope

**Risks**
- The token now gates every call; a wiring miss in the frontend breaks *all* flows. Mitigate by testing all 8 templates (see QA) before merge.
- slowapi limits are per-IP; behind Vercel's rewrite the proxy sees Vercel/Caddy as the client IP. Configure Caddy to set `X-Forwarded-For` and use a `key_func` that honors it, or apply limits at Caddy instead. Validate the effective client IP in staging.

**Rollback**
- Each step is independently revertable. The auth dependency is the only change that alters request contracts; reverting `auth.py` + the `require_session_token` calls + the frontend token wiring restores the old behavior. Keep the TLS/Caddy work (5.8) even on rollback — it has no contract impact.

**Out of scope**
- Multi-worker / horizontally-scaled session store (current store is single-process; a Redis-backed store is a follow-up). Run uvicorn with a single worker until then.
- Encrypting keys at rest / HSM custody.
- Replacing the "proxy signs on the user's behalf" architecture with client-side signing (the correct long-term fix).
- P1-5's network-per-request handling and P1-7's timeouts (separate docs), though they touch the same files — coordinate the `api.ts` and `config.py` edits.
