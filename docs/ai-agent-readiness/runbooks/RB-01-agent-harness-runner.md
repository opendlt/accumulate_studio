# RB-01 — Land the agent-harness runner and establish the K2–K4 baseline

**KPIs unlocked:** K2 (first-try pass rate), K3 (turns-to-first-tx), K4 (human interventions)
**Blocks:** RB-02, RB-03, RB-04, RB-05 (all need a before/after measurement)
**External gate:** agent API key + funded Kermit testnet account

---

## Why this is first

Every KPI that is currently green measures **packaging** — names match (K1), files ship (K5), versions align (K8), no drift (K10). Every KPI that measures whether an agent can actually *succeed* is `PENDING_RUNNER` or `PENDING_PHASE3`.

That means today there is no way to answer "did MCP Resources help?" or "did the manifest split help?" with anything but judgment. Ship the runner first and every subsequent runbook gets a before/after number.

## Verified current state

| Fact | Evidence |
|---|---|
| 8 task specs exist and are well-formed | `tools/agent-harness/tasks/01..08-*.yaml`; `runner.mjs --self-test` validates 4 required fields |
| `--list` and `--dry-run` work with no secrets | `runner.mjs:96-117` |
| `backends` registry is an empty object | `runner.mjs:52-54` |
| Execution path throws deliberately | `runner.mjs:122` — `'runner execution path is scaffolded but not yet enabled'` |
| Scorecard hardcodes the pending values | `scorecard.mjs:68-70` — K2/K3/K4 are string literals, not derived |
| Task specs already declare scoring fields | `scoring: { first_try: bool, turns_to_success: int, human_interventions: int }` |

The scaffold is honest — it fails loudly rather than faking a pass. Keep that property.

---

## Design

### The measurement contract

A **run** is one (lang × task × mode) triple. A backend receives a prompt plus a provisioned environment and returns:

```js
{
  passed: boolean,        // did success_assertions all hold?
  turns: number,          // assistant turns until first successful on-chain tx
  interventions: number,  // times the harness had to inject a correction
  transcript: string,     // full agent transcript, archived
  failureClass: string|null  // see taxonomy below
}
```

