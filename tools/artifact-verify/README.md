# artifact-verify (Phase 0 · P0-ST-07)

Deterministic, agent-free verifier of the **published** Accumulate SDK artifacts. It downloads each package from its real registry and asserts the signals an AI coding agent depends on. It is the enforcement engine for KPIs **K1** (quickstart install works), **K5** (llms.txt shipped, from Phase 2), **K8** (fleet version parity), and **K10** (docs-vs-artifact drift).

> **Principle:** verify the *downloaded artifact*, never the source tree or a rendered registry page. Both original baseline-assessment errors ("C# unpublished", "Dart publication unverified") came from not doing this. This tool exists so those mistakes cannot recur.

## Run

```bash
node tools/artifact-verify/verify.mjs            # human table + exit code
node tools/artifact-verify/verify.mjs --json     # machine-readable JSON
node tools/artifact-verify/verify.mjs --out artifact-verify.json
# or:
npm run verify:artifacts
```

Exit code `0` when there are no `FAIL` checks; `1` otherwise. `EXPECTED_FAIL` (e.g. llms.txt before Phase 2) and `SKIP` do not fail the run. Requires **Node ≥ 18** (global `fetch`) and system `tar`/`unzip` to inspect archive contents.

## Checks

| Check | What it asserts | Registries |
|---|---|---|
| `NAME_PARITY` | The install name the README tells agents to use actually exists and is the real package | all |
| `TYPE_SIGNALS` | Package ships the type/doc files agent tooling reads (`py.typed`, `.xml`, `types` entry) | pypi, nuget, npm |
| `EXPORTS_RESOLVE` | Every `exports`-map target resolves to a real file in the tarball | npm |
| `LLMS_TXT` | Package ships `llms.txt`/`llms-full.txt` (added in Phase 2) | all |
| `VERSION` / `VERSION_PARITY` | Latest published version per SDK; distinct minor lines across the fleet (K8) | all |

## Baseline result (2026-07-21)

| Lang | Version | NAME_PARITY | TYPE_SIGNALS | Notes |
|---|---|---|---|---|
| rust | 2.1.1 | ❌ | — | README says `accumulate-client` (does not exist); real crate `accumulate-sdk` |
| python | 2.1.1 | ✅ | ✅ | ships `py.typed` |
| dart | 2.1.1 | ✅ | — | published + verified publisher |
| csharp | 1.1.0 | ✅ | ❌ | nupkg ships no `.xml` doc file |
| javascript | 0.12.3 | ❌ | ❌ | README says `accumulate.js` (wrong pkg); `types` entry missing; 27 exports unresolved |

Fleet version parity ❌ — 3 distinct minor lines (2.1, 1.1, 0.12).

## Extending

The target definitions live at the top of `verify.mjs` (`TARGETS`). When Phase 1 fixes a README name or ships XML docs, no code changes are needed — re-run and the check flips green. When Phase 2 ships `llms.txt`, the `LLMS_TXT` checks flip from `EXPECTED_FAIL` to `PASS`. To add a new signal, add a registry-metadata check (via `fetch`) or an artifact-content check (via `listArchive`).
