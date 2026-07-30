# AI-Agent Readiness — Implementation Progress

> Honest, commit-referenced status. `artifact-verify` measures the **live registries**, so registry-facing KPIs only flip green after the fixed packages are **republished** — source fixes below are on each repo's `main`, pending a maintainer publish. This file is not auto-generated.

Last updated: 2026-07-29

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

### Scorecard — ALL deterministic KPIs green (2026-07-22)
**K1 🟢 5/5** · **K5 🟢 5/5** · **K8 🟢** · **K9 🟢** · **K10 🟢**. artifact-verify: **15 pass / 0 fail**.

Follow-up release closing the last two reds:
- **K5 → 5/5:** Python **2.2.1** ships `llms.txt` inside the *wheel* (via `[tool.setuptools.data-files]`), verified in the built wheel.
- **K8 → green:** fleet converged onto the **2.2.x** line — C# **1.2.0 → 2.2.0**, JS **0.13.0 → 2.2.0** (Rust/Python/Dart already 2.2.x). All five SDKs now report the same minor line.

Only the 5 pending KPIs remain (K2–K4 agent-runner + K6/K7), all gated on turning on the agent harness (needs an agent API key). Every deterministic, ship-side objective is met.

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

### Execution status — 2026-07-27

| Runbook | Status | Evidence |
|---|---|---|
| RB-01 harness runner | ✅ done | `runner.mjs` executes; 61 unit tests; live Kermit runs passing; K2/K3/K4 derive real values |
| RB-02 MCP resources + prompts | ✅ done | `accumulate-studio-mcp` 1.1.0; 5 concepts, 5 operation catalogs (120 ops), 8 prompts; 21 protocol tests vs the built bundle |
| RB-03 manifest genre split | ✅ done | `REPO_META` + 9-section manifests for all 5 SDKs; 4 hand-authored studio manifests; distributed with 0 `dist SKIP`; regeneration byte-identical |
| RB-07A type signals + K6 | ✅ done | `expectDocsRs` / `expectDartDoc`; K6 live at 4/5 |
| RB-07B headless devtools | 🟡 partial | 40/40 generations clean in ~2s, no network; browser console/network capture not implemented |
| RB-04 CLI · RB-05 errors · RB-06 devcontainers | ⬜ | not started |

**New KPI movement:** K3 is **RED** (mean turns well above the ≤6 target — Rust notably worse than Python). K6 is **RED at 4/5**: Dart's pub.dev analysis reports `has:error` at 40/160, a real defect the previous blank was hiding.

**Corrections to the scorecard itself:** `TYPE_SIGNALS` removed from `DRIFT_IDS` (one Dart defect was turning both K6 and K10 red); K9 now reads the MCP version from the package instead of a hardcoded `1.0.0`; the legend now distinguishes "no check defined" from "n/a".

**Defects found by the new tooling:** the Python SDK's `QuickStart` prints progress to stdout (breaks machine-readable callers); `packages/types` and `packages/codegen` both emit extensionless ESM and are not importable by Node; error `-33404` confirmed live for account-not-found (first verified entry for RB-05's catalog).

Full detail in [`runbooks/`](runbooks/README.md) — each completed runbook has an **As-built** section.

---

## Four-pillar review — 2026-07-27

Audit of all six repos against the four agent-support pillars (MCP · AGENTS.md · LSP/code-intelligence · DevTools+sandboxing). Full execution plans in [`runbooks/`](runbooks/README.md).

| Pillar | State | Runbook |
|---|---|---|
| MCP | 14 tools, 3-tier permissions, published — but only 1 of MCP's 3 primitives (`index.ts:105` declares `tools` alone) | [RB-02](runbooks/RB-02-mcp-resources-and-prompts.md) |
| AGENTS.md | All 5 SDKs ship one, but they are SDK *usage* guides (33 lines, no Build/Test/Lint/Layout). `accumulate-studio` has none | [RB-03](runbooks/RB-03-manifest-genre-split.md) |
| LSP / code intelligence | Typed surfaces mostly good; **no `--json` in any SDK**; error taxonomy absent | [RB-04](runbooks/RB-04-structured-cli.md), [RB-05](runbooks/RB-05-error-taxonomy.md), [RB-07](runbooks/RB-07-devtools-and-typed-surfaces.md) |
| DevTools / sandboxing | **Absent** — zero devcontainers; no runtime introspection for Studio | [RB-06](runbooks/RB-06-devcontainers.md), [RB-07](runbooks/RB-07-devtools-and-typed-surfaces.md) |

**Two findings worth surfacing here:**

