# P1-8 — CI & Build Soundness

| Field | Value |
|---|---|
| Priority | P1 |
| Severity | High |
| Effort | M (3–4 days) |
| Risk | Medium — touches every workspace's tsconfig/source; first green CI may surface more latent errors |
| Depends on | none |
| Blocks | P1-9 (agent-pack unused-symbol fixes overlap), and any future "CI must be green" gate |
| Primary files | `package.json`, `apps/studio/package.json`, `apps/studio/vite.config.ts`, `apps/mcp-server/src/index.ts`, `apps/mcp-server/src/permissions.ts`, `apps/mcp-server/src/tools/*.ts`, `packages/verification/src/state-diff.ts`, `packages/agent-pack/src/*`, `packages/codegen/src/*`, `packages/codegen/tsconfig.json`, `scripts/check-manifest-drift.ts`, **new** `.github/workflows/ci.yml` |

---

## 1. Problem & impact

`npm run build --workspaces` does not produce a clean build, and there is **no CI** (`.github/workflows/` does not exist — verified `ls .github/workflows` → "NO .github/workflows dir"). Consequences:

- Type regressions land silently. The studio build was deliberately weakened to ship (`apps/studio/package.json` line 8 `"build": "vite build"`, commit `f275bb9` "skip tsc in build"), so the production bundle is **never typechecked**.
- Multiple workspaces fail `tsc` today (exact errors in §2). A contributor running the documented `npm run build` gets a wall of red and cannot tell intended-broken from newly-broken.
- The manifest drift guard (`scripts/check-manifest-drift.ts`) only checks 3 of 5 languages, so C# and JavaScript SDK manifests can drift from the block catalog undetected even though both manifest files exist (`packages/codegen/src/manifests/{csharp,javascript}.sdk-manifest.json`).

**Reality differs materially from the audit's initial description** — capture this for the team:
- `packages/codegen` was assumed to pass; it does **not**. It has ~30 errors (unused symbols + 3 real type errors + 5 `TS6307` "file not listed in project" errors for the JSON manifests).
- `apps/mcp-server` was assumed to be "~12 `as ToolHandler` casts"; it actually has **156 errors** across `src/index.ts` (13) and `src/tools/{network,query,transaction,verification}.ts` (143). The dominant root cause is `errorResponse()` returning `ToolResponse<unknown>` (not generic) — see §3.
- `packages/verification` matches: exactly 1 error at `state-diff.ts:321`.
- `packages/agent-pack` matches the described shape (TS2614 re-export + unused symbols) plus 3 extra unused-symbol errors.

## 2. Evidence (current code)

Captured by running `npm run build --workspace=<w>` / `npx tsc -p tsconfig.json` per workspace.

### 2a. `packages/types` — PASSES (exit 0). Baseline is fine.

### 2b. `packages/verification` — 1 error
```
src/state-diff.ts(321,29): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'JsonValue'.
```
`packages/verification/src/state-diff.ts:319-326`:
```ts
export function applyDiff(state: JsonObject, diff: StateDiffEntry[]): JsonObject {
  for (const entry of diff) {
    const parts = parsePath(entry.path);
    if (entry.type === 'removed') {
      deletePath(state, parts);
    } else {
      setPath(state, parts, entry.after);   // <-- line 321: entry.after is `unknown`
    }
  }
  return state;
}
```

