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

## Configuration

Set the `ACCUMULATE_NETWORK` environment variable to select the network:

- `mainnet` - Production
- `testnet` - Public test network (default)
- `devnet` - Development network
- `kermit` - Kermit test network
- `local` - Local development node (localhost:26660)

## Architecture

```
Browser (React/Vite)
    | fetch('/api/...')
SDK Proxy (FastAPI + Python SDK)
    | accumulate_client V3 JSON-RPC
Accumulate Network
```

Session-based keypair management stores Ed25519 keypairs in memory keyed by browser session ID. This is for development only.
