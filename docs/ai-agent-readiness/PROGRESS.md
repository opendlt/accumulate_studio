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

## Phase 1 — Front-Door Correctness — ✅ 4/5 published & live-verified · JS blocked on npm token

Four SDKs republished and **verified green against the live registries** by `artifact-verify`. JS fix is committed but not published (npm auth gap — see below).

| SDK | Fixes | Published | Live artifact-verify |
|---|---|---|---|
| **C#** | GenerateDocumentationFile (ships `.xml`), `Accumulate.Kermit()` factory, deleted `Class1` stub, ExampleReadme .NET 9 | **NuGet 1.1.1** (csharp `c0c4cbf`) | TYPE_SIGNALS ✅ (nupkg now ships `Acme.Net.Sdk.xml`) |
| **Rust** | README badge/install/link `accumulate-client`→`accumulate-sdk`, crate-doc clarifies import path | **crates.io 2.1.2** (rust `a505fda`) | NAME_PARITY ✅ |
| **Python** | ACME base-unit scaling documented on `TxBody.add_credits` | **PyPI 2.1.2** (python `8fd15ac`) | NAME_PARITY ✅, py.typed ✅ |
| **Dart** | README dep pin `^2.1.0`, ACME base-unit amount note, CHANGELOG | **pub.dev 2.1.2** (dart `197e5bb`) | NAME_PARITY ✅ |
| **JS/TS** | README name→`accumulate-sdk-opendlt`, `main`/`types`/all `exports`→real tsc output (`lib/src/*`), `./helpers` subpath, amount note | ⏳ **not published** (needs npm token) | NAME_PARITY ❌, TYPE_SIGNALS ❌, EXPORTS ❌ (published 0.12.3 still broken) |

**artifact-verify: 6 fails → 4 fails.** Remaining fails are all JS (3) + fleet version parity (1). K1 name-parity 3/5 → 4/5.

### JS/npm publish — blocked
`npm_recovery_codes.txt` holds 2FA **recovery codes**, which cannot authenticate `npm publish`. `npm login`/`npm token create` also needs the account **username + password** (the recovery code only replaces the OTP). **To finish JS:** provide an npm **automation/granular access token** (create at npmjs.com → Access Tokens), or run `npm login` yourself and share nothing. Then bump `javascript/package.json` 0.12.3→0.12.4 and `npm publish`. That flips K1→5/5 and clears K10.

Notes:
- C#/Dart/Python were already green on name-parity + type signals; their items were polish. Rust and JS had the genuinely fatal front-door bugs (wrong/nonexistent install name; broken types/exports) — both fixed.
- **Remaining Phase 1 polish (optional, lower value):** Python root-vs-`unified` reconcile is moot (GitHub repo root *is* `unified/`); selfcheck count refresh (P1-PY-03) and Dart example-folder decluttering (P1-DT-02) not yet done.
- **Version convergence (P1-XR-01):** still skewed (2.1.1 / 2.1.1 / 2.1.1 / 1.1.0 / 0.12.3) — decision pending.

### External gate to finish Phase 1
Only **JS/npm** remains: NuGet/crates/PyPI/pub.dev are done and green. Provide an npm automation token (or `npm login`), then publish `accumulate-sdk-opendlt` 0.12.4 → K1 → 5/5, K10 → clean. (Fleet version parity K8 also needs the C#→2.x / JS→2.x convergence decision, P1-XR-01.)

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
