# opendlt-rust-v2v3-sdk — repository guide for agents

The Rust SDK for the Accumulate blockchain. Published as `accumulate-sdk` (v2.3.2).

> Building **on** Accumulate rather than **on this SDK**? You want `llms.txt` (quickstart + rules) and `llms-full.txt` (full API). This file is about working on the SDK itself.

## Setup

Toolchain: **Rust stable, rust-version 1.70+ (edition 2021)**

```bash
make install-tools   # clippy, rustfmt, cargo-audit, coverage tooling
```

## Build

```bash
cargo build
```

## Test

| Command | Covers | Needs network |
|---|---|:--:|
| `make test` | full suite | no |
| `make test-unit` | unit only | no |
| `make test-integration` | integration | **yes** |
| `make test-conformance` | conformance vectors | no |
| `cargo test --doc` | doctests (Amount helper) | no |

Network-dependent suites talk to a live testnet. If they fail while the unit suite passes, suspect the network before suspecting your change.

## Lint & format

```bash
make lint   # clippy
make fmt-check
```

## Layout

```
src/            the crate
tests/          integration + conformance tests
examples/v3/    runnable examples
Makefile        the canonical entry point for every workflow
```

## CLI

This repo ships the `accumulate` CLI. Run it from the checkout with:

```bash
cargo run --bin accumulate -- --json version
```

It conforms to `docs/ai-agent-readiness/CLI-SPEC.md` in accumulate-studio: one JSON
envelope on stdout, `ACC_*` error codes, exit codes 0/1/2/3. **Changing its output shape
is a contract change** — re-run the shared conformance suite, which gates all five SDKs:

```bash
node tools/cli-conformance/run.mjs --cmd "cargo run --bin accumulate --" --cwd . --sdk rust
```

## Gotchas

- Use the `Makefile`, not bare cargo. `make ci-check` (= fmt-check + lint + test + coverage-gate + audit) is what CI runs; bare `cargo test` skips the coverage gate and the audit.
- The crate is `accumulate-sdk` but the import path is `accumulate_client`. Both are correct and intentional.
- `golden_bytes_stable` pins the marshaled bytes for all 21 transaction types. If it fails, you changed signing bytes — that is a consensus-visible break, not a test to update.
- Transaction type codes were wrong for 5 variants historically (LockAccount, BurnCredits, TransferCredits, UpdateAccountAuth, UpdateKey). The golden-byte harness exists to stop that recurring.

## Permitted commands

Safe to run unattended: build, test, lint, format, and any read-only query against a **testnet**.

Require a human first:

- publishing or releasing (registry writes are irreversible)
- anything targeting **mainnet**
- rewriting git history, force-pushing, or changing CI credentials
- changing transaction marshaling or signing bytes — consensus-visible

## Before you commit

```bash
make ci-check
```
