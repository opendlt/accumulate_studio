# Phase 1 — Front-Door Correctness

> **Goal:** the documented quickstart runs **verbatim** in all five languages, and every published package ships the type/doc signals an agent relies on. This is the highest-ROI phase: it is mostly small, surgical edits, but it is the difference between an agent succeeding on turn 1 and failing at `install`.

**Exit gate:** K1 = 5/5 (harness quickstart-verbatim passes every lang); `artifact-verify --all` green for name-parity, type signals, and doc signals; docs-drift CI (K10) green; fleet versions on a converged plan (K8).

**Depends on:** P0 (harness + artifact-verify must exist to prove these fixes).

---

## P1.1 Principle

Every change in this phase is validated **against the published artifact and the harness**, not the source tree. A fix is "done" only when `artifact-verify` turns that check green and the harness quickstart step passes unedited.

---

## P1.2 Task table — Rust (`opendlt-rust-v2v3-sdk`)

| ID | File / target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P1-RS-01** | `unified/README.md` (install snippet, badges) | Replace `accumulate-client = "2.0"` with `accumulate-sdk = "2.1"`; fix crates.io badge/links to `accumulate-sdk`. Clarify that the *lib import name* is `accumulate_client` (that part is correct). | `cargo add accumulate-sdk` from README works; `artifact-verify` name check green | S |
| **P1-RS-02** | `unified/src/lib.rs` (crate docs) | Expand the 2-line `//!` to `#![doc = include_str!("../README.md")]` (or a condensed getting-started block) so docs.rs/rustdoc and agents see the quickstart in-crate | `cargo doc` shows quickstart on the crate root page | S |
| **P1-RS-03** | `unified/README.md` | Add an explicit note reconciling the two error enums (`errors::Error` vs `JsonRpcError`): state which public methods return which | README error section unambiguous; harness error-handling task passes | S |
| **P1-RS-04** | crates.io metadata (`Cargo.toml`) | Ensure `description`, `documentation`, `repository`, `readme` fields point at the right places; consider a `[package.metadata]` note that `accumulate-client` is only the lib name | `cargo publish --dry-run` clean; crates.io page consistent | S |

---

## P1.3 Task table — JavaScript/TypeScript (`opendlt-javascript-v2v3-sdk/javascript`)

This is the most broken front door; three independent packaging defects.

| ID | File / target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P1-JS-01** | `README.md` (all occurrences ~L31,34,49,50,77) | Global replace `accumulate.js` → `accumulate-sdk-opendlt`; `accumulate.js/helpers` → `accumulate-sdk-opendlt/helpers` | README install/import matches npm; harness quickstart passes | S |
| **P1-JS-02** | `package.json:12` + `exports["."].types` | `types` points to `lib/index.d.ts` which does not exist. Either add `lib/index.d.ts` shim (`export * from "./src/index.js";`) mirroring the existing `lib/index.js`, or repoint to `./lib/src/index.d.ts` | `tsc` consumer sees types; `artifact-verify` types check green | S |
| **P1-JS-03** | `tsconfig.json` + `package.json` `exports` | Root cause fix: set `rootDir: "src"` and drop `examples/**` from `include` so tsc emits under `lib/*` (not `lib/src/*`), making every `exports` subpath (`./core`, `./api_v2`, …) resolve. Re-verify each subpath. | Every `exports` subpath resolves; `artifact-verify` exports check green | M |
| **P1-JS-04** | `package.json` `exports` | Add the `"./helpers"` subpath used in docs (currently absent → strict-ESM import throws) | `import 'accumulate-sdk-opendlt/helpers'` resolves | S |
| **P1-JS-05** | `README.md` top | Add an explicit amount-scaling note (ACME ×1e8; `BigInt(100_000_000)` = 1 ACME) — the single most common agent error in JS | Harness send-tokens task passes first-try more often | S |
| **P1-JS-06** | version | Bump from `0.12.3` toward the fleet line (see P1-XR-01); publish a corrected `0.12.4`/`2.0.0` per the version decision | New version on npm passes `artifact-verify` | S |