### 2c. `packages/agent-pack` — 8 errors
```
src/generator.ts(397,57): error TS6133: 'sdkMap' is declared but its value is never read.
src/index.ts(47,3):  error TS2614: Module '"./sdk-mapper"' has no exported member 'KNOWN_ERRORS'. Did you mean to use 'import KNOWN_ERRORS from "./sdk-mapper"' instead?
src/index.ts(48,3):  error TS2614: Module '"./sdk-mapper"' has no exported member 'OPERATION_MAPPINGS'. ...
src/sdk-mapper.ts(11,3):  error TS6196: 'EntryPointKind' is declared but never used.
src/sdk-mapper.ts(52,7):  error TS6133: 'LANGUAGE_PATTERNS' is declared but its value is never read.
src/sdk-mapper.ts(184,3): error TS6133: 'sdkPath' is declared but its value is never read.
src/sdk-mapper.ts(337,48): error TS6133: 'language' is declared but its value is never read.
src/templates/AGENTS.md.ts(129,9):  error TS6133: 'mainEntry' is declared but its value is never read.
src/templates/AGENTS.md.ts(215,60): error TS6133: 'sdkMap' is declared but its value is never read.
```
`KNOWN_ERRORS`/`OPERATION_MAPPINGS` are declared with `const` (not `export const`) at `sdk-mapper.ts:161` and `:107`, then only attached to `export default {...}` at `sdk-mapper.ts:489-494`. `index.ts:43-51` re-exports them as **named**, which fails. (Resolution detail is cross-referenced and handled in P1-9; this doc fixes only the compile errors.)

### 2d. `apps/mcp-server` — 156 errors (representative)
`apps/mcp-server/src/index.ts`:
```
src/index.ts(18,3):  error TS6133: 'toolsByName' is declared but its value is never read.
src/index.ts(63,17): error TS2352: Conversion of type '(args: NetSelectArgs) => Promise<ToolResponse<NetSelectResult>>'
                     to type 'ToolHandler' may be a mistake ...
   (… 11 more identical TS2352 for each handler, lines 64–81)
```
`apps/mcp-server/src/index.ts:58-83`:
```ts
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const toolHandlers: Record<string, ToolHandler> = {
  'net.list': netList as ToolHandler,
  'net.select': netSelect as ToolHandler,   // <-- TS2352: NetSelectArgs requires `network`, Record<string,unknown> does not provide it
  ...
};
```
The far larger group is in `src/tools/*.ts` (46 in transaction.ts, 45 in query.ts, 32 in verification.ts, 20 in network.ts), almost all of the form:
```
src/tools/network.ts(115,7): error TS2322: Type 'ToolResponse<unknown>' is not assignable to type 'ToolResponse<NetSelectResult>'.
```
Caused by `errorResponse` being non-generic. `apps/mcp-server/src/permissions.ts:239` and `:250`:
```ts
export function successResponse<T>(data: T, warnings?: string[]): ToolResponse<T> { ... }   // generic — OK
export function errorResponse(errors: ToolError[], warnings?: string[]): ToolResponse {       // <-- defaults T=unknown
  return { ok: false, permissions_effective: currentPermissionMode, errors, ... };
}
```
A function typed `Promise<ToolResponse<NetSelectResult>>` that does `return errorResponse([...])` therefore returns `ToolResponse<unknown>` → TS2322. The `TS18046 'result' is of type 'unknown'` cluster comes from `proxyRequest`/fetch helpers returning `unknown`; and `network.ts:7-10` `TS2305 'has no exported member NetworkId…'` resolves once `@accumulate-studio/types` is built fresh **and** the import is split into a `import type` (see §5 step 5).

### 2e. `packages/codegen` — ~30 errors
```
src/agent-files.ts(303,67): error TS2345: ... 'FlowAssertion' ... Index signature for type 'string' is missing ...
src/assertions-generator.ts(393,37): error TS2345: '`account:${string}`' is not assignable to 'AssertionType'.
   (+ 394/395/396 same shape)
src/flow-serializer.ts(249,7): error TS2322: '"secret:string"|...' is not assignable to 'VariableType'.
   (+ 252, 255 same shape)
src/manifest-loader.ts(8,28): error TS6307: File '.../python.sdk-manifest.json' is not listed within the file list
   of project '.../packages/codegen/tsconfig.json'. (+ rust/dart/csharp/javascript)
src/manifest-generator.ts(612,9): error TS6133: 'isRawLang' is declared but its value is never read.
   (… ~16 more TS6133/TS6196 unused-symbol errors across bundle-generator/project-scaffolds/assertions-generator)
```

### 2f. `scripts/check-manifest-drift.ts:17`
```ts
const LANGUAGES: SDKLanguage[] = ['python', 'rust', 'dart'];   // <-- C# and JS never drift-checked
```
But all 5 manifests exist: `ls packages/codegen/src/manifests/` → `csharp.sdk-manifest.json dart… javascript… python… rust…`.

