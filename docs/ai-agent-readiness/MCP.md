# Accumulate MCP — install & use (Phase 2 · P2-ST-09)

The Accumulate MCP server (`accumulate-studio-mcp`) gives an AI agent 14 typed tools for Accumulate with a safe-by-default permission model. This page is the install reference.

## What an agent gets

- **Query:** `acc.query`, `acc.get_chain`, `acc.get_balance`
- **Build:** `tx.build`, `tx.estimate_credits`, `tx.validate_prereqs`
- **Sign/submit:** `tx.submit`, `tx.wait` (only in `SIGN_AND_SUBMIT`)
- **Network:** `net.list`, `net.select`, `net.status`
- **Verify:** `proof.get_receipt`, `proof.verify_receipt`, `trace.synthetics`

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
