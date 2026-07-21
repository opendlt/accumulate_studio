# @accumulate-studio/agent-pack

Utilities for generating and validating **agent packs** — bundles of documentation and metadata (`AGENTS.md`, `SAFETY.md`, `sdk.map.json`, prompt templates) that help AI coding agents work effectively with the Accumulate SDKs.

> Note: the curated per-SDK `llms.txt` / `llms-full.txt` / `AGENTS.md` shipped in the repos are produced by `scripts/generate-agent-artifacts.mjs` (repo root) directly from the SDK manifests. This package provides the lower-level building blocks and validators, and the `SAFETY.md` / prompt templates that generator does not yet emit.

## Public API

### Generation
- `generateAgentPack(options)` → `AgentPackFiles` — builds a complete agent-pack folder structure.
- `generateSDKMap(options)` — builds a representative `sdk.map.json` from curated templates; `KNOWN_ERRORS`, `OPERATION_MAPPINGS`, `SDK_PACKAGE_NAMES` are the curated inputs.
- `generateAgentsMd(options)` / `generateSafetyMd(options)` — the `AGENTS.md` and `SAFETY.md` templates.

### Prompts
- `createAdiPrompt`, `sendTokensPrompt`, `writeDataPrompt`, `zeroToHeroPrompt`, `getDefaultPrompts`, `generatePromptsIndex`, `generatePromptWithLanguage`.

### Validation
- `validateAgentPack`, `validateManifest`, `validateSDKMap`, `validatePromptsIndex`, `validateAgentsMd`, `validateSafetyMd` → `ValidationResult` (with typed `ValidationIssue` / `ValidationSeverity`).

## Honesty note
`sdk.map.json` here is **curated**, not introspected from live SDK source (see `docs/audit-remediation/P1-9-agent-pack-introspection.md`). The authoritative machine map is the `*.sdk-manifest.json` in `@accumulate-studio/codegen`.

## Usage

```ts
import { generateAgentPack, validateAgentPack } from '@accumulate-studio/agent-pack';
```
