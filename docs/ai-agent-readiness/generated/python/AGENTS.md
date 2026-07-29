# opendlt-python-v2v3-sdk — repository guide for agents

The Python SDK for the Accumulate blockchain. Published as `accumulate-sdk-opendlt` (v2.3.0).

> **The project root is `unified/`, not the repository root.** Run every command below from there unless stated otherwise.

> Building **on** Accumulate rather than **on this SDK**? You want `llms.txt` (quickstart + rules) and `llms-full.txt` (full API). This file is about working on the SDK itself.

## Setup

Toolchain: **Python 3.11+**

```bash
cd unified
python -m venv .venv && .venv/Scripts/activate  # POSIX: source .venv/bin/activate
pip install -e ".[dev]"
```

## Build

```bash
pip install -e .   # pure Python; no separate build step
```

## Test

| Command | Covers | Needs network |
|---|---|:--:|
| `pytest` | unit suite | no |
| `pytest unified/tests/integration` | integration suite | **yes** |

Network-dependent suites talk to a live testnet. If they fail while the unit suite passes, suspect the network before suspecting your change.

## Lint & format

```bash
ruff check .
ruff format --check .
```

## Layout

```
unified/src/accumulate_client/  the package (this is the real project root)
unified/tests/                  test suite
examples/                       runnable end-to-end examples
pyproject.toml (root)           a STUB — see gotchas
```

## Gotchas

- The repo-root `pyproject.toml` declares `name = "accumulate-client"`, `version = "0.0.0"`. That is a stub. The real package is `accumulate-sdk-opendlt` defined in `unified/pyproject.toml`. Always work from `unified/`.
- Root `pytest.ini` sets `testpaths = unified/tests` with `--import-mode=importlib`, so bare `pytest` from the repo root does find the right tests.
- The package exports both the canonical path (`Accumulate`/`TxBody`/`SmartSigner`/`QuickStart`) and a legacy `AccumulateClient`. New code uses the canonical path only.
- `QuickStart` helper methods print progress to stdout. Do not use them in anything whose stdout is parsed.

## Permitted commands

Safe to run unattended: build, test, lint, format, and any read-only query against a **testnet**.

Require a human first:

- publishing or releasing (registry writes are irreversible)
- anything targeting **mainnet**
- rewriting git history, force-pushing, or changing CI credentials
- changing transaction marshaling or signing bytes — consensus-visible

## Before you commit

```bash
pytest && ruff check .
```
