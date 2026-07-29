# accumulate-studio — repository guide for agents

Monorepo for Accumulate's agent-facing tooling: a visual flow builder (Studio), a multi-language code generator, an MCP server, a Python SDK proxy, and the AI-agent readiness program (verifier, harness, scorecard).

npm workspaces: `apps/*`, `packages/*`, `templates`.

## Setup

Toolchain: **Node >= 18** and **Python 3.11+** (the proxy is a separate Python service).

```bash
npm ci
npm run build:types      # packages/types must build before its dependents
npm run install:proxy    # pip install -e apps/sdk-proxy
```

Build order matters: `packages/types` is a dependency of `packages/codegen`, `packages/verification`, `apps/studio`, and `apps/mcp-server`. A clean checkout that skips `build:types` fails with confusing missing-module errors.

## Build

```bash
npm run build            # all workspaces
npm run build:studio     # Vite app
npm run build:mcp        # esbuild bundle (runs gen:mcp first)
npm run build:codegen
```

## Test & validate

| Command | Covers | Needs network |
|---|---|:--:|
| `npm test` | all workspace suites | no |
| `npm run typecheck` | all workspaces | no |
| `npm run lint` | all workspaces | no |
| `npm run harness:test` | agent-harness unit tests (61) | no |
| `npm run harness:selftest` | task-spec well-formedness | no |
| `npm run test:mcp` | MCP protocol over stdio (needs `build:mcp` first) | no |
| `npm run validate:manifests` | SDK manifests vs block catalog | no |
| `npm run validate:canonical` | every canonical task covered | no |
| `npm run verify:artifacts` | published artifacts on 5 registries | **yes** |
| `npm run verify:scorecard` | regenerate the KPI scorecard | no |
| `npm run harness:run` | 40 live agent runs | **yes** + costs money |

Everything above except the last three is safe for per-commit CI.

## Run

```bash
npm run dev              # Studio on :5173
npm run dev:proxy        # Python proxy on :8000
npm run dev:all          # both
npm run dev:mcp          # MCP server on stdio
```

Studio needs the proxy running for flow execution. Code generation and the UI work without it.

## Layout

```
apps/studio/          Vite + React flow builder
apps/mcp-server/      MCP server (tools + resources + prompts)
apps/sdk-proxy/       Python FastAPI proxy — separate toolchain
packages/types/       shared types + NETWORKS + BLOCK_CATALOG; build first
packages/codegen/     Handlebars manifest-driven generator (~1150 lines)
packages/verification/ Merkle receipt verification
packages/agent-pack/  agent introspection pack
scripts/              generators + validators
tools/artifact-verify/ verifies PUBLISHED registry artifacts
tools/agent-harness/  measures agent success (K2-K4)
docs/ai-agent-readiness/ program plan, scorecard, runbooks
schemas/              JSON schemas for generated artifacts
```

Subdirectory guides: [`packages/codegen`](packages/codegen/AGENTS.md), [`apps/mcp-server`](apps/mcp-server/AGENTS.md), [`apps/sdk-proxy`](apps/sdk-proxy/AGENTS.md).

## Gotchas

- **`packages/types` builds first.** See Build above.
- **Generated files are not editable.** `docs/ai-agent-readiness/generated/**`, `apps/mcp-server/src/generated/**`, and every SDK's `AGENTS.md`/`llms.txt`/`llms-full.txt` come from `scripts/generate-agent-artifacts.mjs` and `scripts/generate-mcp-content.mjs`. Edit the generator or the manifest, then regenerate. A hand edit is silently reverted on the next run and shows up as drift in K10.
- **`gen:agent:dist` writes into five *other* repositories** under `C:/Accumulate_Stuff`. It skips silently when a path is missing — check the output for `dist SKIP` lines.
- **`Buffer.from()` crashes in the browser.** In Studio code use `TextEncoder` plus manual hex encoding.
- **Amount scaling has a fixed home.** ACME ×1e8 happens in the engine; credits ×100 happens once in the proxy; the oracle price is never scaled. Do not add a second multiplication.
- **The sdk-proxy is Python.** `npm test` does not cover it.

## Permitted commands

Safe unattended: build, test, lint, typecheck, the validators, `verify:artifacts`, and the generators.

Require a human first:

- `npm publish` / any registry write, in this repo or the five SDK repos
- `gen:agent:dist` — it writes into other repositories
- `harness:run` — spends real money and testnet faucet capacity
- anything targeting **mainnet**
- rewriting git history or force-pushing

## Before you commit

```bash
npm run typecheck && npm test && npm run validate:manifests && npm run harness:test
```

If you touched a generator, also run `npm run gen:agent && npm run gen:mcp` and commit the regenerated output.