### 2g. Studio skips typecheck
`apps/studio/package.json:6-13`:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",            // no tsc — composite:true would otherwise emit .js/.d.ts into src/
  "typecheck": "tsc --noEmit",
  ...
}
```
`apps/studio/tsconfig.json` has `"composite": true`; `.gitignore:12-17` exists solely to hide the stray emitted artifacts:
```
# (tsc with composite:true emits .js/.d.ts/.map alongside .tsx sources)
apps/studio/src/**/*.js
apps/studio/src/**/*.js.map
apps/studio/src/**/*.d.ts
apps/studio/src/**/*.d.ts.map
```

## 3. Root cause

1. **No CI** ever enforced a clean build, so errors accumulated unchecked.
2. **Studio**: `composite:true` makes a bare `tsc` emit into `src/`, so the team disabled tsc in the build instead of running it in `--noEmit` mode. Typechecking was never wired back in.
3. **mcp-server**: `errorResponse` is non-generic, so every handler that returns it loses its result type → the 51 `TS2322` errors. The 13 index.ts `TS2352` are a separate design smell: the registry erases each handler's arg type to `Record<string,unknown>` via direct `as ToolHandler`. The `TS18046` are untyped fetch/proxy results.
4. **codegen**: `noUnusedLocals/Parameters` (set in `tsconfig.base.json:13-14`) surface dead code; 3 real branded-template-literal mismatches; and `resolveJsonModule` is on but the JSON files are imported without being in the `include` glob → `TS6307`.
5. **drift script**: language list hard-coded to 3.

## 4. Target behavior & acceptance criteria

- [ ] `npm run build --workspaces` exits 0 with no `error TS` lines in any workspace.
- [ ] `apps/studio` typechecks on every build (CI fails on a studio type error) **without** emitting `.js`/`.d.ts` into `apps/studio/src/`.
- [ ] `npm run validate:manifests` checks **all 5** languages (`python, rust, dart, csharp, javascript`) and still exits non-zero on drift.
- [ ] A GitHub Actions workflow `.github/workflows/ci.yml` runs on `push` and `pull_request` and executes, in order: `npm ci` → typecheck → `npm run build --workspaces` → `npm test` → `npm run validate:manifests`. A red step fails the job.
- [ ] No new files appear under `apps/studio/src/` after a CI build (guard step asserts this).
- [ ] `.gitignore:12-17` artifact-hiding block can be removed (optional) once nothing emits into source — at minimum, CI verifies nothing is emitted.

## 5. Implementation steps

### Step 1 — Fix `packages/verification/src/state-diff.ts:321`
The `StateDiffEntry.after` field is typed `unknown`; `setPath` wants `JsonValue`. Narrow it.

Before (`:319-326`):
```ts
    } else {
      setPath(state, parts, entry.after);
    }
```
After:
```ts
    } else {
      setPath(state, parts, entry.after as JsonValue);
    }
