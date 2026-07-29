# Accumulate MCP — install & use (Phase 2 · P2-ST-09)

The Accumulate MCP server (`accumulate-studio-mcp`) gives an AI agent all three MCP primitives for Accumulate — 14 typed **tools**, readable context **resources**, and 8 golden-path **prompts** — with a safe-by-default permission model. This page is the install reference.

## What an agent gets

### Tools (model-invoked actions)

- **Query:** `acc.query`, `acc.get_chain`, `acc.get_balance`
- **Build:** `tx.build`, `tx.estimate_credits`, `tx.validate_prereqs`
- **Sign/submit:** `tx.submit`, `tx.wait` (only in `SIGN_AND_SUBMIT`)
- **Network:** `net.list`, `net.select`, `net.status`
- **Verify:** `proof.get_receipt`, `proof.verify_receipt`, `trace.synthetics`

### Resources (readable context — available in every permission mode)

| URI | What it carries |
|---|---|
| `accumulate://concepts/amount-scaling` | The 1 ACME = 1e8 rule and the per-SDK `Amount` helpers |
| `accumulate://concepts/credits` | The prerequisite chain: fund → credits → ADI → page credits → sign |
| `accumulate://concepts/adi-vs-lite` | Lite accounts vs ADIs, and lite URL derivation |
| `accumulate://concepts/key-hierarchy` | Key books, pages, thresholds, and the all-authorities rule |
| `accumulate://concepts/networks` | Networks and the testnet-by-default posture |
| `accumulate://networks` | Live registry with endpoints and the current selection |
| `accumulate://sdk/{language}/operations` | Machine-readable catalog: 24 operations per language with symbols, signatures, inputs, outputs, and `requires` |
| `accumulate://templates[/{id}]` | The golden-path workflows |

Without these an agent could call `acc.query` but had no way to learn that amounts are in base units or that a key page needs credits before it can sign — it had to already know Accumulate to use the tools.

### Prompts (invocable workflows)

All 8 golden paths: `lite-account-setup`, `create-adi`, `zero-to-hero`, `token-transfer`, `data-writing`, `custom-token`, `multi-sig-setup`, `key-rotation`.

Each returns ordered steps, prerequisites, and the rules that prevent the two most common failures. A workflow ending in a submit **discloses** when the server's permission mode will refuse it, rather than leading the agent into a dead end.

Resources and prompts are generated from `packages/codegen/src/manifests/` and `apps/studio/src/data/flow-templates.ts` (`npm run gen:mcp`) — the same source of truth behind `llms.txt`, so the two front doors cannot drift.

## Permission tiers

`READ_ONLY` < `BUILD_ONLY` (default) < `SIGN_AND_SUBMIT`. Set via `ACCUMULATE_MCP_PERMISSION` env or `--permission-mode`. Signing is never on by default.

## Install

### Published (after the comprehensive publish)

Claude Code / any MCP host — add to the MCP config:

```json
{
  "mcpServers": {
    "accumulate": {
      "command": "npx",
      "args": ["-y", "accumulate-studio-mcp"],
      "env": {
        "ACCUMULATE_NETWORK": "testnet",
        "ACCUMULATE_MCP_PERMISSION": "BUILD_ONLY"
      }
    }
  }
}
```

### From source (available now, before publish)

```bash
git clone https://github.com/opendlt/accumulate_studio.git
cd accumulate_studio && npm install
npm run build --workspace=apps/mcp-server
```

```json
{
  "mcpServers": {
    "accumulate": {
      "command": "node",
      "args": ["/abs/path/accumulate_studio/apps/mcp-server/dist/index.js"],
      "env": { "ACCUMULATE_NETWORK": "testnet", "ACCUMULATE_MCP_PERMISSION": "BUILD_ONLY" }
    }
  }
}
```

## Enabling signing

Only when you intend the agent to submit real transactions:

```json
"env": { "ACCUMULATE_NETWORK": "testnet", "ACCUMULATE_MCP_PERMISSION": "SIGN_AND_SUBMIT" }
```

Keep this on **testnet** for agent development. The server bundles no keys — signing material is supplied by the caller/tool inputs.

## Status

**Published:** `accumulate-studio-mcp@1.0.0` on npm (self-contained bundle; only `@modelcontextprotocol/sdk` is an external dependency). Hardened with safe defaults (testnet, `BUILD_ONLY`) and honors `ACCUMULATE_NETWORK` / `ACCUMULATE_MCP_PERMISSION`. Install with `npx -y accumulate-studio-mcp`.
