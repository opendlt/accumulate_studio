# Accumulate Studio SDK Proxy

FastAPI-based proxy service that uses the official Accumulate Python SDK (`accumulate-sdk-opendlt`) for proper transaction building, signing, and submission.

## Why a Proxy?

The browser-based studio cannot perform correct Accumulate transaction signing directly. Accumulate requires binary-encoded transactions with specific TLV/varint encoding, which the Python SDK handles correctly. This proxy bridges the gap until a native TypeScript/JS SDK is available.

## Setup

```bash
# Install dependencies
pip install -e .

# Or with pip directly
pip install -r requirements.txt
```

## Running

```bash
# Development (with auto-reload)
uvicorn app.main:app --reload --port 8000

# Or from the monorepo root
npm run dev:proxy
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check + network connectivity |
| `/api/oracle` | GET | Get credit oracle price |
| `/api/generate-keys` | POST | Generate Ed25519 keypair |
| `/api/faucet` | POST | Request testnet tokens |
| `/api/add-credits` | POST | Add credits to key page |
| `/api/create-identity` | POST | Create ADI |
| `/api/create-token-account` | POST | Create token account |
| `/api/send-tokens` | POST | Send tokens |
| `/api/create-data-account` | POST | Create data account |
| `/api/write-data` | POST | Write data to account |
| `/api/query` | POST | Query account state |
| `/api/query-tx` | POST | Query transaction status |
| `/api/query-directory` | POST | List ADI directory entries |
| `/api/sign-and-submit` | POST | Generic: any tx type |
| `/api/wait-for-tx` | POST | Poll for tx delivery |
| `/api/logout` | POST | Evict a session's signing key |

## Security model

This proxy mints and holds raw signing keys, so every signing route is gated:

- **Per-session bearer token.** `/api/generate-keys` returns a `token` bound to the
  `session_id`. Every signing/faucet route requires `Authorization: Bearer <token>` and
  rejects a mismatch with **401**. The studio wires this automatically.
- **Session lifecycle.** Keys live in an instance-scoped store, are evicted after
  `SESSION_TTL_SECONDS` of inactivity, are capped at `MAX_SESSIONS` (**429** beyond), and
  are removed promptly via `/api/logout` when a run ends.
- **CORS lockdown.** `ALLOWED_ORIGINS` (comma-separated) restricts browser origins. The
  studio calls the proxy same-origin via the Vercel rewrite, so production is unaffected by
  a strict list. Defaults to localhost dev origins when unset.
- **Mainnet guard.** The app refuses to start on `mainnet` unless `ALLOW_MAINNET=true`, and
  signing routes return **403** on mainnet regardless.
- **Rate limiting.** Per-IP limits (`RATE_LIMIT_*`) throttle key generation, faucet, and
  signing; `faucet.times` is capped at 5.
- **tx_type allowlist.** `/api/sign-and-submit` rejects unknown transaction types with **422**.
- **Log hygiene.** Public-key material is logged only at DEBUG behind `PROXY_DEBUG_LOGGING=true`.

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `ACCUMULATE_NETWORK` | `testnet` | `mainnet`/`testnet`/`devnet`/`kermit`/`local` |
| `ALLOW_MAINNET` | `false` | Must be `true` to run/sign on mainnet |
| `ALLOWED_ORIGINS` | dev origins | Comma-separated CORS allowlist |
| `SESSION_TTL_SECONDS` | `1800` | Idle eviction window for session keys |
| `MAX_SESSIONS` | `500` | Hard cap on concurrent sessions |
| `PROXY_DEBUG_LOGGING` | `false` | Enable verbose key/body DEBUG logs |
| `PROXY_LOG_LEVEL` | `INFO` | Root log level |
| `RATE_LIMIT_ENABLED` | `true` | Toggle rate limiting |
| `RATE_LIMIT_DEFAULT` / `_GENERATE` / `_FAUCET` / `_SIGN` | `120` / `20` / `10` / `60` per minute | Per-route limits |
| `PROXY_DOMAIN` | `116-202-214-38.sslip.io` | Caddy TLS hostname (compose) |

> Single-process only: the session store is in-memory. Run uvicorn with **one worker**
> until a shared store (e.g. Redis) is added.

## Production deployment (TLS)

The studio's `vercel.json` rewrites `/api/*` to `https://116-202-214-38.sslip.io`, so the
proxy must be reachable over HTTPS at that name. `PROXY_DOMAIN` /
[sslip.io](https://sslip.io) resolves to the host's public IP, so **no domain purchase is
required**; replace it if you own a DNS name pointed at the host.

The proxy container always listens on `127.0.0.1:8000` only — TLS is terminated by a
reverse proxy in front of it. Pick the one that matches your host:

### Option A — existing nginx (shared host)

When nginx already terminates TLS for other sites on the host:

```bash
cd apps/sdk-proxy
docker compose up -d --build          # rebuilds the proxy on 127.0.0.1:8000

cp deploy/nginx-sdk-proxy.conf.example /etc/nginx/sites-available/116-202-214-38.sslip.io
ln -s /etc/nginx/sites-available/116-202-214-38.sslip.io /etc/nginx/sites-enabled/
certbot --nginx -d 116-202-214-38.sslip.io     # provisions the cert + 443 server block
nginx -t && systemctl reload nginx
curl https://116-202-214-38.sslip.io/api/health
```

### Option B — Caddy (dedicated host, ports 80/443 free)

```bash
cd apps/sdk-proxy
docker compose -f docker-compose.caddy.yml up -d --build   # proxy (internal) + Caddy on :80/:443
curl https://116-202-214-38.sslip.io/api/health
```

**Deploy order matters either way:** the proxy + TLS must be live *before or together with*
the frontend deploy, or the studio's API calls fail until the server is up. The host must
allow inbound :80 and :443.

## Architecture

```
Browser (React/Vite)
    | fetch('/api/...')
SDK Proxy (FastAPI + Python SDK)
    | accumulate_client V3 JSON-RPC
Accumulate Network
```

Session-based keypair management stores keypairs in memory keyed by session ID, each
protected by a bearer token, evicted on TTL/logout, and capped by `MAX_SESSIONS`. See the
**Security model** section above. Keys are never persisted to disk; this remains a
testnet-oriented design (it signs on the user's behalf) — client-side signing is the
intended long-term replacement.