- **The error-catalog renderer is dead code.** `generate-agent-artifacts.mjs:173` and `:202` render `m.errors` / `op.errors`, but all five manifests have **0 top-level errors and 0 operations with errors** (while 22/24 declare `requires`). Every `llms-full.txt` ships with no error information, and every `AGENTS.md` tells agents to "branch on the SDK error type/code." Cheapest high-value fix in the program — the rendering exists, the data is missing. → RB-05
- **Rust/Dart type signals are unmeasured, not failing.** `verify.mjs` defines type checks for python/csharp/javascript only; rust and dart have none. The scorecard's `·` means *no check defined*. K6 cannot be computed until they exist. → RB-07·A

**Sequencing:** RB-01 (harness runner) first and alone. Every green KPI today measures packaging; every KPI that measures agent *success* is `PENDING`. Without the baseline there is no before/after for any other runbook.

---

## Two standing external gates (cannot be self-satisfied)
1. **Registry publish tokens** — to republish fixed packages (finishes Phase 1's green flips) and to publish/GA the MCP + CLI (Phase 2/4).
2. **Agent API key + testnet faucet** — to activate the agent runner and produce live K2–K4.

---

## Four-pillar closure — 2026-07-29

Audited all six repos against the four agent-support pillars (MCP · AGENTS.md ·
LSP/code-intelligence · DevTools+sandboxing).

| Pillar | Before | Now |
|---|---|---|
| **MCP** | 3/3 primitives, published | unchanged — plus a 15th tool, `acc.explain_error` |
| **AGENTS.md** | 9-section manifests in all 6 repos | unchanged — the error rule is now *followable* |
| **LSP / code intelligence** | typed surfaces 5/5; **no error taxonomy** | **error taxonomy shipped** (RB-05). Still no `--json` CLI (RB-04) |
| **DevTools / sandboxing** | **0/6 devcontainers** | **6/6 authored** (RB-06) — not yet container-verified |

**Scorecard: 8 green / 2 red / 0 pending.** K7 left `PENDING` for the first time
and reads a real number. The last two reds (K2 82%, K3 27.7 turns) are both
agent-*success* metrics — the taxonomy is the intervention aimed at them, and
neither will move until the harness is re-run.

### K1's red was a stale cache, not a defect

`docs/ai-agent-readiness/artifact-verify.json` held a JS `RUNTIME_IMPORT` FAIL
whose detail was `Command failed: npm install ... accumulate-sdk-opendlt` — an
install failure in the probe sandbox, not a broken package. A live
`npm run verify:artifacts` returns **19 pass / 0 fail**, and K1 is green at 5/5.
The scorecard reads that JSON rather than re-running the checks, so a stale cache
silently mis-reports a KPI. Anyone regenerating `SCORECARD.md` must run
`verify:artifacts` first — `verify:scorecard` alone will reproduce whatever the
cache last held.

### RB-05 — canonical error taxonomy — ✅

14 errors, 5 language bindings, one file. Renders into all five `llms-full.txt`
(the `m.errors`/`op.errors` branches were dead code before — the data was simply
missing), serves as `accumulate://errors[/{code}]`, and answers
`acc.explain_error` with the one thing an agent actually needs: **is a retry
productive.** 24/24 operations carry `op.errors`. CI-validated in
`check-manifest-drift.ts` (negative-tested: it fails on a missing `retryable`,
an empty `remediation`, and an undefined category).

**K7 = 100% (4/4) — provisional.** Measured against errors observed in the
harness corpus, with a deliberately catalog-independent extractor so the metric
cannot be gamed by the catalog it scores. But only four distinct self-announced
error strings exist in the corpus, because the transcripts are agent summaries
rather than raw protocol logs. RB-05 step 1 (deliberate negative-case runs) was
not done and is the way to make this number mean something.

**Found while building it:** the MCP server advertised tools from `allTools` but
dispatched from a separate `toolHandlers` map, so a tool could be listed and then
fail on call. Now asserted at startup.

### RB-06 — devcontainers — 🟡

All six repos have `.devcontainer/devcontainer.json`, each pinned to the
toolchain version read from that repo's own manifest, each defaulting to
`ACCUMULATE_NETWORK=kermit`, none carrying keys. **None has been booted.**
"Verify by destruction" (step 2) is outstanding; until it runs, this is authored
config, not a working guarantee.

### Still open

- **RB-04 structured CLI (`--json`)** — not started. Still zero first-party
  `--json` across all five SDKs; this is the remaining hole in the code-intelligence pillar.
- **RB-05 steps 1, 8, 9** — negative-case harvest; `errorFromException` emitting
  catalog codes; verifying typed errors on the live path for the four non-Dart SDKs.
- **RB-06 step 2** — actually build and run each container.
- **RB-07·B** — Studio browser console/network capture.

### Publish round — 2026-07-29 — ✅ 5/5 LIVE

Patch bumps carrying the error catalog into the shipped `llms-full.txt`, the
corrected `AGENTS.md` paths, and each repo's devcontainer. All stay on the 2.3
minor line, so K8 holds.

| SDK | Version | Registry | Verified |
|---|---|---|---|
| **Rust** `accumulate-sdk` | **2.3.3** | crates.io | NAME_PARITY, docs.rs rustdoc, llms.txt |
| **Python** `accumulate-sdk-opendlt` | **2.3.1** | PyPI | NAME_PARITY, py.typed, llms.txt in the wheel (119 `ACC_` refs) |
| **Dart** `opendlt_accumulate` | **2.3.5** | pub.dev | NAME_PARITY, runtime import, llms.txt |
| **C#** `Acme.Net.Sdk` | **2.3.3** | NuGet | ships `Acme.Net.Sdk.xml` + llms.txt (119 `ACC_` refs) |
| **JS** `accumulate-sdk-opendlt` | **2.3.1** | npm | all 32 `exports` targets resolve in the published tarball; integrity matched |

`artifact-verify`: **18 pass / 1 fail** — the single fail is the JS
`RUNTIME_IMPORT` probe, which is an environment defect (below), not a package
defect.

### The npm CLI is broken on this machine — and it corrupts a KPI

`npm pack` and `npm publish` both exit `1` immediately after the `prepare` script
with **no diagnostic**; the debug log stops at `verbose publish [ '.' ]`, the
packing step. This is the `spawn EPERM` breakage from the earlier release.

Two consequences, one of which matters beyond publishing:

1. **JS is published via `tools/npm-publish/publish.mjs`**, a committed tool that
   PUTs the packument to the registry HTTP API with sha1 + sha512 that the
   registry revalidates. The previous release used an equivalent script kept in a
   scratchpad, which was lost — so the tool is now in the repo with a README.

2. **`artifact-verify`'s JS `RUNTIME_IMPORT` check cannot be trusted from this
   box.** It shells out to `npm install accumulate-sdk-opendlt`, so it inherits the
   same breakage and fails with `Command failed: npm install ...`. This is the
   probe whose *cached* failure was mis-reporting K1 as red earlier in the day.
   Verified independently instead, by fetching the published tarball straight from
   the registry: **all 32 `exports` targets resolve, `main` and `types` resolve,
   and the shipped `llms-full.txt` carries the catalog.** Treat a JS
   `RUNTIME_IMPORT` failure seen on this machine as unproven rather than as a
   defect — and fix the probe to not depend on the npm CLI.

### RUNTIME_IMPORT probe fixed — and it found two shipped defects — 2026-07-30

The JS import probe was reporting FAIL for a host problem. Fixing it properly
meant answering "would a consumer's import break?" without depending on the npm
CLI — and the npm-free check immediately found two real defects that had shipped.

**Root cause of the false FAIL.** `npm install` on this box extracts
*partially* and exits 1 with no diagnostic, **non-deterministically**: the same
version of the same package yielded 0 files, then 375, then a tree with no
`package.json` at all (which is why Node then reported `Cannot find package
.../index.js` — it had fallen back to the default entry). `rm` on the temp dir
reports `Device or resource busy`, so this is file locking, not a package fault.
Confirmed environmental because the failure is identical for **2.3.1, 2.3.0,
2.2.0 and 0.12.3** — including versions published years earlier by a working npm
CLI — while `is-number` (5 files) and `axios` (333 files) install fine.

**Fix 1 — SKIP is not FAIL.** The probe now retries 3 times and uses the real
discriminator: *did the package's own `package.json` land?* If not, nothing was
installed and the import result says nothing about the package → `SKIP`
("check defined, could not run"). If it did land, an import failure is a genuine
defect → `FAIL`. K1 now treats `SKIP` as *unverified on this host* rather than
broken, and says so in the value.

**Fix 2 — a new npm-free check, `DEPS_DECLARED`.** Extracts the published
tarball and audits every bare import specifier in the shipped `lib/` against the
declared dependencies (`dependencies` + `peerDependencies` +
`optionalDependencies`; `devDependencies` deliberately excluded, since that is
the 2.2.0 `@scure/bip32` defect). Self-reference by package name is allowed when
`exports` is defined. This runs on any host and covers *every* module, not just
those on the root barrel's import path.

**What it found — two real defects in the published JS SDK:**

| Package | Declared as | Imported by |
|---|---|---|
| `@noble/secp256k1` | **devDependencies only** | `lib/src/crypto/secp256k1_keypair.js` |
| `rxjs` | **nowhere at all** | `lib/src/ledger/hw/index.js` |

Both modules ship, so any consumer importing them got `ERR_MODULE_NOT_FOUND`.
Neither sits on the root barrel's path, which is exactly why `EXPORTS_RESOLVE`
and the root-import probe both passed them. Fixed and published as **npm
`accumulate-sdk-opendlt` 2.3.2**; `DEPS_DECLARED` now passes across 96 shipped
files.

**The check gates something.** `DEPS_DECLARED` feeds both K1 and K10 (`DRIFT_IDS`).
Verified non-vacuous by pinning the verifier at the defective 2.3.1: the check
FAILs and drags **K1 → 4/5 red and K10 → drift present**. On 2.3.2 both are green.

**Scorecard: 8 green / 2 red / 0 pending.** The two reds are K2 (82%) and K3
(27.7 turns) — both agent-success metrics that only move when the harness re-runs.

### Devcontainers booted + K7 corpus harvested — 2026-07-30

**Correction to two earlier claims in this file:** Docker *is* available here
(29.4.3, daemon reachable) and `@devcontainers/cli` (0.88.0) installs fine, so
RB-06 step 2 was always achievable. And the K7 corpus was not fixed at n=4.

#### The bind-mount defect — found by booting, fixed, re-verified

On Docker Desktop for Windows, bind-mounted workspace files present as
`root:root`; `chown` on them fails and a non-root user cannot `utime` them.
Every one of these containers writes into the workspace, so `dart test` died with
`Operation not permitted` on `pubspec.lock` before running a single test.

All six now set `remoteUser: root`, with the reasoning and the Linux/macOS caveat
in each file. The container remains the isolation boundary — only the workspace is
mounted and no credentials are baked in. **Dart re-verified after the change: 440
tests pass.**

| Repo | `devcontainer up` | postCreate | Commands in-container |
|---|---|---|---|
| dart | ✅ | ✅ `dart pub get` | ✅ `dart analyze` (755 warnings/infos, 0 errors) · ✅ `dart test` **440 passed** |
| python | ✅ | ✅ `pip install -e '.[dev]'` | ✅ imports source 2.3.1 · ⚠️ `pytest` 3 failures (below) |
| javascript | ✅ | ✅ after lockfile fix | ✅ root import 51 exports · ✅ `test:unit` **101 passed**, 1 skipped |
| rust · csharp · studio | ⬜ not booted | | |

#### Two defects the containers exposed

1. **`npm ci` was broken in the JS repo.** Declaring `@noble/secp256k1` and `rxjs`
   updated `package.json` but not `package-lock.json`, so `npm ci` — which
   requires them in sync — refused, failing `postCreateCommand`. Regenerated with
   `npm install --package-lock-only` (the one npm path that does not hit this
   host's extraction bug). A plain host workflow never runs `npm ci`, so only the
   container caught it.

2. **Host Python test runs were not testing the source tree.** On the host,
   `import accumulate_client` resolves to a *stale* `site-packages` copy
   (**2.3.0**); in the container it resolves to `/workspaces/unified/src/` (**2.3.1**).
   Three tests pass on the host and fail in the container
   (`test_well_known_networks`, `test_transaction_structure`,
   `test_overall_coverage_meets_minimum`). The container is the correct
   environment, so these are real signals about the current source that host-green
   was masking. **Open** — not yet diagnosed further.

#### K7 — corpus doubled, and the harvest corrected the catalog

`tools/agent-harness/negative-cases.mjs` provokes 8 error responses from a live
Kermit V2 node and records the verbatim wire payloads into
`results/<date>/negative/` — a directory `loadRuns` does not read for `sdk` mode,
so K2/K3 are untouched (verified: still 82% and 27.7).

**It found two wrong wire codes in the catalog I had just written:**

| Catalog entry | Was | Actually returned by Kermit |
|---|---|---|
| `ACC_ACCOUNT_NOT_FOUND` | `-33404` only | **`-32807`** (`-33404` kept — seen once in a transcript) |
| `ACC_INVALID_PARAMS` | `-32602` (generic JSON-RPC) | **`-32802`** (`Validation Error`) |

Plus a missing error class, now `ACC_ROUTING_FAILED` (**`-33400`**, "cannot route
request: nothing to route") — what a hand-assembled envelope with no valid
`principal` actually gets, and notably *not* the `ACC_NOT_SIGNED` I had assumed.
Also recorded: on V2 a **malformed URL returns not-found**, not a URL error, so
that entry must be matched on code rather than text.

**K7 = 100% (8/8 distinct observed errors), catalog now 15 entries.** Still
modest: the remaining high-value cases (insufficient credits, unauthorized
signer, insufficient balance) need a funded signing key, so they are not yet
corpus-confirmed.

### RB-06 complete — all six devcontainers booted — 2026-07-30

| Repo | up | postCreate | Commands verified in-container |
|---|:--:|:--:|---|
| dart | ✅ | ✅ | `dart analyze` · **`dart test` 440 passed** |
| csharp | ✅ | ✅ | `dotnet build` 0 errors · **`dotnet test` 537 passed, 0 failed** |
| rust | ✅ | ✅ | `cargo build` · **`cargo test --lib` 90 passed, 0 failed** |
| javascript | ✅ | ✅ | root import 51 exports · **`test:unit` 101 passed** |
| python | ✅ | ✅ | imports source 2.3.1 · **`pytest` 2351 passed, 17 skipped, 0 failed** |
| studio | ✅ | ✅ | `npm ci && build:types && install:proxy` |

All six run as `remoteUser: root` (Windows bind mounts refuse non-root metadata
writes) and default to `ACCUMULATE_NETWORK=kermit` with no baked credentials.

#### Four defects that only a clean container could find

1. **`npm ci` broken in the JS repo** — `package.json` gained two dependencies
   without a `package-lock.json` update. Fixed via `npm install --package-lock-only`.
2. **`npm ci` broken in accumulate-studio** — pre-existing: the lockfile was
   missing `accumulate-studio-mcp@1.1.0` and `esbuild@0.20.2`. `npm ci` is the
   first command in both AGENTS.md and the devcontainer, so setup failed for
   anyone starting clean, including CI. Fixed.
3. **`pytest.ini` pointed at a directory that does not exist** — `testpaths =
   unified/tests` and `pythonpath = unified/src`, while this repo root *is*
   `unified/`. So `pythonpath` silently did nothing and host test runs imported a
   **stale `site-packages` copy (2.3.0)** instead of the source (2.3.1). Same
   wrapper-layout bug class as the `cd unified` defect in AGENTS.md. Repointed to
   `tests` / `src`; host runs now test the source.
4. **Two tests asserted APIs that do not exist**, masked by defect 3:
   `mainnet.endpoints["mainnet"]` (the client exposes a single `endpoint` string,
   and the test's comment claimed the opposite) and `envelope["transaction"]`
   treated as a dict when it is a list. Both fixed.

Also: the coverage gate shelled out to `coverage report` and **failed** when no
`.coverage` file existed — which is the case in every fresh container and CI job,
and passed on the maintainer's box only through leftover untracked state. It now
skips with an actionable reason when there is no data to gate on. Verified in both
states: 3 skipped without data, 3 passed with it.

### RB-04 complete — all four pillars now closed — 2026-07-30

`--json` was the last hole in the code-intelligence pillar. All five SDKs now ship
a conforming `accumulate` CLI: 13 verbs, one envelope shape, RB-05 error codes,
exit codes 0/1/2/3, a machine-readable `--help --json` command tree, and a
mainnet gate that needs both the flag and the env var.

**`npm run verify:cli` → 5/5 implementations, 60/60 cases.** The suite
(`tools/cli-conformance/run.mjs`) drives each CLI as a black box and validates every
envelope against `schemas/cli-envelope.schema.json`, so one gate covers all five —
the only thing that reliably prevents five dialects.

Building it found four defects, each caught by exercising the thing rather than
reading the signature:

1. **The shipped Dart CLI's `query` verb never worked** — it sent
   `{"type":"query-account","url":...}` where V3 requires `{"scope": url}`.
2. **C#'s `SignatureKeyPair` prints to stdout**, corrupting the envelope (same
   class as Python's `QuickStart`). Quarantined in the CLI; the SDK should stop.
3. **Python's `get_version_info()` makes no network call**, so a `net status` built
   on it claimed `reachable: true` against a dead endpoint.
4. **`query_chain` takes `(url, chain_name, range_options)`**, not `start`/`count`.

Four-pillar status: **MCP ✅ · AGENTS.md ✅ · LSP/code-intelligence ✅ ·
DevTools+sandboxing ✅** (Studio browser introspection, RB-07·B, remains partial).

Open on RB-04: harness `cli` mode (the K3 measurement), a CLI section in the
generated `llms.txt`/`AGENTS.md`, and publishing — none of the five CLIs ships until
the next release is cut.
