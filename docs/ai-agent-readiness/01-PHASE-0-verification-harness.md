# Phase 0 — Verification & Agent-Usability Harness

> **Why first:** You cannot claim "top-1% AI-agent-preferred" without measuring it, and you cannot trust source-tree assessments (the two baseline errors — "C# unpublished", "Dart publication unverified" — both came from reading repos instead of testing the shipped artifact). Phase 0 builds the instrument that produces KPIs K1–K10 and hardens the manifest → generator pipeline that Phase 2 depends on.

**Exit gate:** the harness runs all **8 canonical tasks × 5 SDKs** against testnet from the *published* packages, emits a machine-readable scorecard, and the manifest-generation pipeline is green with golden-file tests. A **baseline scorecard** is committed.

**Entry preconditions:** access to the 6 repos; a testnet/faucet (Kermit) reachable; API keys for the agent runner (Claude / Codex) available to CI as secrets.

---

## P0.1 Objectives

1. Stand up a repeatable **Agent Usability Harness** that drives a real coding agent through the 8 canonical tasks in each language, from the **installed registry package**, and scores K1–K4.
2. Add a **static-artifact verifier** that checks the *published* artifact for the packaging KPIs (K5, K6-probe, K10) without invoking an agent.
3. Harden the **manifest → generator** pipeline (SSOT) with golden-file tests so Phase 2 can generate agent artifacts reliably.
4. Publish the **baseline scorecard** so every later phase is measured against it.

---

## P0.2 Task table

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P0-XR-01** | new repo `accumulate-agent-harness/` (or `accumulate-studio/tools/agent-harness/`) | Scaffold harness: task catalog, per-lang runners, scoring, report emitter | `harness run --lang all --tasks all` executes end-to-end | M |
| **P0-XR-02** | harness | Define the 8 canonical tasks as declarative specs (goal, preconditions, success assertion) | `tasks/*.yaml` present; each maps to a golden-path template | S |
| **P0-XR-03** | harness | Per-language **install-from-registry** step (see P0.4) run in a clean container | Each lang installs the *published* package, no source checkout | M |
| **P0-XR-04** | harness | **Agent runner** adapter: pluggable backend (Claude Code / Codex / OSS) given a task + only the package + its docs/llms.txt | Agent produces code, harness executes it, captures pass/fail + turns + interventions | L |
| **P0-XR-05** | harness | **On-chain assertion** layer: verify the task's effect (account exists, balance, data entry, key page threshold) via a read client | Each task has a deterministic post-condition check | M |
| **P0-XR-06** | harness | **Scorecard emitter**: `scorecard.json` + `SCORECARD.md` computing K1–K4 per lang | Committed artifact; renders a table | S |
| **P0-ST-07** | `accumulate-studio/tools/artifact-verify/` | **Static artifact verifier**: downloads each published package, asserts install name matches README, type/doc files present, exports resolve | `artifact-verify --all` red on today's Rust/JS/C# defects | M |
| **P0-ST-08** | `accumulate-studio/packages/codegen` | Golden-file tests for manifest→generator: snapshot `llms.txt`/`AGENTS.md`/tool-schema outputs | `npm test` fails on unintended generator drift | M |
| **P0-ST-09** | `accumulate-studio/scripts/check-manifest-drift.ts` | Extend to assert manifest covers all 8 canonical tasks × 5 langs | Drift check red if an op is missing for a lang | S |
| **P0-XR-10** | CI | Wire harness (nightly) + artifact-verify + drift (per-PR) into CI; publish scorecard artifact | Nightly job green; scorecard published | M |

---

## P0.3 The 8 canonical task specs (P0-XR-02)

Each task is a YAML spec the agent runner consumes. Template:

```yaml
# tasks/04-send-tokens.yaml
id: send-tokens
title: Send ACME tokens between accounts
maps_to_template: token-transfer
network: kermit-testnet
preconditions:
  - funded lite token account (harness provisions via faucet)
prompt_to_agent: |
  Using the installed Accumulate SDK for <LANG>, write and run a program that
  sends 5 ACME from the provided lite token account to a newly created ADI token
  account, and waits for the transaction to settle. Print the transaction id.
inputs:
  sender_key: <injected>
  amount_acme: 5
success_assertions:
  - tx_status == delivered
  - recipient_balance_increased_by == 5 ACME
scoring:
  first_try: bool          # K2
  turns_to_success: int    # K3
  human_interventions: int # K4
```

The 8 specs: `01-lite-account`, `02-create-adi`, `03-add-credits`, `04-send-tokens`, `05-write-data`, `06-custom-token`, `07-multisig-setup`, `08-key-rotation`. They intentionally mirror the golden-path templates in `apps/studio/src/data/flow-templates.ts` so Studio-generated code and hand-written agent code are scored on the same rubric.

---

## P0.4 Install-from-registry matrix (P0-XR-03) — verify against the *artifact*

Each runner starts from a **clean container** and installs the published package. These commands are also the canonical "quickstart install" the harness proves for K1.

