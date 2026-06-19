# Accumulate Studio — Remediation Roadmap

> Generated from the June 2026 deep audit. This directory contains one hyper-detailed
> implementation doc per finding/opportunity. Each doc is self-contained: problem,
> evidence (with `file:line`), root cause, acceptance criteria, step-by-step
> implementation with real code, tests, and rollback.

## The one-paragraph problem statement

The studio **demos** beautifully but **delivers** a fraction of what it shows. The code a
developer *sees* in the UI is fully implemented across all 5 SDKs. The code they
*download*, the *receipts* they're told are "verified," and the *synthetics* they're told
are "delivered" are substantially placeholder. The backend that signs real transactions is
an open, unauthenticated oracle. The headline promise — *"capture fully working code"* — is
broken at the last mile. This roadmap closes that gap in four themed milestones: **Safety →
Deliver the Promise → Honesty → Delight.**

---

## Priority legend

| Tag | Meaning |
|-----|---------|
| **P0** | Critical — core promise broken or a safety hazard. Do first. |
| **P1** | High — reliability, correctness, or first-run UX dead-ends. |
| **P2** | Medium — correctness polish & consistency. |
| **P3** | Opportunity — dramatic UX improvements (delight). |

Effort: **S** = <1 day · **M** = 1–3 days · **L** = 3–5 days · **XL** = >5 days.

---

## Ranked master index

### P0 — Critical (the core promise / safety)

| ID | Title | Effort | Risk | Doc |
|----|-------|--------|------|-----|
| **P0-1** | Secure the SDK proxy (auth, CORS, mainnet guard, TLS, session lifecycle) | L | High | [P0-1-secure-sdk-proxy.md](./P0-1-secure-sdk-proxy.md) |
| **P0-2** | Unify on one codegen engine (kill the 6/25 scaffold path) | M | Med | [P0-2-unify-codegen-engine.md](./P0-2-unify-codegen-engine.md) |
| **P0-3** | Make "Export Bundle" produce a real, zipped, runnable project | M | Med | [P0-3-real-export-bundle.md](./P0-3-real-export-bundle.md) |
| **P0-4** | Real cryptographic receipt verification (or honest relabeling) | M | Med | [P0-4-real-receipt-verification.md](./P0-4-real-receipt-verification.md) |
| **P0-5** | Honest synthetic-transaction tracing (query real status) | M | Med | [P0-5-honest-synthetic-tracing.md](./P0-5-honest-synthetic-tracing.md) |

### P1 — High (reliability, correctness, first-run UX)

| ID | Title | Effort | Risk | Doc |
|----|-------|--------|------|-----|
| **P1-1** | Blank-canvas empty state + first-action call-to-action | S | Low | [P1-1-canvas-empty-state.md](./P1-1-canvas-empty-state.md) |
| **P1-2** | Wire the keyboard shortcuts (undo/redo/delete/save/run) + cheatsheet | S | Low | [P1-2-keyboard-shortcuts.md](./P1-2-keyboard-shortcuts.md) |
| **P1-3** | Single source of truth for execution state in the Header | S | Low | [P1-3-header-execution-state.md](./P1-3-header-execution-state.md) |
| **P1-4** | Inline required-field validation that gates Save & Execute | M | Low | [P1-4-required-field-validation.md](./P1-4-required-field-validation.md) |
| **P1-5** | Fix the network "split-brain" (submit vs. read on different chains) | M | Med | [P1-5-network-split-brain.md](./P1-5-network-split-brain.md) |
| **P1-6** | Version + migrate the flow-store; safe rehydration | S | Low | [P1-6-flow-store-versioning.md](./P1-6-flow-store-versioning.md) |
| **P1-7** | Request timeouts + honored cancellation on all network calls | M | Med | [P1-7-request-timeouts-and-abort.md](./P1-7-request-timeouts-and-abort.md) |
| **P1-8** | Restore build soundness + add CI (typecheck, build, test, drift) | **L** | Med | [P1-8-ci-and-build-soundness.md](./P1-8-ci-and-build-soundness.md) |
| **P1-9** | Fix or honestly scope agent-pack SDK introspection | L | Low | [P1-9-agent-pack-introspection.md](./P1-9-agent-pack-introspection.md) |

### P2 — Medium (correctness polish)

| ID | Title | Effort | Risk | Doc |
|----|-------|--------|------|-----|
| **P2-1** | Codegen correctness cluster (multi-recipient refs, silent demotion, comments, ref heuristics) | M | Med | [P2-1-codegen-correctness.md](./P2-1-codegen-correctness.md) |
| **P2-2** | End-to-end amount-scaling audit & fix (credits/tokens 1e8 vs ×100) | M | Med | [P2-2-amount-scaling-audit.md](./P2-2-amount-scaling-audit.md) |
| **P2-3** | UX polish (toasts, native dialog replacement, unified add-block, dead state, Monaco theme) | M | Low | [P2-3-ux-polish.md](./P2-3-ux-polish.md) |
| **P2-4** | Accessibility pass (dropdowns, canvas labels, resize handles, focus) | M | Low | [P2-4-accessibility.md](./P2-4-accessibility.md) |
| **P2-5** | Verification package: honesty fixes, tests, single consumer | S | Low | [P2-5-verification-package-correctness.md](./P2-5-verification-package-correctness.md) |

### P3 — Opportunity (dramatic UX)

