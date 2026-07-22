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

## Comprehensive Publish (2026-07-22) — ✅ 6/6 LIVE

One coordinated release bundling all Phase 1–3 work. **All published & verified against the live registries:**
- **crates.io** `accumulate-sdk` **2.2.0** — ships `llms.txt` ✅
- **PyPI** `accumulate-sdk-opendlt` **2.2.0** — wheel has `amounts.py` + `py.typed` (llms.txt in sdist, not wheel)
- **pub.dev** `opendlt_accumulate` **2.2.0** — ships `llms.txt` ✅
- **NuGet** `Acme.Net.Sdk` **1.2.0** — XML docs + `llms.txt` ✅
- **npm** `accumulate-sdk-opendlt` **0.13.0** — `types`/`exports` resolve + `llms.txt` ✅
- **npm** `accumulate-studio-mcp` **1.0.0** — the Accumulate MCP, self-contained bundle (only `@modelcontextprotocol/sdk` external)

Each SDK ships the `Amount` helper, `llms.txt`/`llms-full.txt`/`AGENTS.md`, and the Phase 3 fixes.

**npm publish path:** the `npm` CLI can't run here (`spawn EPERM`, Windows), so JS + MCP were published via the registry HTTP API directly (`scratchpad/npm-http-publish.mjs` — builds packument + sha512 integrity; registry validates it). Needed an **automation** token (bypasses 2FA); the first classic token was rejected for an OTP. MCP renamed from the unregistered scope `@accumulate-studio/mcp-server` → unscoped `accumulate-studio-mcp`.

