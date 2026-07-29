# RB-07 — Agent DevTools for Studio, and closing the typed-surface measurement gap

**KPIs affected:** K6 (typed-surface ratio, currently `PENDING_PHASE3`), K2 in `codegen` mode
**Depends on:** RB-01 (`codegen` mode measurement)

This runbook covers two distinct things that share a pillar: **runtime introspection** for the Studio web app, and **code intelligence** for the SDKs.

---

## Part A — Typed surfaces: a measurement gap, not a defect

### The finding

The scorecard shows Rust and Dart with blank type signals:

| Lang | Type signals |
|---|---|
| rust | · |
| python | ✅ |
| csharp | ✅ |
| javascript | ✅ |
| dart | · |

The blank is `'-'`, not `FAIL` (`scorecard.mjs:88`). Reading `tools/artifact-verify/verify.mjs`, the reason is that **no type-signal check is defined for Rust or Dart**:

- `expectPyTyped: true` — python (`:50`)
- `expectXmlDoc: true` — csharp (`:63`)
- `expectTypesEntry` / `expectExportsResolve` — javascript (`:70-71`)
- rust (`:39`) and dart (`:53`) — **no type expectation at all**

So the two blanks mean *not measured*, not *failing*. K6's target of 100% cannot be computed while 2 of 5 languages have no defined check.

This is worth stating plainly because it is the kind of gap that looks like a red on a dashboard and is actually an unwritten assertion.

### What the checks should be

Rust and Dart are statically typed — a `py.typed` equivalent is meaningless. The agent-relevant question is whether **documentation** ships, because that is what an agent's tooling reads.

| Lang | Proposed check | Rationale |
|---|---|---|
| Rust | `.crate` contains no `#![allow(missing_docs)]` on public modules; and docs.rs build succeeds for the published version | rustdoc is the agent-facing surface; a failed docs.rs build is invisible locally |
| Dart | published package's pub.dev score includes the "provides documentation" dimension; `dartdoc_options.yaml` present and `dart doc` succeeds | pub.dev's dimension is the ecosystem's own signal |

Both are checks against the **published artifact**, preserving the verifier's stated principle (`verify.mjs:13-14`): *"verify the DOWNLOADED ARTIFACT, never the source tree or a rendered registry page."*

Note that Rust and Dart both already have doc infrastructure — `unified/dartdoc_options.yaml` exists, and the Rust `Makefile` has doc-adjacent targets. The gap is assertion, not capability.

### Defining K6

"Typed-surface ratio: 100%" needs a definition. Proposed:

