# AI-Agent Readiness — Implementation Progress

> Honest, commit-referenced status. `artifact-verify` measures the **live registries**, so registry-facing KPIs only flip green after the fixed packages are **republished** — source fixes below are on each repo's `main`, pending a maintainer publish. This file is not auto-generated.

Last updated: 2026-07-21

## Legend
- ✅ done & verified · 🟡 done in source, pending republish · ⏳ code-complete, gated on a secret · ⬜ not started

---

## Phase 0 — Verification & Harness — ✅ complete (deterministic core)

| Task | Status | Evidence |
|---|---|---|
| P0-ST-07 artifact-verify | ✅ | `tools/artifact-verify/verify.mjs` runs; reproduces all known defects; studio `fa89ef1` |
| P0-XR-01/02/06 harness + 8 task specs + scorecard | ✅ | `tools/agent-harness/*`; `SCORECARD.md` baseline generated |
| P0-ST-09 canonical coverage | ✅ | `scripts/check-canonical-coverage.ts` PASS; flagged manifest version placeholders |
| P0-XR-10 CI workflow | ✅ | `.github/workflows/agent-readiness.yml`; studio `06d40b2` |
| P0-XR-04/05 agent runner (K2–K4) | ⏳ | `runner.mjs` code-complete + self-test; live runs need `ANTHROPIC_API_KEY`/Codex key + testnet faucet |
| P0-ST-08 golden-file generator tests | ⬜ | Deferred to Phase 2 (generators don't exist yet) |

Baseline scorecard: **0 green, 5 red, 5 pending** — honest cold start.

---

## Phase 1 — Front-Door Correctness — 🟡 source-complete, pending republish

All five SDK repos are on `main` with fixes verified locally (build/pack/syntax). Re-run `npm run verify:artifacts` after each package is republished to flip the checks green.

| SDK | Fixes | Verified | Commit |
|---|---|---|---|
| **C#** | GenerateDocumentationFile (ships `.xml`), `Accumulate.Kermit()` factory, deleted `Class1` stub, ExampleReadme .NET 9 | `dotnet pack` → nupkg now contains `Acme.Net.Sdk.xml` (436 KB); `dotnet build` OK | csharp `4374652` |
| **JS/TS** | README name `accumulate.js`→`accumulate-sdk-opendlt`, `main`/`types`/all `exports` repointed to real tsc output (`lib/src/*`), added `./helpers` subpath, amount note | all 32 package path targets resolve on disk (npm ships `/lib` wholesale) | js `4d0bbe4` |
| **Rust** | README badge/install/link `accumulate-client`→`accumulate-sdk`, crate-doc clarifies import path | `cargo build --lib` OK; `cargo doc` intra-doc links resolve | rust `6a611bd` |
| **Python** | ACME base-unit scaling documented on `TxBody.add_credits` | `ast.parse` OK | python `c2f915d` |
| **Dart** | README dep pin `^2.1.0`, ACME base-unit amount note | README-only | dart `08ccba8` |

Notes:
- C#/Dart/Python were already green on name-parity + type signals; their items were polish. Rust and JS had the genuinely fatal front-door bugs (wrong/nonexistent install name; broken types/exports) — both fixed.
- **Remaining Phase 1 polish (optional, lower value):** Python root-vs-`unified` reconcile is moot (GitHub repo root *is* `unified/`); selfcheck count refresh (P1-PY-03) and Dart example-folder decluttering (P1-DT-02) not yet done.
- **Version convergence (P1-XR-01):** still skewed (2.1.1 / 2.1.1 / 2.1.1 / 1.1.0 / 0.12.3) — decision pending.

### External gate to finish Phase 1
Republish the 5 fixed packages to their registries (npm/NuGet/crates/pub/PyPI). Requires maintainer publish tokens. After republish, `artifact-verify` NAME_PARITY (rust, js) and TYPE_SIGNALS (csharp) flip green → K1 → 5/5, K10 → clean.

---

## Phase 2 — Machine-Readable Interface — ⬜ not started
Generators (`llms.txt`/`llms-full.txt`/`AGENTS.md` from the manifest SSOT), per-package READMEs, and MCP publish. Depends on refreshing manifest metadata (P2-ST-01) — the manifests currently carry placeholder `sdk_version` (flagged by `check-canonical-coverage`). MCP publish needs npm credentials.

## Phase 3 — API Depth — ⬜ not started
Typed tx bodies (Rust/C#), unified error hierarchy wired into the live path (Dart is the priority — its rich taxonomy is currently dead code), one canonical entry point per SDK, `Amount` helper, doctests. Large per-language effort; each change gated by build+test per language.

## Phase 4 — Differentiation — ⬜ not started
MCP GA, `accumulate-gen` CLI, hosted llms.txt, agent skill packs, self-verifying codegen.

---

## Two standing external gates (cannot be self-satisfied)
1. **Registry publish tokens** — to republish fixed packages (finishes Phase 1's green flips) and to publish/GA the MCP + CLI (Phase 2/4).
2. **Agent API key + testnet faucet** — to activate the agent runner and produce live K2–K4.
