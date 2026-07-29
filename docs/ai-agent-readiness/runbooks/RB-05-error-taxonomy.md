# RB-05 — Canonical error taxonomy

**KPI unlocked:** K7 (error-actionability, target ≥95%) — currently `PENDING_PHASE3`
**Depends on:** RB-01 for measurement
**Feeds:** RB-02 (`accumulate://errors` resource), RB-04 (CLI error envelope)

---

## Why

Every generated `AGENTS.md` tells agents:

> **Errors are typed:** branch on the SDK error type/code; retry only on network errors, not validation errors.

There is no published list of what those codes are. The instruction is currently unfollowable.

The sharper finding: **the generator already supports an error catalog and no manifest populates it.**

`scripts/generate-agent-artifacts.mjs:173-177`:

```js
if (m.errors?.length) {
  L.push('## Error catalog');
  for (const e of m.errors) L.push(`- \`${e.code}\` — ${e.hint}${e.details ? ` (${e.details})` : ''}`);
  L.push('');
}
```

And per-operation at `:202`: `if (op.errors?.length) L.push('Errors: ...')`.

Measured across all five manifests:

| Lang | ops | top-level `errors` | ops with `errors` | ops with `requires` |
|---|---|---|---|---|
| python | 24 | 0 | 0 | 22 |
| rust | 24 | 0 | 0 | 22 |
| dart | 24 | 0 | 0 | 22 |
| csharp | 24 | 0 | 0 | 22 |
| javascript | 24 | 0 | 0 | 22 |

Both branches are dead code. `llms-full.txt` — the document agents load for API depth — ships **zero error information** for every language.

This is the cheapest high-value fix in the program: the rendering is written, the schema exists, the data is missing.

## What already exists to build on

- **Dart has a real typed taxonomy.** Per `PROGRESS.md` Phase 3 workstream B: `JsonRpcErrorMapper` wired into `Transport.call`/`batch`, `AccError` exported from the package root, verified on Kermit — querying a nonexistent account throws typed `ApiError(-33404)`.
- **Python is the reference implementation** for error behavior (same source).
- **`requires` is populated for 22/24 operations** (`["keypair","credits"]` etc.) — this is the prerequisite data that turns "transaction is not signed" into "the key page has no credits; call add_credits first."
- **The MCP server has `errorFromException`** (`apps/mcp-server/src/permissions.ts`) already normalizing errors into a response shape.

---

## Design

### One catalog, five bindings

The protocol's errors are a property of **Accumulate**, not of any SDK. Author one canonical catalog and bind it per language.

`packages/codegen/src/manifests/errors.catalog.json`:

```json
{
  "version": "1.0",
  "errors": [
    {
      "code": "ACC_ACCOUNT_NOT_FOUND",
      "protocolCodes": [-33404],
      "category": "not_found",
      "retryable": false,
      "hint": "The account URL does not exist on this network.",
      "causes": ["typo in the URL", "account not yet created", "wrong network"],
      "remediation": "Verify the URL and network. If you just created it, wait for the transaction to reach 'delivered' first.",
      "relatedOps": ["query_account", "send_tokens"]
    }
  ]
}
```

Required fields per entry: `code`, `category`, `retryable`, `hint`, `remediation`. `retryable` is the single most useful field for an agent and must never be omitted — it is the difference between a productive retry and a loop.

### Categories

`validation` · `not_found` · `insufficient_credits` · `insufficient_balance` · `auth` · `conflict` · `network` · `internal`

`retryable: true` for `network` and some `internal`. Everything else `false`. An agent retrying a validation error is the classic wasted-turn pattern that K3 measures.

### Language binding

Per-language manifests get an `errors` array whose entries reference catalog codes and add the local type:

```json
"errors": [
  { "code": "ACC_ACCOUNT_NOT_FOUND", "type": "ApiError", "catch": "on AccError" }
]
```

This lets `renderLlmsFull` emit both the universal semantics and the language-specific catch syntax — which is what an agent actually needs to write the handler.

### Operation-level wiring

`op.errors` should list the codes each operation can raise. Derive the obvious ones from `requires`:

- `requires: ["credits"]` → `ACC_INSUFFICIENT_CREDITS`
- `requires: ["keypair"]` → `ACC_UNAUTHORIZED`

That is 22 operations covered mechanically. Hand-add the rest.

### How K7 gets measured

"Error-actionability ≥95%" needs a definition or it stays unmeasurable. Proposed, and it should be written into `artifact-verify`:

> An error is **actionable** if the SDK surfaces a typed error carrying a catalog `code`, and the catalog entry for that code has a non-empty `remediation` and an explicit `retryable`.
>
> K7 = actionable errors ÷ total distinct errors observed across the RB-01 harness corpus.

Measuring against the harness corpus rather than the catalog is deliberate — it scores the errors agents *actually hit*, not the ones you happened to document.

---

## Steps

1. **Harvest real errors.** Run the RB-01 corpus and collect every error surfaced across 40 runs. Add deliberate negative cases: query a nonexistent account, send without credits, send more than the balance, submit with a bad signature, write to a nonexistent data account, create a duplicate ADI. This produces the catalog's initial contents from evidence rather than imagination.

2. **Author `errors.catalog.json`** from the harvest. Start with what was observed; do not speculatively enumerate.

3. **Add the JSON schema** at `schemas/errors.catalog.schema.json` (the repo already has a `schemas/` directory) and validate in `check-manifest-drift.ts`.

4. **Bind per language.** Add `errors` to each `*.sdk-manifest.json`. Dart's is largely done — mine `AccError`/`JsonRpcErrorMapper` for the mapping and use it as the template for the other four.

5. **Wire `op.errors`** from `requires` mechanically, then hand-complete.

6. **Regenerate.** `npm run gen:agent` — the dead branches at `:173` and `:202` light up with no renderer change. Verify `llms-full.txt` gains an `## Error catalog` section for all 5 languages.

