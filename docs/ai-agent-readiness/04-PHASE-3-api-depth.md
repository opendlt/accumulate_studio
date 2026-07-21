# Phase 3 — API Depth & Ergonomics

> **Goal:** deepen the surface so an agent's autocomplete, type-checker, and error handling all *guide it toward correct code*: typed transaction bodies & queries, exactly one canonical entry point per SDK, a unified typed error hierarchy wired into the live path, an `Amount` helper that kills the ×1e8 footgun, and inline runnable examples (doctests/`@example`) where the agent hovers.

**Exit gate:** K6 = 100% (all tx builders return typed objects), K7 ≥ 95% (typed+coded errors on failure paths), one documented canonical entry point per SDK, and harness K2 ≥ 90% first-try.

**Depends on:** P1 (correct, stable surface) and P2 (manifest carries `units`/`errorCodes`/`canonicalEntryPoint`).

---

## P3.1 Workstream A — Typed transaction bodies & queries (K6)

Today Rust `TxBody` returns `serde_json::Value` and C# returns `Dictionary<string, object?>` — both have fully-typed protocol models sitting unused next to them. This is the biggest discoverability loss for agents (no field-level autocomplete, no compile-time checks).

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P3-RS-01** | `unified/src/helpers.rs` (`TxBody` builders) | Return typed structs from `generated::transactions` with `impl Into<Value>` (keep ergonomic constructors). Keep a `Value` escape hatch. | `cargo doc` shows typed fields; agent gets field autocomplete; K6 Rust=100% | L |
| **P3-RS-02** | `unified/src` | Add a **typed query API** (`query_account`, `query_balance`, `get_oracle` → typed results) mirroring `TxBody`, replacing raw `call_v3::<Value>("query", …)` seen across examples | Reads and writes feel like one SDK; examples use typed queries | M |
| **P3-CS-01** | `src/Acme.Net.Sdk/Transactions/TxBody.cs` | Return the typed `Protocol/Generated/Protocol/*` bodies (which mirror `TxBody` names 1:1) instead of `Dictionary<string,object?>`; keep a dict shim marked `[Obsolete]` for one minor | IntelliSense shows typed members; K6 C#=100% | L |
| **P3-PY-01** | `convenience.py` `TxBody` | `TxBody.*` returns raw wire dicts with `camelCase` keys while the rest is `snake_case` Pydantic. Offer typed Pydantic body returns (with `.to_wire()`), keeping dict for back-compat | Consistent typing; agents stop mixing conventions | M |
| **P3-DT-01** | `lib/src/build/builders.dart` | `TxBody` builders already typed-ish but take stringly amounts; ensure return types are concrete body classes, add a typed query path (`client.v3.queryAccount(url)`) to replace `rawCall("query", …)` | Typed queries available; README quickstart no longer uses `rawCall` | M |
| **P3-JS-01** | `src/helpers/tx_body.ts` | Ensure `TxBody.*` returns typed body objects (TS) rather than loose records; align with the fixed `.d.ts` from P1 | Consumer autocomplete on tx fields; K6 JS=100% | M |
| **P3-XR-01** | manifest | Record `canonicalEntryPoint` + typed return type per op so `llms-full.txt` and MCP reflect the typed surface | Artifacts show typed signatures | S |

---

## P3.2 Workstream B — Unified typed errors, wired into the live path (K7)

**Python is the reference design** (`runtime/errors.py`: `ErrorCode` enum, `error_from_response()`, `ErrorHandler.is_retryable()/should_wait_for_tx()/extract_tx_hash()`). Port its shape to the other four and — critically for Dart — **wire it into the code path that actually throws.**

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P3-DT-02** | `lib/src/generated/api/json_rpc_client.dart`, `lib/src/generated/runtime/errors.dart` | **Wire the dead `AccError` taxonomy in.** Today the live path throws flat `JsonRpcException`; `JsonRpcErrorMapper.mapRpcError` has zero call sites. Call it in `Transport.call`/V3 client so RPC errors surface as typed `AccError`. Collapse the 3 hierarchies to 1. | `on ValidationError catch` actually catches; harness error task passes; K7 Dart→~100% | L |
| **P3-CS-02** | `Exceptions/AccumulateException.cs`, `TransactionException.cs` | Collapse the two overlapping hierarchies (`AccumulateValidationException` vs `TransactionValidationException`) into one documented taxonomy; actually throw the custom types (today dominated by generic `ArgumentNullException`/`InvalidOperationException`) | One documented hierarchy; custom types used on real failures | M |
| **P3-RS-03** | `unified/src/errors.rs`, `json_rpc_client.rs` | Reconcile `errors::Error` vs `JsonRpcError` (overlapping variants). Pick one public return type per method; mark the other internal; document in README | Agents no longer guess between two enums; K7 Rust≥95% | M |
| **P3-JS-02** | `src/errors/types_gen.ts:51`, `src/api_v2/*` | The protocol-generated class literally named `Error` shadows global `Error`. Rename/alias it (e.g. `ProtocolError`) so it doesn't collide; ensure thrown errors (`TxError`, `RpcError`) are exported and documented | No `Error` shadow; typed errors discoverable; K7 JS≥95% | M |
| **P3-XR-02** | manifest + `llms-full.txt` | Emit the error-code table per op from the manifest so agents can branch on codes without triggering them | Error catalog in every `llms-full.txt` | S |

