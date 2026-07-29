# agent-harness (Phase 0 · P0-XR-01…06)

Measures whether a fresh AI coding agent can actually build on Accumulate from each **published** SDK. It is the instrument behind KPIs **K2** (first-try pass rate), **K3** (turns-to-first-tx), and **K4** (human interventions), and it folds the deterministic `artifact-verify` results into the program **scorecard**.

Implements [RB-01](../../docs/ai-agent-readiness/runbooks/RB-01-agent-harness-runner.md).

## Quick start

```bash
npm run harness:selftest    # no secrets, no network — CI-safe
npm run harness:list        # the 8 canonical tasks
npm run harness:preflight   # toolchains + agent backend present?
npm run harness:run         # 8 tasks x 5 langs, sdk mode  (costs money + testnet)
npm run verify:scorecard    # fold results into the scorecard
```

Narrower runs:

```bash
node tools/agent-harness/runner.mjs --lang python --task 04 --backend claude-code
node tools/agent-harness/runner.mjs --lang rust,dart --tasks all --backend claude-code
node tools/agent-harness/runner.mjs --lang all --dry-run
```

Useful flags: `--model <alias>`, `--timeout-ms <n>`, `--keep-workspace`, `--mode sdk`.

## The 8 canonical tasks

Mirrors the golden-path templates so hand-written and Studio-generated code are scored on the same rubric:

1. `01-lite-account` · 2. `02-create-adi` · 3. `03-add-credits` · 4. `04-send-tokens` · 5. `05-write-data` · 6. `06-custom-token` · 7. `07-multisig-setup` · 8. `08-key-rotation`

## Modes

- **sdk** — agent hand-writes code against the installed SDK. **Implemented**; this is the baseline every other mode is compared against.
- **mcp** — agent drives the published Accumulate MCP (lands with RB-02).
- **codegen** — agent drives Studio's generator (lands with RB-07).
- **cli** — agent drives the SDK CLI (lands with RB-04).

## The four invariants

These are what make the numbers mean anything. Do not weaken them.

**1. The agent only ever sees a published package.**
Every run builds a scratch workspace in the OS temp dir and installs the SDK *from its registry* (`lib/workspace.mjs`) using the documented quickstart command. The agent never sees this monorepo or an SDK source tree. Otherwise you measure "can an agent read this repo", not "can an agent use this package".

**2. Pass/fail comes from chain state, never from the agent.**
The agent writes `harness-artifacts.json` containing **identifiers only** — URLs, txids, key hashes. The harness then queries those identifiers over plain JSON-RPC (`lib/accumulate.mjs`, no SDK dependency) and evaluates the spec's `success_assertions` itself (`lib/assertions.mjs`). Any self-assessment keys the agent adds anyway are stripped before scoring.

**3. Non-SDK failures are excluded from K2.**
`network-flake` (testnet down, faucet rate-limited) and `harness-setup-failed` (prerequisite provisioning broke) never count against an SDK. Otherwise K2 measures testnet uptime.

**4. "Not measured" stays distinct from "measured and failing".**
With no records on disk, K2/K3/K4 report `PENDING_RUNNER`. A fabricated `0%` would read as a catastrophic regression rather than an unrun harness.

## Provisioning tiers

Derived from each spec's declared `preconditions` (`provisioningPlan()` in `provision.mjs`). Over-provisioning is a correctness bug, not a convenience:

| Tier | Tasks | What the harness sets up |
|---|---|---|
| `keys-only` | 01 | An Ed25519 keypair. **No faucet** — funding is what the task asks the agent to do. |
| `funded` | 02, 04 | Keypair + faucet + settled balance ≥ 5 ACME. |
| `adi` | 03, 05, 06, 07, 08 | The above, plus an ADI with a credited key page. |

> Pre-funding task 01 made `lite_token_account_balance > 0` pass without the agent running at all. That false pass was caught on the first live run and is why the tier is derived from the spec rather than applied uniformly.

### Why ADI setup goes through the Python SDK

