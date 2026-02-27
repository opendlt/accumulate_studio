# Accumulate Studio

A developer onboarding platform for the [Accumulate](https://accumulatenetwork.io/) blockchain protocol. Build transaction workflows visually, execute them against live testnets, and export production-ready code in five languages.

## Overview

Accumulate Studio is a monorepo containing a visual flow builder, a multi-language code generation engine, a Python SDK proxy for transaction signing, and an MCP server for AI-assisted development with Claude.

Users design Accumulate workflows by connecting blocks (Generate Keys, Faucet, Create Identity, Send Tokens, etc.) in a visual canvas. The platform executes these flows against a selected network, displays results in real time, and generates equivalent standalone code that developers can take into their own projects.

## Repository Structure

```
accumulate-studio/
  apps/
    studio/          React/Vite web application (visual flow builder)
    sdk-proxy/       FastAPI backend for transaction signing via the Python SDK
    mcp-server/      Model Context Protocol server for Claude integration
  packages/
    types/           Shared TypeScript type definitions
    codegen/         Multi-language code generation engine (Handlebars templates)
    verification/    Cryptographic receipt and Merkle proof verification
    agent-pack/      Agent Pack definitions for SDK capabilities
  schemas/           JSON schemas for agent packs, bundles, assertions, SDK maps
  templates/         Golden-path YAML workflow templates
  scripts/           Code generation and validation scripts
```

## Supported Languages

The code generation engine produces standalone, runnable code in:

- **Python** -- via the official `accumulate` Python SDK
- **Rust** -- via the `accumulate-sdk` crate
- **C#** -- via `Acme.Net.Sdk`
- **JavaScript/TypeScript** -- via `@accumulatenetwork/sdk`
- **Dart** -- via the `accumulate_dart_client` package

## Prerequisites

- Node.js >= 18
- npm (ships with Node.js)
- Python >= 3.10 (for the SDK proxy)

## Getting Started

Install dependencies from the repository root:

```bash
npm install
npm run install:proxy   # install Python dependencies for sdk-proxy
```

Start the Studio development server with the SDK proxy:

```bash
npm run dev:all
```

This launches the Vite dev server for the Studio UI and the FastAPI proxy concurrently. Open the URL printed by Vite (typically `http://localhost:5173`).

To run just the Studio frontend:

```bash
npm run dev
```

To run just the SDK proxy:

```bash
npm run dev:proxy
```

## Build

```bash
npm run build          # build all workspaces
npm run build:studio   # build only the Studio app
npm run build:codegen  # build only the codegen package
npm run build:types    # build only the types package
```

## Testing and Validation

```bash
npm test               # run tests across all workspaces
npm run typecheck       # TypeScript type checking
npm run lint            # ESLint across all workspaces
npm run validate:manifests  # check SDK manifest consistency
```

## Code Generation Scripts

The `scripts/` directory contains generators that produce template files for each language. These use Vite SSR to load the Studio's flow templates and code generator, then write standalone source files to disk.

Golden-path templates (from `templates/*.yaml`):

| Script | Output |
|--------|--------|
| `generate-rust.mjs` | Rust `.rs` files |
| `generate-csharp.mjs` | C# `.cs` files |
| `generate-javascript.mjs` | JavaScript `.js` files |

Action Palette templates (single-action flows with prerequisite chains):

| Script | Output |
|--------|--------|
| `generate-action-palette-rust.mjs` | 21 Rust templates |
| `generate-action-palette-csharp.mjs` | C# action palette templates |
| `generate-action-palette-dart.mjs` | Dart batch 1 templates |
| `generate-action-palette-dart-batch2.mjs` | Dart batch 2 templates |
| `generate-action-palette-python.mjs` | Python batch 1 templates |
| `generate-action-palette-python-batch2.mjs` | Python batch 2 templates |
| `generate-action-palette-javascript.mjs` | JavaScript action palette templates |

Run any generator from the repository root:

```bash
node scripts/generate-rust.mjs
```

## Golden-Path Templates

Pre-built workflow templates in `templates/` cover common Accumulate operations:

- `zero-to-hero.yaml` -- end-to-end flow from key generation to a funded token account
- `adi-creation.yaml` -- full ADI setup with key book and key page
- `lite-account-setup.yaml` -- lightweight account for quick prototyping
- `token-transfer.yaml` -- send tokens between accounts
- `custom-token.yaml` -- create and manage custom token issuers
- `data-writing.yaml` -- create data accounts and write entries
- `key-rotation.yaml` -- rotate keys on an existing identity
- `multi-sig-setup.yaml` -- configure multi-signature accounts

## MCP Server

The MCP server (`apps/mcp-server`) exposes Accumulate operations as tools for Claude:

- **Network** -- list networks, select active network, check connectivity
- **Query** -- account state, chain info, balances
- **Transaction** -- build, validate, submit, and wait for transactions
- **Verification** -- fetch receipts, verify Merkle proofs, trace synthetic transactions

Start it with:

```bash
npm run dev:mcp
```

## SDK Proxy Architecture

The browser cannot perform Accumulate transaction signing directly (binary TLV encoding, Ed25519 signatures). The SDK proxy bridges this gap:

```
Studio (browser) --> FastAPI SDK Proxy --> Accumulate Python SDK --> Accumulate Network
```

The proxy supports network selection via the `ACCUMULATE_NETWORK` environment variable (`mainnet`, `testnet`, `kermit`, `devnet`, `local`). The default is `testnet`.

## License

MIT -- see [LICENSE](LICENSE) for details.