```
`JsonValue` is already imported (used in the `applyDiff` signature). If not in scope, add it to the existing `import { JsonObject, JsonValue } from './types'` (verify the module path against the file's existing type import).

### Step 2 — Fix `packages/agent-pack` compile errors

(a) Export the two consts as **named** so `index.ts` re-export works. In `packages/agent-pack/src/sdk-mapper.ts`:
```ts
const KNOWN_ERRORS: SDKError[] = [          // line 161
```
→
```ts
export const KNOWN_ERRORS: SDKError[] = [
```
and `:107`:
```ts
const OPERATION_MAPPINGS: Record<string, { category: OperationCategory; requires: string[] }> = {
```
→
```ts
export const OPERATION_MAPPINGS: Record<string, { category: OperationCategory; requires: string[] }> = {
```
Leave the `export default {...}` block as-is.

(b) Unused symbols. **P1-9 deletes the dead introspection scaffolding entirely; if P1-9 lands first, these auto-resolve.** If P1-8 lands first, silence them minimally:
- `sdk-mapper.ts:11` remove `EntryPointKind` from its import.
- `sdk-mapper.ts:52` `LANGUAGE_PATTERNS` and `:184` `sdkPath` and `:337` `language` — these are addressed in P1-9 (either used by real introspection, or the function is removed). Until then, prefix unused params with `_` (`_sdkPath`, `_language`) and add `// eslint-disable-next-line` is NOT sufficient for tsc — instead reference `void LANGUAGE_PATTERNS;` at module top, OR (preferred) delete per P1-9. **Recommendation: sequence P1-9 before/with P1-8 so no throwaway suppression is written.**
- `generator.ts:397` `sdkMap` param and `templates/AGENTS.md.ts:129 mainEntry`, `:215 sdkMap`: rename unused params to a leading-underscore form (e.g. `_sdkMap`), which `noUnusedParameters` ignores by convention only if `tsconfig` does not also flag underscored — it does not flag `_`-prefixed params by default. Verify with a local `tsc --noEmit`.

### Step 3 — Fix `apps/mcp-server`

(a) Make `errorResponse` generic. In `apps/mcp-server/src/permissions.ts:250`:
```ts
export function errorResponse(errors: ToolError[], warnings?: string[]): ToolResponse {
```
→
```ts
export function errorResponse<T = never>(errors: ToolError[], warnings?: string[]): ToolResponse<T> {
```
`ToolResponse<T>`'s `data` field must be optional for `T = never` to type-check on the error branch (it is — error responses omit `data`). This single change clears the bulk of the 51 `TS2322` because `return errorResponse([...])` now infers `T` from the function's declared return type.

(b) Fix the `index.ts` handler registry `TS2352` (13). Replace per-handler `as ToolHandler` casts with a single typed wrapper that documents the erasure. In `apps/mcp-server/src/index.ts:58-83`:

Before:
```ts
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const toolHandlers: Record<string, ToolHandler> = {
  'net.list': netList as ToolHandler,
  'net.select': netSelect as ToolHandler,
  ...
};
```
After:
```ts
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

// Each tool validates its own args at runtime (see tools/*.ts).
// `asHandler` erases the specific arg type for the dynamic dispatch table.
function asHandler<A>(fn: (args: A) => Promise<unknown>): ToolHandler {
  return fn as unknown as ToolHandler;
}

const toolHandlers: Record<string, ToolHandler> = {
  'net.list': asHandler(netList),
  'net.select': asHandler(netSelect),
  'net.status': asHandler(netStatus),
  'acc.query': asHandler(accQuery),
  'acc.get_chain': asHandler(accGetChain),
  'acc.get_balance': asHandler(accGetBalance),
  'tx.build': asHandler(txBuild),
  'tx.estimate_credits': asHandler(txEstimateCredits),
  'tx.validate_prereqs': asHandler(txValidatePrereqs),
  'tx.submit': asHandler(txSubmit),
  'tx.wait': asHandler(txWait),
  'proof.get_receipt': asHandler(proofGetReceipt),
  'proof.verify_receipt': asHandler(proofVerifyReceipt),
  'trace.synthetics': asHandler(traceSynthetics),
};
```
The `as unknown as` double-cast is the TS-sanctioned escape hatch (what `TS2352` literally suggests) and is honest about the runtime-validated boundary.

(c) `index.ts:18` `toolsByName` unused — remove it from the `./tools/index.js` import list (keep `allTools`).

(d) `TS18046 'result'/'data'/'network'/'synResult' is of type 'unknown'` (the largest remaining group). These come from proxy/fetch helpers returning `unknown`. Fix at the source: type the proxy/JSON-RPC helper's return as a generic. Locate the helper (grep `proxyRequest`/`fetch(` in `apps/mcp-server/src/tools/`), e.g.:
```ts
async function proxyRequest(method: string, params: unknown): Promise<unknown> { ... }
```
→
```ts
async function proxyRequest<R = unknown>(method: string, params: unknown): Promise<R> {
  ...
  return data as R;
}
```
and pass the expected type at each call site, e.g. `const result = await proxyRequest<NetworkStatus>('status', {...})`. Where a call site genuinely cannot know the shape, narrow with a type guard before field access rather than leaving `unknown`. Work file-by-file (`network.ts` → `query.ts` → `transaction.ts` → `verification.ts`), re-running `npx tsc -p apps/mcp-server/tsconfig.json` after each until 0.

(e) `network.ts:7-10` `TS2305`. Convert the value-style import of type-only members to `import type` so `NodeNext` + `isolatedModules` resolves them as types (they were being looked up as runtime values). In `apps/mcp-server/src/tools/network.ts:6-11`:
```ts
import {
  NetworkId,
  NetworkConfig,
  NETWORKS,        // value — keep below
  NetworkStatus,
} from '@accumulate-studio/types';
```
→
```ts
import { NETWORKS } from '@accumulate-studio/types';
import type { NetworkId, NetworkConfig, NetworkStatus } from '@accumulate-studio/types';
```
> Note: this group only fully clears after `packages/types` is built (its `dist/` is consumed via the package `exports` map). CI's ordered `build --workspaces` builds `types` before `mcp-server`, so CI is deterministic; for local dev run `npm run build:types` first.

### Step 4 — Fix `packages/codegen`

(a) `manifest-loader.ts` `TS6307` (5). The JSON manifests are imported but not in the project's `include`. In `packages/codegen/tsconfig.json` add the manifests to `include`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*", "src/manifests/*.json"],
  "exclude": ["node_modules", "dist"]
}
```
(Confirm `resolveJsonModule: true` is inherited from base — it is, `tsconfig.base.json:7`.)

(b) Branded-template-literal mismatches:
- `assertions-generator.ts:393-396` — the helper builds `` `account:${x}` `` etc. but the parameter is typed `AssertionType`. Widen the helper param to `string` (it is already a formatted assertion ref) or cast at the call: `addAssertion(\`account:${x}\` as AssertionType, ...)`. Inspect `:393` to choose; prefer widening the param if the function only string-concatenates.
- `flow-serializer.ts:249/252/255` — `` `secret:${t}` `` / `` `optional:${t}` `` / `` `${t}=${d}` `` produced where `VariableType` is expected. Same remedy: cast the constructed literal `as VariableType` at the three sites, since these are serialization tags re-parsed downstream.
- `agent-files.ts:303` — `FlowAssertion` lacks a string index signature where `{ [k:string]: unknown; type: string }` is expected. Wrap: `serializeAssertion(a as unknown as { [k: string]: unknown; type: string })`, or better, change the consumer's param to accept `FlowAssertion`. Inspect `:303` and pick the narrower fix.

(c) Unused-symbol errors (`manifest-generator.ts:612 isRawLang`, `bundle-generator.ts:7/8/13/449/456`, `project-scaffolds.ts:6/418/635/837/1046`, `assertions-generator.ts:9/91/205/229`, `agent-files.ts:369`, `flow-serializer.ts:188`): delete the dead local/import, or rename unused destructured/loop vars to `_`. These are mechanical; do them last and re-run tsc.

### Step 5 — Studio typecheck without source emit

Add `vite-plugin-checker` so `vite build` runs `tsc --noEmit` in-process (no stray emit), and make `build` fail on type errors.

Install (root, hoisted): `npm i -D vite-plugin-checker --workspace=apps/studio`.

`apps/studio/vite.config.ts` — add the plugin:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    checker({ typescript: { tsconfigPath: './tsconfig.json' } }),
  ],
  ...
});
```
`vite-plugin-checker` invokes the TS API in `--noEmit` mode, so `composite:true` does **not** write artifacts. Keep `apps/studio/package.json:8` as `"build": "vite build"` — the checker now enforces types and **fails the build** on error (default behavior in build mode).

> Alternative if you do not want a new dependency: change the script to `"build": "tsc -b --emitDeclarationOnly false --noEmit && vite build"`. This is rejected here because `tsc -b` on a `composite` project still wants to emit `.tsbuildinfo`/declarations and is fiddly to keep out of `src/`; `vite-plugin-checker` is the lower-friction, well-supported path.

After this lands, `.gitignore:12-17` (the composite-emit hide block) is no longer load-bearing; leave it or remove it — CI step 6 will assert no emit regardless.

### Step 6 — Extend `scripts/check-manifest-drift.ts` to all 5 languages
`scripts/check-manifest-drift.ts:17`:
```ts
const LANGUAGES: SDKLanguage[] = ['python', 'rust', 'dart'];
```
→
```ts
const LANGUAGES: SDKLanguage[] = ['python', 'rust', 'dart', 'csharp', 'javascript'];
```
No other change needed — the loop already `SKIP`s missing manifests and the validator is language-agnostic. (Both new manifest files exist, so they will be actively validated, not skipped.)

### Step 7 — Add `.github/workflows/ci.yml`
Create the file verbatim:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: typecheck · build · test · manifests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install (clean)
        run: npm ci

      # types must build first so dist/ is fresh for downstream workspaces
      - name: Build @accumulate-studio/types
        run: npm run build:types

      - name: Typecheck (all workspaces with a typecheck script)
        run: npm run typecheck

      - name: Build all workspaces
        run: npm run build --workspaces

      - name: Assert studio did not emit into src/
        run: |
          if git status --porcelain apps/studio/src | grep -E '\.(js|d\.ts)(\.map)?$'; then
            echo "::error::vite build emitted compiled artifacts into apps/studio/src — composite emit leaked"
            exit 1
          fi

      - name: Test
        run: npm test

      - name: Validate SDK manifests (all 5 languages)
        run: npm run validate:manifests
```
Notes for the implementer:
- `npm test` maps to root `"test": "npm run test --workspaces --if-present"` — already vitest-based per workspace.
- `npm run typecheck` maps to `npm run typecheck --workspaces --if-present`; studio/verification/agent-pack/codegen all define `typecheck`. This is the gate that catches studio type errors even before the vite-checker build.
- The Python `apps/sdk-proxy` is intentionally out of scope (no Node build); add a separate Python job later if desired.

## 6. Tests / verification

Run locally from repo root (Git Bash):
```bash
npm ci
npm run build:types
npm run typecheck                 # expect: no "error TS" lines
npm run build --workspaces        # expect: each workspace prints its build with no TS errors, exit 0
git status --porcelain apps/studio/src    # expect: EMPTY (no leaked .js/.d.ts)
npm test                          # expect: vitest passes per workspace
npm run validate:manifests        # expect: 5 sections [python][rust][dart][csharp][javascript] all PASS
```
Expected `validate:manifests` tail:
```
[csharp] PASS
[javascript] PASS
RESULT: PASS - All manifests valid.
```
Per-workspace error-count check while fixing mcp-server:
```bash
( cd apps/mcp-server && npx tsc -p tsconfig.json 2>&1 | grep -c "error TS" )   # drive to 0
```

CI verification: push a branch, open a PR, confirm the `CI` check runs all 7 steps green. Then push a deliberate type error into `apps/studio/src` and confirm the **Typecheck** (and Build) step goes red.

Manual checklist:
- [ ] `.github/workflows/ci.yml` exists and is valid YAML (GitHub shows the workflow under Actions).
- [ ] A PR with a studio type error is blocked.
- [ ] A PR adding a block without a C#/JS manifest op fails `validate:manifests`.
- [ ] No `.js`/`.d.ts` files appear in `apps/studio/src` after a clean build.

## 7. Risks, rollback, out of scope

**Risks**
- Fixing mcp-server may surface *additional* latent errors once the dominant `errorResponse` cascade clears; budget time to chase the long tail file-by-file.
- `vite-plugin-checker` adds dev-dependency surface and can slow `vite build` slightly; acceptable for correctness.
- Making CI required could block unrelated PRs until the first green build lands — sequence the source fixes *before* marking the check required.

**Rollback**
- Revert `ci.yml` to disable the gate (workflow file deletion).
- Studio: revert `vite.config.ts` plugin addition; `build` returns to non-typechecking behavior.
- Each source fix is independently revertable per workspace.

**Out of scope**
- Re-architecting the mcp-server tool dispatch to be fully type-safe (zod-validated args) — only the minimal honest cast is in scope here.
- P1-9's substantive agent-pack introspection decision (this doc only clears its compile errors).
- A Python CI job for `apps/sdk-proxy`.