---

## P1.4 Task table — C# (`opendlt-c-sharp-v2v3-sdk`)

Package **is published** (`Acme.Net.Sdk` 1.1.0). The problems are: no XML docs shipped, stale example readme, endpoint mismatch, public-surface noise.

| ID | File / target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P1-CS-01** | `src/Acme.Net.Sdk/Acme.Net.Sdk.csproj` | Add `<GenerateDocumentationFile>true</GenerateDocumentationFile>` and ensure the `.xml` is packed. Unlocks all ~5,527 existing `///` comments for IntelliSense/agents at zero authoring cost. | Republished nupkg contains `lib/net9.0/Acme.Net.Sdk.xml`; `artifact-verify` xml check green | S |
| **P1-CS-02** | `examples/ExampleReadme.md:26-30` | Fix `.NET 6.0` → `.NET 9.0`; the `dotnet add package Acme.Net.Sdk` line is now **correct** (package is published) — keep it but verify it | `dotnet add package` works; framework text matches csproj | S |
| **P1-CS-03** | `src/Acme.Net.Sdk/Core/NetworkEndpoint.cs:~20` | Reconcile `Testnet()` (points at `testnet.accumulatenetwork.io`) with docs/examples that use `kermit.accumulatenetwork.io`. Either repoint `Testnet()` or add an explicit `Kermit()` factory and make docs/examples consistent | `Accumulate.Testnet()` and README quickstart target the same host; harness passes | S |
| **P1-CS-04** | `src/Acme.Net.Sdk/Class1.cs` | Delete the leftover `public class Class1` template stub | Not present in public surface | XS |
| **P1-CS-05** | `examples/` (`AcmeExample.cs`, `AcmeComplexExample.cs`, root `test_writedata.cs`) | Remove/relocate legacy `AcmeClient`-based samples and the stray `Main`; add `examples/v3/README.md` mapping the 16 canonical examples | `examples/v3/` is the single obvious index; no duplicate `Main` | S |
| **P1-CS-06** | version | Plan C# `1.1.0 → 2.x` convergence (P1-XR-01); verify feature parity before bumping the major | Version-line spread reduced; conformance matrix consulted | M |

---

## P1.5 Task table — Python (`opendlt-python-v2v3-sdk`)

Package works; the defect is the confusing repo-root vs `unified/` duality and drifted introspection tooling.

| ID | File / target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P1-PY-01** | root `README.md` | Demote to a ~5-line pointer to `unified/`; remove the divergent `accumulate-client` name and license claims | An agent landing at repo root is routed to the real package; no wrong-name claim | S |
| **P1-PY-02** | root `pyproject.toml` vs `unified/pyproject.toml` | Reconcile package name, license, and dependency sets; make the root non-publishable or a thin meta | `pip install accumulate-sdk-opendlt` unaffected; no conflicting metadata | S |
| **P1-PY-03** | `unified/tooling/scripts/selfcheck.py` | Fix the two stale expected counts (enums 14→15, api methods ~35→18 actual) so `selfcheck` returns **green** — a WARN makes an agent think the install is broken | `python tooling/scripts/selfcheck.py` → OK; `reports/selfcheck.json` green | S |
| **P1-PY-04** | `unified/examples/v3/*` | Env-drive endpoints (`os.getenv("ACC_ENDPOINT", KERMIT_V3)`) instead of hardcoding, so an agent can retarget devnet without editing source | Examples run against env-specified network | S |
| **P1-PY-05** | `unified/src/accumulate_client/convenience.py` (e.g. `add_credits`) | Document units on `TxBody` builders (`amount` is base-unit string ×1e8; `oracle` is int price) — the exact place agents produce wrong-amount bugs | Docstrings state units; harness amount tasks pass | S |

---

## P1.6 Task table — Dart (`opendlt-dart-v2v3-sdk`)

