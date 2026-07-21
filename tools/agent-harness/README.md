# agent-harness (Phase 0 · P0-XR-01…06)

The **Agent Usability Harness** measures how well a fresh AI coding agent can build on Accumulate from each published SDK. It is the instrument behind KPIs **K2** (first-try task pass rate), **K3** (turns-to-first-tx), and **K4** (human interventions), and it aggregates the deterministic `artifact-verify` results into the program **scorecard**.

## Components

| File | Role | Runnable now? |
|---|---|---|
| `tasks/*.yaml` | The 8 canonical task specs (declarative) | ✅ (specs) |
| `runner.mjs` | Drives an agent backend through a task, executes its code, scores it | ⚠️ scaffold — needs an agent backend + API key + testnet |
| `scorecard.mjs` | Aggregates `artifact-verify` + harness results → `SCORECARD.md` + `scorecard.json` | ✅ (artifact-verify portion) |

## The 8 canonical tasks

Mirrors the golden-path templates so hand-written and Studio-generated code are scored on the same rubric:

1. `01-lite-account` · 2. `02-create-adi` · 3. `03-add-credits` · 4. `04-send-tokens` · 5. `05-write-data` · 6. `06-custom-token` · 7. `07-multisig-setup` · 8. `08-key-rotation`

## Modes

The same task can be scored three ways (compared in the scorecard):

- **sdk** — agent hand-writes code against the installed SDK (baseline).
- **mcp** — agent drives the published Accumulate MCP (Phase 2+).
- **codegen** — agent calls the `accumulate-gen` CLI (Phase 4+).

## Run

```bash
node tools/agent-harness/runner.mjs --list                 # list tasks (works now)
node tools/agent-harness/runner.mjs --lang python --task 04-send-tokens --backend claude   # needs API key
node tools/agent-harness/scorecard.mjs                      # emit baseline scorecard (artifact-verify portion)
# or:
npm run harness:list
npm run verify:scorecard
```

## Wiring the agent runner (deferred — needs secrets)

`runner.mjs` defines a pluggable `AgentBackend` interface. To activate:

1. Provide an API key via env (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) as a CI secret.
2. Provide a funded-testnet faucet endpoint (Kermit by default) and let the harness provision ephemeral keys.
3. Each `(task, lang)` runs in a clean container that installs **only the published package** — no repo checkout — so the agent gets exactly what a real integrator gets.

Until a backend + secrets are configured, `runner.mjs` runs task specs in `--list`/`--dry-run` mode and records `PENDING_RUNNER` for K2–K4 in the scorecard. This is intentional: the deterministic `artifact-verify` KPIs (K1, K5, K8, K10) are available immediately; the agent-driven KPIs light up once the runner is wired in CI.

## Safety

Testnet only. Ephemeral, harness-generated keys. Never mainnet, never persisted keys. The `mcp` mode uses the READ_ONLY/BUILD_ONLY/SIGN_AND_SUBMIT permission tiers with testnet defaults.