`mode` matters and is already modeled (`runner.mjs:28`): `sdk` (agent writes code against the installed package), `mcp` (agent uses the MCP server), `codegen` (agent drives Studio's generator). These measure three different front doors. **Run `sdk` first** — it is the baseline everything else is compared against.

### Failure classification

Do not report a bare pass rate. Classify every failure, because the class is what tells you which runbook to prioritize:

| Class | Meaning | Runbook that fixes it |
|---|---|---|
| `amount-scaling` | passed whole ACME instead of base units | RB-03 (rules placement), RB-05 |
| `missing-prereq` | signed before credits / before ADI existed | RB-02 (prereq resource), RB-05 |
| `wrong-symbol` | called a legacy/alternate client | RB-03 (canonical-path emphasis) |
| `error-opaque` | agent got an error it could not act on | RB-05 |
| `install-fail` | could not install or import the package | RB-06 |
| `network-flake` | testnet unavailable — **excluded from K2** | none |
| `other` | uncategorized; review transcript | — |

`network-flake` must be excluded from the denominator or K2 will measure testnet uptime rather than SDK quality.

### Provisioning

Each run needs an isolated, funded lite account. Do **not** share one account across runs — concurrent runs will race on credit balance and produce phantom `missing-prereq` failures.

Per run: generate a keypair → faucet → wait for balance → hand the agent the lite URL as an input. Task specs already declare this (`04-send-tokens.yaml:5-6`: *"funded lite token account (harness provisions via faucet)"*).

---

## Steps

### 1. Add a run-record schema and results directory

Create `tools/agent-harness/results/` (gitignored except `.gitkeep`) and write one JSON per run:

```
results/<ISO-date>/<mode>/<lang>--<task-id>.json
```

Include: run metadata, the contract fields above, SDK version under test, and a content hash of the task spec so a spec edit invalidates comparison.

### 2. Implement the provisioner

`tools/agent-harness/provision.mjs` — exports `provisionLiteAccount({ network })`. Reuse the MCP server's network registry (`apps/mcp-server/src/tools/network.ts`) rather than re-encoding endpoints. Must be idempotent-safe and must fail fast with a clear message if the faucet is down (→ `network-flake`, not a task failure).

### 3. Wire the first backend

Implement `makeClaudeBackend()` in `runner.mjs:52`. It needs to:

- Start the agent with **only** the installed package available — not the SDK source tree. This is the whole point: measure what a real integrator gets. Install into a scratch dir from the registry.
- Cap turns (suggest 15) and record `turns` at the first turn where a tx reaches `delivered`.
- Count an intervention every time the harness injects a correction; the default policy should be **zero interventions** (pure first-try) for the K2 number, with an optional `--assist` mode for diagnostics.
- Return the transcript for archival.

Keep `getBackend()`'s existing behavior: an unwired backend throws with configuration guidance (`runner.mjs:56-66`). Do not soften that.

### 4. Implement the assertion evaluator

`success_assertions` are currently prose (`tx_status == delivered`, `recipient_balance_increased_by == 5 ACME`). Give them a tiny evaluator with a fixed vocabulary — `tx_status`, `balance_increased_by`, `account_exists`, `credits_at_least` — resolved by querying the chain after the agent finishes. Assertions must be evaluated **by the harness against chain state**, never by trusting the agent's own claim of success.

### 5. Derive K2–K4 in the scorecard

Replace the hardcoded literals at `scorecard.mjs:68-70`:

```js
const runs = loadRuns();                    // newest results/<date>/sdk/
const scored = runs.filter(r => r.failureClass !== 'network-flake');
const k2 = scored.length ? `${pct(scored.filter(r=>r.passed).length/scored.length)}` : 'PENDING_RUNNER';
```

Preserve `PENDING_RUNNER` when no results exist — the distinction between "not measured" and "measured and failing" is the scaffold's best property and must survive.

Add a **failure-class breakdown table** to `SCORECARD.md` beneath the KPI table. That table is the prioritization input for RB-02 through RB-06.

### 6. Add npm scripts

```json
"harness:run":      "node tools/agent-harness/runner.mjs --lang all --tasks all --mode sdk --backend claude",
"harness:selftest": "node tools/agent-harness/runner.mjs --self-test"
```

Wire `harness:selftest` into CI now (it needs no secrets). `harness:run` stays manual/scheduled — it costs money and testnet throughput.

---

## Acceptance criteria

- [ ] `npm run harness:selftest` passes in CI with no secrets
- [ ] `npm run harness:run` completes 40 runs (8 tasks × 5 langs, `sdk` mode) and writes 40 JSON records
- [ ] `npm run verify:scorecard` shows real numbers for K2/K3/K4, and `PENDING_RUNNER` if results are absent
- [ ] `SCORECARD.md` gains a failure-class breakdown
- [ ] Every failure has a non-null `failureClass`
- [ ] Re-running with no code changes produces a comparable number (variance noted in the runbook log)

## Risks

**Cost.** 40 runs × 5 langs × 3 modes is 120 agent sessions. Start with `sdk` mode only, all 8 tasks, all 5 langs = 40 runs. Add modes after the baseline is stable.

**Testnet throughput.** Faucet rate limits will bite. Serialize provisioning even if runs are parallel, and back off on faucet 429s.

**Measuring the wrong thing.** If the agent can see the SDK source tree, you are measuring "can an agent read this repo," not "can an agent use this package." The scratch-install requirement in step 3 is load-bearing.

## Rollback

Purely additive. If the backend misbehaves, delete the entry from `backends` and the runner returns to its current dry-run behavior; the scorecard falls back to `PENDING_RUNNER` automatically once `results/` is empty.

---

## As-built (2026-07-27)

Implemented and validated live against Kermit. See [`tools/agent-harness/README.md`](../../../tools/agent-harness/README.md) for operating instructions.

### Deviations from the plan above

**Provisioning is tiered, not uniform.** The plan said "per run: generate a keypair → faucet → wait for balance". That is wrong for task 01, which declares `preconditions: []` — funding the account *is* the task. Pre-funding it made `lite_token_account_balance > 0` pass while the agent had not executed at all. `provisioningPlan()` now derives the tier (`keys-only` / `funded` / `adi`) from each spec's declared preconditions.

**ADI-tier setup goes through the Python reference SDK.** Tasks 03 and 05–08 declare "existing ADI with a credited key page" as a precondition. Creating one requires signing, which requires correct transaction-body marshaling — reimplementing that in the harness would mean writing a sixth SDK, and both the Rust and C# SDKs have shipped marshaling bugs. `setup/adi-setup.py` uses the Python `QuickStart` path instead, and a new `harness-setup-failed` class (excluded from K2, like `network-flake`) ensures a setup problem can never be scored as an SDK defect. `verifyAdiSetup()` independently confirms the ADI and its credit balance on chain before the agent starts.

**Prompts are delivered over stdin, not argv.** Passing a multi-line prompt as a shell argument truncated it on Windows — the agent received only the word "Using", replied asking what the user wanted, and the run still scored **PASS** because the pre-funded balance satisfied the assertion. Two independent bugs producing one false pass.

**A turn cap flag does not exist** in Claude Code 2.1.220, so the cap is enforced by wall-clock timeout and `num_turns` is read back from the result envelope.

### Bugs this caught in its first three runs

1. **False pass from over-provisioning** (harness) — fixed by tiered provisioning.
2. **Prompt truncation on Windows** (harness) — fixed by stdin delivery.
3. **Wrong account under assertion** (harness) — task 01 asks the agent to generate *its own* key, so the balance check has to read the account the agent reports, not the harness's. Fixed; the agent had correctly funded its own account to 10 ACME while the harness read 0 from a different one.
4. **`QuickStart` prints progress to stdout** (Python SDK) — this corrupts any machine-readable caller. The setup script now redirects it to stderr, but it is a real defect: it violates the same "stdout is protocol" invariant RB-04 specifies for the CLI.
5. **Error code `-33404` confirmed live** for account-not-found — the first verified entry for RB-05's catalog, matching the code `PROGRESS.md` cites for Dart's `ApiError`.

### Verified working

- Lite-account derivation (sha256 → 20-byte prefix → checksum over the **ASCII** of the hex, not the raw bytes) — the network accepted the derived URL and funded it.
- Faucet → settlement in ~12s on Kermit.
- All three provisioning tiers, end to end with a live agent.
- K2/K3/K4 deriving real values, and reverting to `PENDING_RUNNER` when `results/` is empty.