Package **is published and verified**. Front-door issues are minor/cosmetic; the substantive Dart work (dead error hierarchy, competing entry points) is in Phase 3. Front-door items here:

| ID | File / target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P1-DT-01** | `unified/README.md` | Update pin `^2.0.0` → `^2.1.0` for clarity (cosmetic; `^2.0.0` already resolves to 2.1.1) and confirm the pub.dev install line | `dart pub add opendlt_accumulate` matches README | XS |
| **P1-DT-02** | `unified/example/flows/` | Move ~30 `debug_*`/`test_*`/`verify_*` scratch files to `tool/` or `test/manual/`, leaving only numbered golden-path scripts an agent should copy | `example/flows/` contains only canonical examples; harness "read an example" step unambiguous | S |
| **P1-DT-03** | `unified/doc/temp_docs/` (`GAP_ANALYSIS.md`, `SDK_AUDIT_REPORT.md`) | Delete or mark clearly internal so an agent doesn't ingest stale "gaps" as current truth | Stale audit docs not agent-reachable | XS |
| **P1-DT-04** | `unified/README.md` | Add the ACME ×1e8 amount note near the quickstart (same footgun as JS) | Amount tasks pass more reliably | XS |

---

## P1.7 Cross-repo tasks

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P1-XR-01** | all 5 repos | **Version convergence decision & execution.** Decide the fleet line (recommend converging on `2.x`). Bump C# 1.1.0→2.0.0 and JS 0.12.3→2.0.0 once parity is verified via the conformance matrix; keep Rust/Python/Dart on 2.1.x. Document the policy in `docs/ai-agent-readiness/00-MASTER-PLAN.md` §7. | K8 spread ≤ 1 minor; conformance matrix consulted before any major bump | M |
| **P1-XR-02** | all 5 repos | **Docs-drift CI gate (K10).** Add `artifact-verify` (from P0) as a required check on each SDK repo so README name/version/type/doc claims can't drift from the shipped artifact again | Per-PR CI red on any drift | M |
| **P1-XR-03** | all 5 READMEs | Standardize the **first screen**: identical structure — install → 10-line quickstart the harness runs verbatim → link to `llms.txt` (added in P2) → examples index | All READMEs lead with a harness-verified quickstart | S |

---

## P1.8 Verification protocol

1. For each SDK, run the **exact** install+import+quickstart from the (edited) README inside a clean container → must succeed unedited. This is K1; target 5/5.
2. Republish (or dry-run publish) each package; run `artifact-verify --all` → all name/type/doc checks green. Specifically re-download the C# nupkg and confirm `Acme.Net.Sdk.xml` is now present.
3. Run the harness's 8 tasks × 5 langs; confirm no task now fails at install/import (isolating remaining failures to API-depth issues addressed in P3).
4. Confirm docs-drift CI (P1-XR-02) is red when you deliberately reintroduce a wrong package name, then green after revert.
5. Update `SCORECARD.md`; K1 should flip 3/5 → 5/5.

---

## P1.9 Rollback

- Each task is an isolated docs/config/metadata edit or file move — revert the commit.
- Version bumps (P1-XR-01): publish is forward-only; mitigate by dry-run + harness pass **before** `publish`. If a bad version ships, yank/deprecate and publish a patch (do not delete).
- The C# `GenerateDocumentationFile` change is purely additive to the package; no consumer breakage.

---

## P1.10 Deliverables

- 5 corrected READMEs leading with harness-verified quickstarts.
- JS packaging fixed (types entry + exports map + helpers subpath).
- C# nupkg shipping XML docs; stale example readme/endpoint fixed; `Class1` removed.
- Python root/unified reconciled; selfcheck green.
- Dart examples de-cluttered; stale audit docs removed.
- Version-convergence policy documented and in motion.
- `artifact-verify` a required CI check on all 5 repos.

**Next:** `03-PHASE-2-machine-interface.md`.