| ID | Title | Effort | Risk | Doc |
|----|-------|--------|------|-----|
| **P3-1** | Interactive first-run product tour + re-openable Help | M | Low | [P3-1-onboarding-tour.md](./P3-1-onboarding-tour.md) |
| **P3-2** | Real template thumbnails (rendered flow mini-graphs) | M | Low | [P3-2-template-thumbnails.md](./P3-2-template-thumbnails.md) |
| **P3-3** | Share / permalink (encode a flow in a URL) | M | Low | [P3-3-share-permalinks.md](./P3-3-share-permalinks.md) |
| **P3-4** | Live code preview that updates as you build + theme sync | S | Low | [P3-4-live-code-preview.md](./P3-4-live-code-preview.md) |

---

## Dependency graph

```
P0-1 (proxy security) ───────────────► gates public deploy
P1-8 (CI/build) ─────────────────────► gates every merge after it lands

P0-2 (unify codegen) ──► P0-3 (real export) ──► P3-4 (live preview reuses 1 engine)
                     └─► P2-1 (codegen correctness shares the engine)

P1-5 (network split-brain) ──► P0-4 (receipt verify needs consistent network)
                           └─► P0-5 (synthetic tracing needs consistent network)
P2-5 (verification pkg) ─────► P0-4 (P0-4 consumes the real package)

P1-3 (header exec state) ──► P1-2 (shortcuts: Cmd+Enter run uses same path)
P1-6 (flow-store version) ─► P3-3 (share links rehydrate via the same migrate path)
P1-1, P1-4 independent.    P3-1, P3-2 independent.
```

---

## Recommended sequencing (themed milestones)

### Milestone 0 — Safety & Build (week 1) — *do before any public exposure*
- **P0-1** Secure the SDK proxy
- **P1-8** CI + build soundness

### Milestone 1 — Deliver the promise (weeks 2–3)
- **P0-2** Unify codegen → **P0-3** Real export bundle
- **P1-5** Network split-brain

### Milestone 2 — Honesty (week 4)
- **P2-5** Verification package fixes → **P0-4** Real receipt verification
- **P0-5** Honest synthetic tracing
- **P2-2** Amount-scaling audit

### Milestone 3 — Core UX (weeks 5–6)
- **P1-1** Empty state · **P1-2** Shortcuts · **P1-3** Header state · **P1-4** Validation
- **P1-6** Flow-store versioning · **P1-7** Timeouts/abort
- **P2-1** Codegen correctness · **P2-3** UX polish · **P2-4** Accessibility

### Milestone 4 — Delight (weeks 7–8)
- **P3-1** Tour · **P3-2** Thumbnails · **P3-3** Share links · **P3-4** Live preview
- **P1-9** Agent-pack (or formally descope)

---

## Effort rollup

| Priority | Count | Rough effort |
|----------|-------|--------------|
| P0 | 5 | ~3 weeks (1 dev) |
| P1 | 9 | ~3 weeks (1 dev) |
| P2 | 5 | ~1.5 weeks |
| P3 | 4 | ~1.5 weeks |
| **Total** | **23** | **~8–9 weeks for one dev; ~4–5 weeks for two** |

---

## Corrections discovered while authoring the specs

While grounding each spec in the live code, the authors found several places where the
audit's first pass was **inaccurate** — recorded here so planning uses real numbers:

- **P1-8 is bigger than first scoped (M → L).** The broken build is not 3 packages with a
  handful of errors. `apps/mcp-server` has **~156** `tsc` errors (not ~12), dominated by a
  non-generic `errorResponse()` in `permissions.ts:250`. **`packages/codegen` also fails**
  (~30 errors, incl. 5 `TS6307` "JSON manifest not in tsconfig include") — it was assumed
  to pass. `agent-pack` and `verification` fail as described. Only `packages/types` is clean.
- **P1-5 (network split-brain) is narrower than stated.** Submissions *and* `enrichNodeData`
  reads already route through the proxy; only `assertion-runner.ts` and the legacy
  `AccumulateAPI.callV2` methods hit the user-selected network's V2 endpoint directly. The
  real fix is "route assertions through the proxy + fix the `.env` precedence," not "all
  reads bypass the proxy."
- **P0-4:** `api.ts getReceipt` (the "real" proof path) is dead because *all* traffic is
  proxied (mixed-content fix, commit `c2088bc`); the fix must route proof queries through the
  proxy, not merely call the existing `getReceipt`.
- **P2-2 (amount scaling) is a latent risk, not a confirmed 1e8× bug.** `AddCredits` amounts
  are ACME base units and the `×1e8` is *coincidentally* correct; the genuine double-scale
  risk is credit ops where the engine `×1e8`s before the proxy `×100`s. The defect is
  "no single owner of unit semantics," so this is hardening, not an active money bug.
- **P1-9 package names:** the Python import `accumulate_client` agent-pack emits is actually
  **correct**; the real drift is JS (`accumulate-js` → should be `accumulate.js`) and Dart
  (`accumulate_client` → should be `opendlt_accumulate`). The doc recommends **Track B**
  (descope agent-pack to "representative templates," fix the names, update README).
- **P0-3 export:** a Node-only `generateBundleZip` (archiver/Buffer) already exists but is
  unusable in-browser; the spec uses **fflate** in the browser instead (`Buffer.from` crashes
  in-browser per project memory).

## How to use these docs

1. Pick a doc by ID. Each is independently implementable within its stated dependencies.
2. Work the **Implementation steps** top-to-bottom; they reference real `file:line` anchors.
3. Satisfy every checkbox in **Acceptance criteria** before opening a PR.
4. Run the **Tests** section's checklist; add the new tests it specifies.
5. Update this ROADMAP's status column (add a ✅ when merged).

> **Note on line numbers:** anchors were captured during the June 2026 audit. If the code has
> since shifted, search for the quoted snippet rather than trusting the absolute line.