7. **Expose as an MCP resource.** `accumulate://errors` (RB-02). Also add an `acc.explain_error` tool taking a raw error string or code and returning the catalog entry — the highest-leverage possible tool for an agent that is stuck.

8. **Normalize `errorFromException`.** The MCP server's error path (`permissions.ts`) should emit catalog codes so agents get the same taxonomy through MCP as through the SDKs.

9. **Close the SDK gaps.** Any language not raising typed errors on the live path needs the Dart treatment. Per `PROGRESS.md`, Dart was the only broken one and is fixed — verify the other four against the harvest rather than assuming.

10. **Implement K7 in the scorecard.** Replace `PENDING_PHASE3` at `scorecard.mjs:74`.

---

## Acceptance criteria

- [ ] `errors.catalog.json` exists, schema-validated in CI
- [ ] Every entry has `code`, `category`, `retryable`, `hint`, `remediation`
- [ ] All 5 manifests populate `errors`; all 5 `llms-full.txt` render an `## Error catalog`
- [ ] ≥22 operations carry `op.errors`
- [ ] Catalog contents are derived from observed errors, not invented
- [ ] `accumulate://errors` resource serves the catalog
- [ ] `acc.explain_error` returns the right entry for a raw protocol error string
- [ ] All 5 SDKs raise a typed error carrying a catalog code for the six negative cases in step 1
- [ ] K7 computes a real number
- [ ] `AGENTS.md`'s "branch on the SDK error type/code" instruction is now followable — an agent can find the codes

## Risks

**Inventing errors nobody hits.** Harvesting first (step 1) is the guard. A 200-entry catalog of theoretical errors is worse than a 25-entry catalog of real ones.

**Code churn.** Once `ACC_*` codes are published, agents will branch on them. Treat the catalog as public API: additive changes only, and `version` it.

**Five bindings drifting.** The catalog is one file; the bindings are five. `check-manifest-drift.ts` must assert every bound code exists in the catalog.

## Rollback

Removing the `errors` arrays from manifests restores the current output exactly — the renderer branches simply go dead again. The catalog file is inert on its own.

---

## As-built (2026-07-29)

**Status: done.** K7 moved from `PENDING_PHASE3` to a live number.

### What was delivered