---

## P3.3 Workstream C — One canonical entry point (principle #3)

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P3-DT-03** | `lib/opendlt_accumulate.dart` (root export) | 5+ competing clients (`Accumulate`, `AccumulateClient`, `AccumulateV3`, `AccumulateHelper`, `QuickStart`, `SmartSigner`). Document `Accumulate`+`SmartSigner` as canonical; `@Deprecated` or drop the rest from the root export; remove `hide/show` collisions by fixing duplicate type names | README shows one path; `dir`/autocomplete foregrounds the canonical few | M |
| **P3-CS-03** | `src/Acme.Net.Sdk/AcmeClient.cs` | Two paradigms (`Accumulate`+`TxBody` vs `AcmeClient` builder). Mark `AcmeClient` legacy in code+README or remove; keep the README-blessed path as the only documented one | One obvious way; harness never offered two paradigms | M |
| **P3-PY-02** | `unified/src/accumulate_client/__init__.py` | Replace nine `import *` wildcards with explicit exports/curated `__all__` so `dir(accumulate_client)` foregrounds `Accumulate`, `TxBody`, `SmartSigner`, `QuickStart` instead of hundreds of names | Clean top-level namespace; better autocomplete signal | S |
| **P3-RS-04** | `unified/src/lib.rs` | Trim glob re-exports (`generated::signatures::*` etc.) and the redundant `GenericAccumulateClient` alias; present one clear client + `QuickStart`/`SmartSigner`/`TxBody` | Smaller, coherent public surface | M |

---

## P3.4 Workstream D — Amount helper (kills the ×1e8 footgun)

The single most common agent error across JS/Dart/Rust/C# is ACME amount scaling (1 ACME = 1e8 base units), currently conveyed only in comments.

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P3-XR-03** | all 5 SDKs | Add an `Amount`/`Acme` helper: `Amount.acme(1)`, `Amount.baseUnits("100000000")`, `Amount.credits(100)` returning the correct wire value. Accept it wherever a raw amount string is taken today. Document as the recommended way. | Harness amount tasks pass first-try; `llms-full.txt` shows `Amount.acme(...)` in examples | M |

---

## P3.5 Workstream E — Inline runnable examples where agents hover (docstrings)

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P3-RS-05** | `unified/src` | Add `# Examples` doctests to `QuickStart`, `SmartSigner::sign_submit_and_wait`, and the top ~6 `TxBody` methods (zero doctests exist today); CI runs `cargo test --doc` | Rustdoc hover shows runnable examples; doctests pass in CI | M |
| **P3-JS-03** | `src/helpers/*` | Add `@example` blocks to `SmartSigner.signSubmitAndWait`, main `TxBody.*`, `QuickStart` (only 2 `@example` exist in the whole tree) | Hover-docs carry usage; TypeDoc renders examples | S |
| **P3-CS-04** | `src/Acme.Net.Sdk/*` | Add `<example>` blocks to the canonical methods (zero exist); now visible because P1 ships the `.xml` | IntelliSense shows examples | S |
| **P3-DT-02b** | `lib/src/generated/types/*` | Add dartdoc to the thinly-documented generated types layer that is publicly re-exported | Autocomplete on those types carries guidance | M |
| **P3-PY-03** | `convenience.py` builders | Add Google-style `Args:/Returns:` with units to the terse one-line factory docstrings | Consistent, unit-bearing docstrings | S |

---

## P3.6 Verification protocol

1. **Typed bodies (K6):** in each lang, write a program that constructs a tx body and references a **wrong field name** → must be a compile/type error (Rust/C#/TS/Dart) or a validation error (Python), proving typing is real. K6 → 100%.
2. **Errors (K7):** for each SDK, force each failure class (insufficient credits, unknown account, bad signature) → assert a **typed, coded** error is raised (Dart: assert `on ValidationError catch` now fires). K7 ≥ 95%.
3. **Canonical entry point:** `dir()`/autocomplete/`cargo doc` shows one obvious client; harness records that the agent chose it without prompting.
4. **Amount helper:** run the send-tokens + add-credits tasks; confirm agents use `Amount.acme(...)` from `llms-full.txt` and pass first-try.
5. **Doctests/examples:** `cargo test --doc`, TypeDoc build, and C# doc build all pass; examples in hover match runnable code.
6. Re-run full harness; K2 first-try ≥ 90%, K3 turns-to-first-tx ≤ 6. Update `SCORECARD.md`.

---

## P3.7 Rollback / compatibility

- Typed-body and error refactors ship **behind deprecated shims** (dict/`Value` constructors, old error types) for one minor version; provide codemod notes in each `CHANGELOG`.
- Removing/deprecating extra entry points is source-compatible if done via `@deprecated`/`[Obsolete]` first, remove next major.
- All changes gated by the harness + conformance matrix before publish; a regression in any lang blocks the fleet release (WS-5).

---

## P3.8 Deliverables

- Typed tx bodies + typed queries in all 5 SDKs (K6=100%).
- One unified, typed, coded error hierarchy per SDK, **wired into the live path** (Dart fixed), modeled on Python (K7≥95%).
- One documented canonical entry point per SDK.
- `Amount` helper across the fleet.
- Doctests/`@example`/`<example>` on canonical methods.
- Harness K2≥90%, K3≤6; updated scorecard.

**Next:** `05-PHASE-4-differentiation.md`.
