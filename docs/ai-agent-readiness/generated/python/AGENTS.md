# opendlt-python-v2v3-sdk — repository guide for agents

The Python SDK for the Accumulate blockchain. Published as `accumulate-sdk-opendlt` (v2.3.0).

> Building **on** Accumulate rather than **on this SDK**? You want `llms.txt` (quickstart + rules) and `llms-full.txt` (full API). This file is about working on the SDK itself.

## Setup

Toolchain: **Python 3.9+ (3.11 recommended; pyproject declares requires-python >=3.9)**

```bash
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
| `pytest tests/integration` | integration suite | **yes** |

Network-dependent suites talk to a live testnet. If they fail while the unit suite passes, suspect the network before suspecting your change.

## Lint & format

```bash
ruff check .
ruff format --check .
```

## Layout

```
src/accumulate_client/  the package
tests/                  test suite (tests/integration needs the network)
examples/               runnable end-to-end examples
```

## Gotchas

- This repository root IS the package root: `pyproject.toml` here declares `accumulate-sdk-opendlt`. Do not look for a `unified/` subdirectory — that is an artifact of some local working copies and is not part of this repo.
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