| Lang | Clean-container install (must succeed unedited) | Import smoke |
|---|---|---|
| Rust | `cargo new t && cd t && cargo add accumulate-sdk` | `use accumulate_client::{QuickStart, TxBody, SmartSigner};` compiles |
| Python | `python -m venv v && . v/bin/activate && pip install accumulate-sdk-opendlt` | `from accumulate_client import QuickStart, TxBody, SmartSigner` |
| Dart | `dart create t && cd t && dart pub add opendlt_accumulate` | `import 'package:opendlt_accumulate/opendlt_accumulate.dart';` analyzes clean |
| C# | `dotnet new console && dotnet add package Acme.Net.Sdk` | `using Acme.Net.Sdk;` builds; **assert `.xml` present in package cache** |
| JS/TS | `npm init -y && npm i accumulate-sdk-opendlt` | `import { Accumulate, SmartSigner, TxBody } from 'accumulate-sdk-opendlt'` resolves **with types** |

> The harness records, per lang, whether the **documented** install/import (copied verbatim from the README) matches these working commands. Today this flags Rust (`accumulate-client`), JS (`accumulate.js`, missing types), and C# (`.xml` absent) — exactly the P1 backlog.

---

## P0.5 Static artifact verifier (P0-ST-07) — deterministic, agent-free

A Node/TS tool that, per SDK, downloads the published artifact and asserts:

1. **Name parity:** the install command in the README equals the actual registry package name. *(Fails Rust, JS today.)*
2. **Type signals present:**
   - JS: `types`/`exports["."].types` path exists in the tarball; every `exports` subpath resolves to a real file. *(Fails today.)*
   - C#: `lib/<tfm>/*.xml` present alongside the DLL. *(Fails today — verified by unzip.)*
   - Python: `py.typed` present in the wheel. *(Passes.)*
   - Dart: package resolves and `dartdoc` index present. *(Passes.)*
   - Rust: crate builds; `cargo doc` succeeds. *(Passes, but `accumulate-client` name mismatch fails #1.)*
3. **llms.txt presence** (from P2 onward): `llms.txt` at package root and reachable. *(Absent today — expected red until P2.)*
4. **Version parity (K8):** record each package's version line; warn if spread > 1 minor.

Reference implementation sketch:

```ts
// tools/artifact-verify/src/index.ts
const checks = [
  npmTarball('accumulate-sdk-opendlt', t => [
    assert(t.hasFile(t.pkg.types), `types entry ${t.pkg.types} missing`),
    ...Object.entries(t.pkg.exports).map(([k, v]) =>
      assert(t.resolves(v), `exports "${k}" -> ${JSON.stringify(v)} does not resolve`)),
    assert(t.readme.includes('accumulate-sdk-opendlt'), 'README uses wrong install name'),
  ]),
  nugetPackage('Acme.Net.Sdk', p =>
    assert(p.glob('lib/*/*.xml').length > 0, 'no XML doc file shipped')),
  cratesReadmeName('accumulate-sdk', 'accumulate-client'), // README name must exist on crates.io
  // ...python, dart
];
```

This tool is the enforcement engine for K10 and half of K1; it runs on every PR.

---

## P0.6 Agent runner (P0-XR-04) — the heart of K2–K4

- **Isolation:** each (task, lang) runs in a fresh container with only the installed package + its shipped docs (README, `llms.txt` when present). No repo checkout, no examples folder — the agent gets exactly what a real integrator gets.
- **Backends:** an adapter interface so the same task can be scored by Claude Code, Codex, and an OSS agent. Record backend + model in the scorecard.
- **Turn accounting:** count agent turns until the on-chain assertion passes (K3). A "human intervention" (K4) = any harness-injected correction (compile fix hint, wrong-package correction) required to unstick the agent.
- **Determinism controls:** fixed task prompts, pinned SDK version, pinned network, retry only on classified *network* errors (not codegen errors) so K2 reflects agent capability, not testnet flakiness.

---

## P0.7 Verification protocol (how we prove Phase 0 itself works)

1. Run `harness run --lang all --tasks all --backend claude` → produces `scorecard.json`.
2. Confirm the scorecard **reproduces the known-good/known-bad reality**: Rust & JS quickstart-install must score **fail** on K1 (proving the harness detects the real defects); Python/Dart/C# install must score **pass**.
3. Run `artifact-verify --all` → must be **red** on Rust name, JS types/exports, C# xml (proving the static verifier detects them) and **green** on Python `py.typed`.
4. Run `npm test` in `packages/codegen` → golden-file generator tests pass; deliberately mutate a manifest to confirm the drift test goes red.
5. Commit `SCORECARD.md` as the **baseline** and tag it `agent-readiness-baseline`.

---

## P0.8 Rollback / safety

- Harness and verifier are **additive tooling** — no changes to shipped SDK code in P0, so rollback = remove the tool/CI job.
- Agent runner uses **testnet only** and harness-generated throwaway keys; never touches mainnet. Faucet-funded lite accounts are ephemeral.

---

## P0.9 Deliverables

- `accumulate-agent-harness/` (or `studio/tools/agent-harness/`) with task specs, runners, scorer.
- `studio/tools/artifact-verify/` static verifier.
- Golden-file generator tests in `packages/codegen`.
- `docs/ai-agent-readiness/SCORECARD.md` (baseline) + `scorecard.json`.
- CI: nightly harness + per-PR artifact-verify + drift.

**Next:** `02-PHASE-1-front-door.md`.