Creating an ADI requires signing, which requires correct binary marshaling of transaction bodies. Reimplementing that inside the harness would mean writing a sixth SDK — and both the Rust and C# SDKs shipped marshaling bugs, so a hand-rolled harness signer would be the least trustworthy component in the system.

So `setup/adi-setup.py` provisions through the Python reference SDK's canonical `QuickStart` path. Invariant 2 still holds: the SDK under test never verifies its own work, and setup failures are classified `harness-setup-failed` and excluded from K2. `verifyAdiSetup()` independently confirms on chain that the ADI exists and that its key page holds credits before the agent starts.

## Failure classes

The class is the prioritization signal — it names the runbook that fixes it.

| Class | Meaning | Counts toward K2 | Addressed by |
|---|---|:--:|---|
| `amount-scaling` | whole ACME passed instead of base units | yes | RB-03, RB-05 |
| `missing-prereq` | signed before credits / before the ADI existed | yes | RB-02, RB-05 |
| `wrong-symbol` | called a legacy or nonexistent API | yes | RB-03 |
| `error-opaque` | error gave the agent nothing to act on | yes | RB-05 |
| `install-fail` | could not install or import the package | yes | RB-06 |
| `no-artifacts` | agent never reported identifiers | yes | RB-03 |
| `timeout` | exceeded the wall-clock cap | yes | — |
| `network-flake` | testnet unreachable | **no** | — |
| `harness-setup-failed` | prerequisite provisioning broke | **no** | — |

## Layout

```
runner.mjs                orchestration; --self-test / --list / --dry-run need no secrets
provision.mjs             tiered environment provisioning
scorecard.mjs             folds records into SCORECARD.md + scorecard.json
lib/accumulate.mjs        dependency-free JSON-RPC client (the verification path)
lib/lite.mjs              Ed25519 keygen + lite URL derivation
lib/spec.mjs              task-spec parser (throws rather than dropping fields)
lib/assertions.mjs        assertion grammar + chain-state resolvers
lib/classify.mjs          failure taxonomy
lib/record.mjs            run-record persistence
lib/setup.mjs             ADI-tier provisioning + on-chain verification
lib/workspace.mjs         scratch project with the SDK installed from the registry
backends/claude-code.mjs  Claude Code driver
setup/adi-setup.py        ADI provisioning via the Python reference SDK
tasks/*.yaml              the 8 canonical task specs
results/<date>/<mode>/    run records (committed); transcripts/ is gitignored
```

Run records validate against [`schemas/harness-run.schema.json`](../../schemas/harness-run.schema.json).

## Adding a backend

Implement `run(ctx) -> { turns, interventions, transcript, stderr, timedOut, artifacts }` and register it in the `backends` map in `runner.mjs`. A backend **never** decides pass/fail — it runs the agent and reports what happened.

Optional: `checkAvailable()` for preflight, `dumpPrompt()` for inspection.

Prompts are delivered over **stdin**, never argv — a multi-line prompt passed as a shell argument gets truncated on Windows (observed: the agent received only the first word, and the run still scored a false PASS).

## Assertion grammar

```
<subject> <op> <value>
op    ::= == | != | >= | <= | > | <
value ::= true | false | <number> | <number> ACME | <input-name> | <bare word>
```

`<number> ACME` is scaled by 1e8 before comparison, so the assertion language itself refuses to let the amount-scaling footgun into scoring. Subjects are resolved by `SUBJECTS` in `lib/assertions.mjs`; `--self-test` fails if any spec uses a subject with no resolver — a silently unresolvable assertion would make runs pass vacuously.

## Cost and throughput

Each run is a full agent session plus a real testnet workspace. The full matrix is 40 runs; budget accordingly and expect faucet rate-limiting under parallelism (runs are sequential for that reason). `harness:selftest` is the only target safe for per-commit CI.

## Safety

Testnet only, never mainnet. Ephemeral harness-generated keys. Private keys are redacted from archived transcripts, and run records persist public identifiers only. The `mcp` mode will use the READ_ONLY/BUILD_ONLY/SIGN_AND_SUBMIT permission tiers with testnet defaults.