> K6 = (public operations whose full signature is discoverable from the published artifact's type/doc surface) ÷ (total public operations)

All five manifests already report **24/24 operations with complete signatures on every symbol**. So the manifest-level ratio is 100% today. What is unverified is whether the *published artifact* exposes those signatures to tooling — which is exactly what the per-language checks above test.

### Steps (Part A)

1. Add `expectRustdoc` and `expectDartdoc` handling to `verify.mjs`, following the shape of the existing `expectXmlDoc` block (`:262-271`).
2. Implement K6 in `scorecard.mjs:73`, replacing `PENDING_PHASE3`.
3. If either check fails, fix the SDK — do not weaken the check.
4. Record in `SCORECARD.md`'s legend that `·` means *no check defined*, distinct from skip. The current legend maps `·` to "n/a", which understates it.

---

## Part B — Agent DevTools for Studio

### Why

Studio is a browser app. For every other artifact in this program there is a way for an agent to verify its own output — run the test suite, call the API, check the chain. For Studio there is none. An agent that generates a flow cannot answer "does this actually render and execute?"

That is the missing half of the codegen loop. The generator produces code for 5 languages × 15 templates; the only verification today is human.

### What exists to build on

- **`#flow=` permalinks already work.** P3-3 (`ef45477`) ships lz-string-compressed flow encoding via `sanitizeFlow`, with a manual hash parse because `URLSearchParams` corrupts lz-string's `+`. An agent can therefore already *construct a URL that loads a specific flow*.
- **Live code preview** (P3-4, `c3a6570`) already regenerates on flow change with error and warning surfaces.
- **The proxy** (`apps/sdk-proxy`) is the execution path, already containerized.

So the pieces are there. What is missing is a headless entry point and a machine-readable result.

### Design

A `--headless` mode that:

1. Accepts a flow — via `#flow=` permalink, a JSON file, or a template id from `GOLDEN_PATH_TEMPLATES`.
2. Loads it, runs generation for a target language, optionally executes against testnet through the proxy.
3. Emits a single JSON document to stdout: generation result, diagnostics, console messages, network requests, per-node execution status, and any thrown errors.
4. Exits non-zero on failure.

```json
{
  "ok": false,
  "flow": { "id": "token-transfer", "nodeCount": 9 },
  "generation": { "language": "rust", "ok": true, "warnings": [], "bytes": 4821 },
  "execution": {
    "ok": false,
    "nodes": [
      { "id": "faucet", "status": "delivered", "txid": "..." },
      { "id": "send_tokens", "status": "failed", "error": { "code": "ACC_INSUFFICIENT_CREDITS", "retryable": false } }
    ]
  },
  "console": [ { "level": "error", "text": "..." } ],
  "network": [ { "url": "...", "status": 500, "durationMs": 812 } ]
}
```

The `error` object is the RB-05 catalog entry — same envelope as RB-04. Three front doors, one error shape.

### Implementation

Use Playwright against a built Studio, not a bespoke harness. It gives console capture, network interception, and DOM access for free, and it is the same mechanism "Chrome DevTools for agents" describes. Add it as a dev dependency of `apps/studio`; do not ship it in the app bundle.

Entry point: `scripts/studio-headless.mjs`, exposed as `npm run studio:headless -- --template token-transfer --lang rust --execute`.

**Do not** add a headless mode inside the React app. Keep it as an external driver so the app stays unaware and the shipped bundle does not grow.

### Steps (Part B)

1. Add Playwright to `apps/studio` dev dependencies; add a `studio:headless` root script.
2. Implement flow loading from all three sources. Reuse `sanitizeFlow` and the manual hash parse from P3-3 rather than reimplementing — the `+` corruption bug is easy to reintroduce.
3. Capture console and network via Playwright's `page.on('console')` / `page.on('request')`.
4. Define the result schema at `schemas/headless-result.schema.json` and validate output against it.
5. Add generation-only mode (no network) so it can run in CI for all 5 languages × 15 templates as a smoke test.
6. Add execution mode gated on testnet availability.
7. Wire `codegen` mode in the harness (`runner.mjs:28` already declares it) to drive this.

---

## Acceptance criteria

**Part A**
- [ ] `verify.mjs` defines a type-signal check for Rust and for Dart
- [ ] All 5 languages show ✅ or ❌ — no blanks — in the scorecard's type-signals column
- [ ] K6 computes a real number
- [ ] Legend distinguishes "no check defined" from "skipped"

**Part B**
- [ ] `npm run studio:headless -- --template <id> --lang <lang>` emits schema-valid JSON and exits 0/1 correctly
- [ ] Console errors and failed network requests appear in the output
- [ ] Generation-only mode runs 5 langs × 15 templates in CI without network
- [ ] Execution mode reports per-node status with RB-05 error codes
- [ ] Flows load from permalink, file, and template id
- [ ] Playwright is a dev dependency only; the shipped Studio bundle is unchanged in size
- [ ] Harness `codegen` mode drives it

## Risks

**Flakiness becoming noise.** Browser automation plus a public testnet is two sources of nondeterminism. Keep generation-only mode as the CI gate; execution mode runs on demand. Do not gate merges on testnet.

**Scope creep into E2E testing.** This is an agent introspection tool, not a replacement for the app's test suite. It answers "did this flow work and why not," not "is the UI correct."

**Weakening a check to make K6 green.** If the Rust or Dart doc check fails, that is a finding — the whole point of defining the check. Fix the artifact.

## Rollback

Part A is verifier-only; reverting restores the current blanks and `PENDING_PHASE3`. Part B is a new script plus a dev dependency; deleting both leaves Studio untouched.

---

## As-built (2026-07-27)

### Part A — type-signal checks and K6: done

`expectDocsRs` (rust) and `expectDartDoc` (dart) added to `tools/artifact-verify/verify.mjs`. Both verify the **published** artifact, preserving the verifier's stated principle.

Results on first run:

| Lang | Result |
|---|---|
| rust | ✅ docs.rs built rustdoc for 2.2.0 |
| dart | ❌ **pub.dev reports `has:error`, score 40/160** |

The Dart blank was hiding a real defect: analyzer errors degrade code intelligence for every consumer. It is now visible and documented in the Dart repo's `AGENTS.md`.

**K6 implemented** in `scorecard.mjs` — currently `4/5 languages expose a machine-readable API surface`, RED against the 100% target. A language with no check defined counts as *unmeasured*, never as a pass.

**Legend fixed.** `·` now reads "no check defined for this language — unmeasured, which is not the same as passing" instead of "n/a".

**One correction to the plan:** `TYPE_SIGNALS` was removed from `DRIFT_IDS`. Leaving it there made the single Dart defect turn *two* KPIs red (K6 and K10) and misreported a dartdoc gap as "docs-vs-artifact drift". K6 owns the type surface; K10 owns whether the artifact matches what the docs promise. K10 is green again.

**K9 de-hardcoded.** It was the literal string `accumulate-studio-mcp@1.0.0`, already stale after the RB-02 bump. It now reads the version from the package.

### Part B — headless DevTools: generation half done, browser half not

`tools/studio-headless/` plus `scripts/studio-headless.ts` and `scripts/build-headless.mjs`. `npm run verify:codegen` runs **8 templates × 5 languages = 40 generations in ~2 seconds with no network** and currently reports 40/40 clean.

Checks run on the flow *before* generation (unknown block types, empty flows, missing connections, duplicate ids) and on the code *after* (unrendered `{{...}}`, `[object Object]`, literal `undefined`, empty output, any mainnet reference, unscaled decimal amounts, unbalanced delimiters).

The flow-structure checks exist because output-only checking was demonstrably insufficient: a flow containing a single `NotARealBlockType` node generated 53 lines of valid-looking Python and scored `ok: true`. It now fails with exit 1 while all 40 real generations still pass.

**Two packaging defects found and reported, not silently worked around:**

1. `packages/types/dist` and `packages/codegen/dist` both emit **extensionless ESM specifiers** (`moduleResolution: bundler`), so neither is importable by Node. Fine for Studio, which Vite bundles; fatal for any Node consumer.
2. `template-loader.ts` imports `.hbs` via Vite's `?raw` suffix, which only a bundler understands.

A `default` condition was added to `packages/types`' `exports` map (it had only `types`/`import`, so any CJS-style resolution failed outright). That is necessary but not sufficient — the extensionless imports remain. The headless tool is therefore bundled with esbuild plus a `?raw` plugin, mirroring `apps/mcp-server`. **This is a workaround; making the codegen package Node-importable needs a monorepo-wide module-strategy decision.**

**Not implemented:** browser-level console and network capture. It requires Playwright — a new dependency and a ~300MB browser download — and gates nothing in CI. The generation half is what catches real defects and runs in seconds. Flagging this explicitly rather than reporting Part B as complete.
