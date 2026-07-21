# @accumulate-studio/types

Shared TypeScript types for Accumulate Studio — the vocabulary every other package (codegen, mcp-server, verification, studio app) is built on. Mirrors the JSON Schemas in `schemas/`.

## Modules (all re-exported from the package root)

- **`blocks`** — the block catalog (`BLOCK_CATALOG`, `BlockType`) describing every Accumulate operation a flow can contain.
- **`flow`** — the `Flow` graph schema: nodes, edges, variables, network.
- **`sdk-map`** — the machine-readable SDK surface: `SDKMap`, `SDKEntryPoint`, `SDKOperation`, `InputParam`, `OutputParam`, `SymbolRef`, `SDKError`, plus `SDKLanguage` and display/extension/project-file maps. This is the type behind every `*.sdk-manifest.json`.
- **`network`** — `NetworkId`, `NetworkConfig`, `NetworkStatus`, and the `NETWORKS` table.
- **`prerequisites`** — the prerequisite knowledge graph (what must exist/settle before an operation).
- **`block-op-map`** — `blockTypeToOp` / `opToBlockType` mapping between block types and stable operation ids.

## Usage

```ts
import { BLOCK_CATALOG, blockTypeToOp, type Flow, type SDKMap } from '@accumulate-studio/types';
```

## Contract
These types are the TypeScript projection of `schemas/*.json`. Change one, change both — `scripts/check-manifest-drift.ts` enforces that manifests stay consistent with `BLOCK_CATALOG`.