### Scorecard after publish (deterministic KPIs)
**K1 🟢 5/5** (verbatim install works every language) · **K9 🟢** (MCP live) · **K10 🟢** (zero docs-vs-artifact drift). artifact-verify: **13 pass / 1 fail**.
Remaining reds: **K5 4/5** (Python *wheel* lacks llms.txt — sdist + GitHub + other 4 SDKs have it; minor) and **K8** (fleet version parity: 2.2 / 1.2 / 0.13 — a semver convergence decision for C# and JS, not a defect).

---

## Phase 2 — Machine-Readable Interface — 🟡 generators done & distributed; MCP publish gated

| Task | Status | Evidence |
|---|---|---|
| P2-ST-01 refresh manifest metadata | ✅ | all 5 manifests now carry real `sdk_version`+`commit`; `validate:canonical` placeholder warning cleared; studio `f9588d4` |
| P2-ST-02/03/05 llms.txt / llms-full.txt / AGENTS.md generator | ✅ | `scripts/generate-agent-artifacts.mjs` (SSOT-driven, **deterministic** — verified by double-run hash); `npm run gen:agent[:dist]` |
| Generated artifacts (5 SDKs × 3 + router) | ✅ | `docs/ai-agent-readiness/generated/`; 24 ops each, per-language install/import/conventions + full per-op digest |
| Distribute into SDK repos + package them | ✅ | committed to all 5 repos with packaging config (Cargo `include`, npm `files`, csproj `<None Pack>`, MANIFEST.in; Dart auto). rust `ddd2be5`, js `70dec26`, csharp `472c643`, python `89fb1c4`, dart `8f9a688` |
| P2-ST-06 per-package READMEs (codegen/mcp-server/agent-pack/types) | ✅ | READMEs added for all 4 packages; studio `704e081` |
| P2-ST-09/10 MCP hardening + install docs | ✅ | honors `ACCUMULATE_NETWORK` + `ACCUMULATE_MCP_PERMISSION` env (safe defaults: testnet, BUILD_ONLY); typecheck clean; `apps/mcp-server/README.md` + `docs/ai-agent-readiness/MCP.md` |
| P2-ST-07 MCP publish-ready | ✅ | `private:false`, `publishConfig.access=public`, `files`, metadata — ready to publish, not yet published |
| P2-ST-04 full agent-pack (sdk.map.json/SAFETY.md/prompts) | ⬜ | superseded for llms/AGENTS by the new generator; SAFETY/prompts not yet emitted |
| P2-ST-08/11 publish MCP + harness MCP-mode | ⏳ | actual npm publish + live agent runs gated on npm token / agent key |

**llms.txt is committed to every SDK repo (GitHub-visible now) and packaged to ship on the next release.** It is NOT yet in the *published* registry artifacts, so `artifact-verify` LLMS_TXT stays EXPECTED_FAIL / K5 red until a republish. The 4 non-npm SDKs can be republished (2.1.3 / 1.1.2) to flip K5 green whenever desired; JS waits on the npm token.

## Phase 3 — API Depth — 🟡 in progress

| Workstream | Status | Evidence |
|---|---|---|
| **D — `Amount` helper (×1e8 footgun)** | ✅ **all 5 languages + TESTNET-VERIFIED** | Python `1c8bb75`, Dart `f775720`, Rust `5cc537c` (build+**doctest**), C# `b5929f9`, JS `048496d` (typecheck 0 errors). **On-chain proof (Kermit):** `Amount.credits(1000, oracle)` bought credits and `Amount.acme(1)` sent exactly `100000000` base units; recipient's on-chain balance confirmed 1 ACME delivered. Testnet verification loop established. |
| E — doctests / `@example` | 🟡 partial | Rust `Amount` doctest runs in `cargo test --doc`; C# `<example>`, JS `@example`, Dart dartdoc examples on `Amount`. Broader coverage (SmartSigner/TxBody) pending. |
| A — typed tx bodies (Rust `Value`→typed, C# `Dictionary`→typed) | 🟡 safety net DONE; refactor pending | **Golden byte harness built + passing** (rust `1b713d6`): `golden_bytes_stable` pins marshaled bytes for all 21 tx types — any signing-byte change now fails CI. **Finding:** the actual typed-return refactor is a **breaking major-version change** (21 body structs + `SmartSigner` signature + all ~23 examples, per language) for **low benefit** (builder *inputs* are already typed). Recommend scheduling A as dedicated major-version work (harness now guards it) and doing B & C first. |
| **B — unified typed errors wired into live path** | ✅ **Dart done + TESTNET-VERIFIED** | dart `f977486`: wired `JsonRpcErrorMapper` into `Transport.call`/`batch` + exported the `AccError` taxonomy from the package root. **On-chain proof (Kermit):** querying a non-existent account now throws typed `ApiError(-33404)` caught by `on AccError` — was a flat uncatchable `JsonRpcException` before. Other langs' errors already function (Python is the reference); Dart was the only broken one. |
| **C — one canonical entry point per SDK** | ✅ safe wins done | C# `AcmeClient` marked `[Obsolete]`→ canonical Accumulate/TxBody/SmartSigner (csharp `86f46a3`, build clean); generated `AGENTS.md` across **all 5 SDKs** now states the one canonical client explicitly (studio `c11fad5` + distributed). Deeper consolidation (Dart's 5 clients, Python wildcard exports, Rust globs) intentionally left — breaking + low-value. |

Also fixed: Python `__init__.__version__` was hardcoded `2.1.1` (stale vs the 2.1.2 package) — now sourced from `_version.py` (single source).

**Note:** these add a new public API (`Amount`) to each SDK, so the eventual comprehensive publish should be a **minor** bump (e.g. 2.2.0 / 1.2.0 / 0.13.0), not a patch.

## Phase 4 — Differentiation — ⬜ not started
MCP GA, `accumulate-gen` CLI, hosted llms.txt, agent skill packs, self-verifying codegen.

---

## Two standing external gates (cannot be self-satisfied)
1. **Registry publish tokens** — to republish fixed packages (finishes Phase 1's green flips) and to publish/GA the MCP + CLI (Phase 2/4).
2. **Agent API key + testnet faucet** — to activate the agent runner and produce live K2–K4.
