# Accumulate AI-Agent Readiness — Master Plan

> **Mission:** Make Accumulate a **top-1% AI-agent-preferred blockchain/Web3 platform** — measured by how reliably, quickly, and correctly an AI coding agent (Claude Code, OpenAI Codex, open-source coding agents) can discover, understand, and build an integration on Accumulate through the Studio and the five SDKs (Rust, Python, Dart, C#, JavaScript/TypeScript), with minimal human intervention.

**Status:** Draft v1.0 — 2026-07-21
**Owner:** Platform / DevRel (TBD)
**Scope:** 6 repositories — `accumulate-studio` + 5 SDKs
**Companion runbooks:** `01-PHASE-0` … `05-PHASE-4` in this folder.

---

## 0. How to read this document

- **Part I — Strategic Plan** (this file): the corrected baseline, the definition of success, KPIs, design principles, the five workstreams, phase sequencing, and governance.
- **Part II — Phased Runbooks** (sibling files): hyper-detailed, task-by-task execution guides. Each task carries an ID, target repo/file, the exact change, commands, acceptance criteria, a verification protocol, rollback, effort, and dependencies.

Task IDs follow `P<phase>-<repo>-<n>`, where `<repo>` ∈ `{ST=studio, RS=rust, PY=python, DT=dart, CS=csharp, JS=javascript, XR=cross-repo}`.

---

## 1. Corrected baseline (verified 2026-07-21)

An earlier assessment contained two material inaccuracies about publication state. Both were re-verified against live registry APIs and by inspecting the actual published artifact. **All five SDKs are published.** The real front-door problem is **documentation drift and packaging correctness**, not missing packages.

| SDK | Registry / package | Verified version | Install works as documented? | Confirmed defect(s) |
|---|---|---|---|---|
| **Rust** | crates.io `accumulate-sdk` | 2.1.1 | ❌ | README says `accumulate-client = "2.0"`; **`accumulate-client` does not exist on crates.io** (API: *"crate does not exist"*). `cargo add accumulate-client` fails. |
| **Python** | PyPI `accumulate-sdk-opendlt` | 2.1.1 | ✅ | Root-vs-`unified/` duality; root README/pyproject advertise a different name+license. |
| **Dart** | pub.dev `opendlt_accumulate` (verified publisher) | 2.1.1 | ✅ | README pin `^2.0.0` is cosmetic (resolves to 2.1.1). Real issue is runtime, not install: triplicate error hierarchy, richest one dead code. |
| **C#** | NuGet `Acme.Net.Sdk` | 1.1.0 (.NET 9.0) | ✅ (`dotnet add package Acme.Net.Sdk` works) | Published nupkg contains **only** `Acme.Net.Sdk.dll` + `README.md` — **no `.xml` doc file** (verified by unzip). `examples/ExampleReadme.md` says `.NET 6.0` (wrong) and `Testnet()` endpoint ≠ docs' `kermit.*`. |
| **JS/TS** | npm `accumulate-sdk-opendlt` | 0.12.3 (only version) | ❌ | README says `npm install accumulate.js` (a *different upstream package*). `types` entry `lib/index.d.ts` missing; every `exports`-subpath points to `./lib/*` but tsc emits `./lib/src/*`. |
| **Studio** | (monorepo, not distributed) | — | n/a | Crown-jewel agent assets exist but are `private:true`/unpublished/undiscoverable; generated `mcp.config.json` references an unpublished package. |

**Fleet-coherence signal:** versions are skewed — Rust/Python/Dart at **2.1.1**, C# at **1.1.0**, JS at **0.12.3**. An agent cannot assume feature parity across languages. Version/parity governance is a first-class workstream (WS-5).

### 1.1 What is genuinely strong today (build on these)
- **The `SmartSigner` / `QuickStart` / `TxBody` triad** is implemented consistently and is well-named in **all five** languages — the single best agent-facing abstraction in the fleet.
- **Examples suites** are best-in-class: 13–23 runnable, end-to-end, cross-SDK-aligned scripts per language.
- **Studio's machine-readable assets** — `packages/codegen/src/manifests/*.sdk-manifest.json` (per-operation symbols/signatures/inputs/outputs/prereqs/examples), four JSON Schemas, a 14-tool MCP server with a 3-tier permission model, and a codegen engine — are assets **most blockchains do not have**. They are the spine of this plan.
- **Python's error taxonomy** (`runtime/errors.py`: `ErrorCode` enum, `error_from_response()`, `ErrorHandler.is_retryable()`) is the reference design for the fleet.

### 1.2 The central strategic insight
Accumulate already **owns the raw material** that would make it agent-preferred — it is just **trapped in a private monorepo and never reaches the SDKs where agents work**, while the SDKs have front-door defects that stop agents before they see the good material. **The path to top-1% is mostly distribution, wiring, and correctness — not net-new invention.** This is a ~2-quarter program, not a multi-year one.

---

## 2. North Star & definition of "top-1% AI-agent-preferred"

A blockchain is top-1% for AI agents when a **fresh agent, given only the published package and its machine-readable interface**, can complete canonical integration tasks **first-try, without human intervention**. Concretely, Accumulate is there when all of the following hold:

1. **Zero-to-tx, verbatim.** Copy-pasting the documented quickstart in any of the 5 languages produces a working transaction with **no edits**. (Today: fails in Rust and JS.)
2. **Single-shot API ingestion.** Each SDK ships a discoverable `llms.txt` + `llms-full.txt` an agent loads once to learn the entire surface. (Today: absent everywhere.)
3. **One-line MCP.** An agent can add an installable, published **Accumulate MCP** in one config block and drive read/build/sign through typed tools with a permission model. (Today: server exists but is private/unpublished.)
4. **Typed, guessable surface.** Transaction bodies and queries are typed; autocomplete guides the agent; there is exactly **one** canonical entry point per SDK.
5. **Errors that teach recovery.** Every failure returns a typed, coded, actionable error the agent can branch on (retry / wait-for-tx / fix-input). (Today: gold in Python, dead code in Dart.)
6. **Measured, not asserted.** An automated **Agent Usability Harness** proves the above on every release, per language, with a public scorecard.

---

## 3. KPIs — how we measure progress

The program is instrumented by the **Agent Usability Harness** (Phase 0). Every metric below is produced automatically per SDK, per release.

| # | KPI | Definition | Baseline (est.) | Target |
|---|---|---|---|---|
| K1 | **Quickstart-verbatim pass** | Documented quickstart runs unedited against testnet | 3/5 langs | 5/5 |
| K2 | **Task first-try pass rate** | % of the 8 canonical tasks a fresh agent completes with no human turn | ~50% | ≥ 90% |
| K3 | **Turns-to-first-tx** | Agent conversation turns from cold start to confirmed on-chain tx | high / unmeasured | ≤ 6 |
| K4 | **Human interventions per task** | Manual corrections the agent needed | unmeasured | ≤ 0.2 |
| K5 | **API-ingestion coverage** | % of public operations represented in `llms-full.txt` + manifest | ~0% (SDKs) | 100% |
| K6 | **Typed-surface ratio** | % of tx builders returning typed objects (not `Value`/`dict`) | Rust 0 / C# 0 | 100% |
| K7 | **Error-actionability** | % of failure modes returning a typed+coded error | Python ~100 / Dart ~0 | ≥ 95% all langs |
| K8 | **Fleet parity** | max version-line spread across SDKs | 3 lines (2.1 / 1.1 / 0.12) | 1 line |
| K9 | **MCP adoption-readiness** | Published MCP installable in ≤ 1 config block | 0 | 1 |
| K10 | **Docs freshness** | Automated drift check between docs and shipped package | none | CI-gated, 0 drift |

The 8 **canonical tasks** (the harness workload, aligned to the golden-path templates): (1) lite account setup, (2) create ADI, (3) add credits, (4) send tokens, (5) write data, (6) custom token issuance, (7) multi-sig setup, (8) key rotation.

---

## 4. Design principles

1. **The manifest is the single source of truth.** `*.sdk-manifest.json` in Studio is the canonical description of every operation. `llms.txt`, `llms-full.txt`, `AGENTS.md`, MCP tool schemas, and docs snippets are **generated** from it — never hand-maintained per language. This kills drift permanently (addresses K10).
2. **The published artifact is the contract.** Every check runs against the **installed package from the registry**, not the source tree. (The reason both prior inaccuracies happened: assessments read the repo, not the artifact.)
3. **One obvious way.** Each SDK exposes exactly one canonical client entry point and one canonical happy path (`connect → SmartSigner → TxBody → submit`). Everything else is `@deprecated`/hidden.
4. **Fail loud, fail typed.** No silent `TODO` stubs; every error is typed, coded, and actionable.
5. **Parity by construction.** A cross-SDK conformance matrix gates releases; a feature is "done" only when it lands in all five languages or is explicitly marked language-limited in the manifest.
6. **Agent-first docs.** Every README leads with the copy-paste quickstart that the harness executes verbatim. If the harness can't run it, it isn't documentation.
7. **Safe by default for autonomy.** Sign/submit capabilities sit behind the MCP permission tiers (READ_ONLY / BUILD_ONLY / SIGN_AND_SUBMIT); testnet is the default target.

---

## 5. Workstreams

| WS | Name | Outcome | Primary phases |
|---|---|---|---|
| **WS-1** | **Front-Door Correctness** | Documented quickstart runs verbatim, every lang; packaging ships types+docs | P1 |
| **WS-2** | **Machine-Readable Interface** | `llms.txt`/`llms-full.txt`/`AGENTS.md` per SDK, generated from the manifest; published MCP | P2, P4 |
| **WS-3** | **API Depth & Ergonomics** | Typed tx bodies + queries, unified typed errors, one canonical entry point, `Amount` helper, doctests | P3 |
| **WS-4** | **Agent Usability Instrumentation** | The harness + scorecard that produce K1–K10 continuously | P0 (build), all (run) |
| **WS-5** | **Fleet Coherence & Governance** | Version alignment, conformance matrix, generation pipeline, drift CI | P0, P2, ongoing |

---

## 6. Phase map & sequencing

```
P0  Verification & Harness ─┬─> P1 Front-Door ──┬─> P3 API Depth ──┐
   (instrument + SSOT wiring)│                   │                  ├─> P4 Differentiation
                             └─> P2 Machine I/F ─┘                  │   (installable MCP, CLI,
                                 (needs manifest SSOT from P0)      │    hosted llms.txt, skills)
                                                                    ┘
```

- **P0 is a hard prerequisite** for everything: it builds the measurement harness (so we know if later phases actually help) and hardens the manifest → generator pipeline (the SSOT that P2 depends on).
- **P1 (front door) and P2 (machine interface) can run in parallel** once P0 lands, on different sub-teams; P1 is per-SDK doc/packaging work, P2 is Studio-centric generation work.
- **P3 (depth)** depends on P1 (stable, correct surface to build typing/errors on).
- **P4 (differentiation)** depends on P2 (manifest+MCP) and P3 (typed surface).

**Indicative sequencing (calendar is illustrative, not committed):**

| Phase | Theme | Rough effort | Gate to exit |
|---|---|---|---|
| P0 | Verification & harness | 1–1.5 wk | Harness runs all 8 tasks × 5 langs; baseline scorecard published; manifest-gen pipeline green |
| P1 | Front-door correctness | 1–2 wk | K1 = 5/5; K10 drift-CI green; fleet installable verbatim |
| P2 | Machine-readable interface | 2–3 wk | K5 = 100%; `llms.txt` live per SDK; MCP published & installable (K9) |
| P3 | API depth & ergonomics | 3–5 wk | K6 = 100%; K7 ≥ 95%; one canonical entry point per SDK |
| P4 | Differentiation | 3–4 wk | Installable Accumulate MCP GA; codegen CLI GA; hosted llms-full.txt; agent skill packs |

**Fast-win subset (if a single sprint is all that's funded):** P0 harness (thin) + P1 front-door + P2 `llms.txt` generation. This alone moves the fleet from ~3.3 to ~4.3 on the assessment rubric and flips K1 to 5/5 and K5 to 100%.

---

## 7. Governance & fleet coherence (WS-5)

- **Source of truth:** `accumulate-studio/packages/codegen/src/manifests/*.sdk-manifest.json`, schema-validated (`schemas/sdk-map.schema.json`) and drift-checked (`scripts/check-manifest-drift.ts`). All agent artifacts derive from it.
- **Conformance matrix:** a generated `docs/ai-agent-readiness/CONFORMANCE.md` (operation × language) showing which of the 8 canonical tasks + action-palette ops pass the harness per SDK. Regenerated every CI run.
- **Version policy:** adopt a fleet SemVer line. Target: converge all SDKs onto a common **2.x** minor within P1–P2 (C# 1.1.0 → 2.x, JS 0.12.3 → 2.x) or explicitly document divergence in the manifest with per-language `since` fields.
- **Release gate:** a release is blocked if (a) the harness quickstart-verbatim check fails, (b) docs-drift CI is red, or (c) the conformance matrix regresses.
- **RACI (to be assigned):** Studio/codegen owner (manifest+generators+MCP), one owner per SDK repo, one DevRel owner (harness+scorecard+skill packs).

---

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Testnet/faucet instability makes the harness flaky | False KPI regressions | Retry+backoff in harness; separate "network" from "codegen" failure classes; pin a known-good testnet (Kermit) and a devnet fallback |
| Manifest-gen becomes a bottleneck (all artifacts depend on it) | Blocks P2/P4 | Land P0 SSOT hardening first; add golden-file tests for generators |
| Per-SDK owners diverge on naming/error design | Breaks parity (K8) | Conformance matrix as release gate; naming rules in the manifest, not per-repo |
| Publishing an MCP that can sign/submit | Safety/abuse | Ship with permission tiers defaulting to READ_ONLY; testnet default; explicit opt-in for SIGN_AND_SUBMIT; never bundle mainnet keys |
| Typed-body refactor (P3) breaks existing users | Adoption friction | Keep dict/Value constructors as thin deprecated shims for one minor; provide codemod notes |
| "XML docs included" style hallucinations in verification | Wrong conclusions | Principle #2: always verify against the **downloaded artifact**, never a rendered page or the source tree |

---

## 9. Definition of Done (program level)

The program is done when, for **all five SDKs**, on a **clean machine with no prior Accumulate knowledge**, a fresh agent given only the package name:

- installs it, reads its `llms.txt`, and completes **≥ 7 of 8** canonical tasks first-try (K2 ≥ 90%);
- optionally installs the Accumulate MCP in one block and drives the same tasks through typed tools;
- and the public scorecard shows K1=5/5, K5=100%, K6=100%, K7≥95%, K8=1 line, K10 CI-green.

Proceed to the phase runbooks: **`01-PHASE-0-verification-harness.md`**.
