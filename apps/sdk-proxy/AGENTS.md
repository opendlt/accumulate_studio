# apps/sdk-proxy — repository guide for agents

FastAPI service that executes Accumulate transactions on Studio's behalf using the Python SDK. **This is a Python project inside a Node monorepo** — `npm test` does not cover it.

Read the [root guide](../../AGENTS.md) first.

## Setup

Toolchain: **Python 3.9+** (3.11+ recommended).

```bash
cd apps/sdk-proxy
python -m venv .venv && .venv/Scripts/activate   # POSIX: source .venv/bin/activate
pip install -e ".[dev]"
```

From the repo root, `npm run install:proxy` does the `pip install -e .` step.

## Build & run

```bash
python -m uvicorn app.main:app --reload --port 8000   # or: npm run dev:proxy
```

Studio expects the proxy on **:8000**. `npm run dev:all` starts Studio and the proxy together.

## Test

| Command | Covers | Needs network |
|---|---|:--:|
| `pytest` | unit suite | no |
| `pytest tests/integration` | live submission paths | **yes** |

## Layout

```
app/main.py         FastAPI entry point
app/routes/         endpoint handlers
app/config.py       network + environment configuration
app/auth.py         authentication
app/rate_limit.py   slowapi rate limiting
app/net.py          network selection
app/body_padding.py transaction body padding
tests/              pytest suite
Dockerfile          deployment image (not an agent workspace)
```

## Gotchas

- **Credits are scaled ×100 here, exactly once.** ACME ×1e8 happens in the codegen engine; credits ×100 happens in this proxy; the oracle price is never scaled. Adding a second multiplication anywhere produces amounts that are wrong by orders of magnitude and are hard to trace.
- **This service signs transactions.** It handles private key material. Never log a key, never echo a request body containing one, and never add a debug endpoint that returns one.
- **Depends on the published Python SDK** (`accumulate-sdk-opendlt>=2.1.0`) from PyPI, not on a local checkout. An SDK change must be published before the proxy can use it.
- **Rate limiting is deliberate.** `slowapi` limits exist because the proxy fronts a public testnet with a shared faucet. Do not remove them to make a test pass.
- **The Dockerfile is deployment infra**, not a development container. It is not a devcontainer and is not intended as an agent workspace.

## Permitted commands

Safe unattended: install, run locally, and the unit suite, all against a **testnet**.

Require a human first: deploying (`docker-compose`, the `deploy/` scripts), changing rate limits or auth, and anything targeting **mainnet**.

## Before you commit

```bash
pytest
```