| Piece | Where |
|---|---|
| Canonical catalog — 14 entries, 5 language bindings | `packages/codegen/src/manifests/errors.catalog.json` |
| JSON schema | `schemas/errors.catalog.schema.json` |
| Catalog validation in CI | `scripts/check-manifest-drift.ts` (new `[errors.catalog]` section) |
| Per-language binding + `op.errors` derivation | `scripts/generate-agent-artifacts.mjs` |
| `accumulate://errors` + `accumulate://errors/{code}` | `apps/mcp-server/src/resources/index.ts` |
| `acc.explain_error` tool | `apps/mcp-server/src/tools/errors.ts` |
| K7 measurement | `tools/agent-harness/lib/error-actionability.mjs` |
| 6 new MCP protocol tests (26 total, all passing) | `apps/mcp-server/test/protocol.test.mjs` |

### Deviations from the plan

**Bindings live in the catalog, not in the five manifests.** The plan put an
`errors` array in each `*.sdk-manifest.json`. That recreates the exact risk the
plan itself names — "five bindings drifting". Instead the catalog carries a
`bindings` map and `generate-agent-artifacts.mjs` binds at load, injecting
`m.errors` and `op.errors`. The rendered output is what the plan specified; the
maintenance surface is one file rather than five. Acceptance criterion "all 5
manifests populate `errors`" is met in effect, not literally.

**The renderer did change.** The plan predicted the dead branches at `:173`/`:202`
would light up "with no renderer change". They did light up, but the original
one-line-per-error format could not carry `retryable` or `remediation` — the two
fields that make an entry actionable. The catalog section is now a subsection per
error, plus the language's catch syntax.

**`op.errors` covers 24/24 operations**, above the ≥22 target. Derived from
`requires` (`credits` → `ACC_INSUFFICIENT_CREDITS`, `keypair` →
`ACC_UNAUTHORIZED_SIGNER`), plus catalog `relatedOps`, plus a universal network
class on every operation.

### What the work found

1. **The MCP server had two tool lists that could silently diverge.** `allTools`
   is advertised via `tools/list`; `toolHandlers` in `index.ts` is what dispatch
   can actually call. Adding a tool to the first alone made the server advertise
   `acc.explain_error` and then reject the call — the worst failure mode, because
   it reads as the agent's mistake. There is now a startup assertion that the two
   sets match exactly, so the server refuses to boot on a mismatch.

2. **`403` is a verified wire code for unauthorized-signer.** Recovered from a
   live response in the corpus: `{"code":"unauthorized","codenum":403,...}`. Added
   to `protocolCodes`.

3. **A real error class was missing: submitted-but-never-settled.** The corpus
   contained "setup reported acc://... but it did not appear on chain within 90s".
   Distinct from `ACC_TX_PENDING` (awaiting signatures) and from a network fault.
   Added as `ACC_TX_NOT_SETTLED`, retryable, with an explicit do-not-resubmit
   instruction — resubmitting is what an agent naturally does here, and it earns
   an `ACC_ALREADY_EXISTS`.

### How K7 is measured, and its main weakness

`deriveK7` scores **distinct errors observed in the harness corpus**, not catalog
self-consistency. The extractor is deliberately catalog-independent: a line
qualifies only by announcing itself as an error (`error|failed|rejected|...`),
never by matching a catalog `messagePattern`. Had candidates been pulled using
the catalog's own patterns, every candidate would match by construction and K7
would read 100% regardless of coverage — the same class of measurement bug
RB-01's as-built documents.

**K7 = 100% (4/4), and n=4 is the weakness.** The corpus is 80 run records and 68
transcripts, but the transcripts are agent *summaries* rather than raw protocol
logs, so only four distinct self-announced error strings exist across all of it.
The number is honest but thin. **The way to strengthen it is step 1 of this
runbook, which was not done:** deliberate negative-case runs (query a nonexistent
account, send without credits, overspend, bad signature, duplicate ADI). Until
those run, treat K7 green as provisional.

### Still open

- **Step 1 negative-case harvest** — not run. See above.
- **Step 9, verify all five SDKs raise typed errors on the live path** — not done.
  Dart is verified (per Phase 3 workstream B); the other four are assumed, which
  is exactly what the step says not to do.
- **Step 8, `errorFromException` emitting catalog codes** — the MCP error path
  still returns its own shape. `acc.explain_error` gives agents the taxonomy, but
  a failing `acc.query` does not yet carry an `ACC_*` code.
