# accumulate-studio-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives an AI agent typed, permissioned tools for the **Accumulate** blockchain — query accounts, build and validate transactions, sign & submit, and verify receipts — over stdio.

## Tools (14)

| Namespace | Tools |
|---|---|
| `net.*` | `net.list`, `net.select`, `net.status` |
| `acc.*` | `acc.query`, `acc.get_chain`, `acc.get_balance` |
| `tx.*` | `tx.build`, `tx.estimate_credits`, `tx.validate_prereqs`, `tx.submit`, `tx.wait` |
| `proof.*` / `trace.*` | `proof.get_receipt`, `proof.verify_receipt`, `trace.synthetics` |

Each tool ships an `inputSchema`; unknown tools return the full valid tool list; errors are structured and coded.

## Permission model (safe by default)

Three tiers gate what an agent may do. The default is **`BUILD_ONLY`** — signing is never enabled implicitly.

| Mode | Allows |
|---|---|
| `READ_ONLY` | query accounts / view data only |
| `BUILD_ONLY` *(default)* | query + build + estimate + validate transactions |
| `SIGN_AND_SUBMIT` | everything, including signing and submitting |

## Configuration

| Input | How | Default |
|---|---|---|
| Permission mode | `--permission-mode <MODE>` **or** `ACCUMULATE_MCP_PERMISSION` env | `BUILD_ONLY` |
| Default network | `ACCUMULATE_NETWORK` env (`testnet`/`mainnet`/`devnet`) | `testnet` |

Precedence for permission: CLI flag > env > default. The server never selects mainnet or enables signing unless you ask.

## Run

```bash
# from source (until published)
npm run build --workspace=apps/mcp-server
node apps/mcp-server/dist/index.js --permission-mode READ_ONLY
```

## Use from an AI agent

Add to your MCP client config (Claude Code / Codex / any MCP host). See `docs/ai-agent-readiness/MCP.md` for full snippets.

```json
{
  "mcpServers": {
    "accumulate": {
      "command": "npx",
      "args": ["-y", "accumulate-studio-mcp"],
      "env": { "ACCUMULATE_NETWORK": "testnet", "ACCUMULATE_MCP_PERMISSION": "BUILD_ONLY" }
    }
  }
}
```

> The `npx` form works once the package is published to npm. Until then, use the local `command: "node"`, `args: ["<abs>/apps/mcp-server/dist/index.js"]` form.

## Safety

- Testnet default; mainnet only on explicit `ACCUMULATE_NETWORK=mainnet`.
- `BUILD_ONLY` default; signing requires explicit `SIGN_AND_SUBMIT`.
- No keys are bundled; signing material is supplied by the caller.
