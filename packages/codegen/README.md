# @accumulate-studio/codegen

The code-generation engine behind Accumulate Studio: turns a flow (a graph of Accumulate operations) into runnable, idiomatic code in five languages, plus the export bundle and agent artifacts.

## Public API

### Manifest-driven code generation
- `generateCodeFromManifest(flow, language, mode, manifest)` — the core generator; emits code for `python | rust | dart | csharp | javascript`. Fails loud on a missing required template rather than emitting stubs.
- `loadManifest(language)` / `loadAllManifests()` — load the bundled `*.sdk-manifest.json` (the single source of truth for each SDK's surface).
- `validateManifest(...)` → `ValidationResult` with a `CoverageReport`.

### Templating helpers
- `createTemplateEngine()`, `loadBundledTemplates()`, and case helpers (`toSnakeCase`, `toKebabCase`, `toCamelCase`, `toPascalCase`), `nodeToVarName`, `lookupOperation`.

### Export bundle
- `generateBundle(flow, options)` → `Bundle` (files + `BundleManifest`). Node-only zip helpers live at `@accumulate-studio/codegen/node`.

### Project scaffolds
- `generatePythonProject` / `generateRustProject` / `generateDartProject` / `generateJavaScriptProject` / `generateCSharpProject`, plus `generateProject` and the `PROJECT_GENERATORS` registry.

### Flow (de)serialization
- `serializeFlowToYaml`, `parseFlowYaml`, `deserializeYamlToFlow`.

### Assertions (for verification)
- `generateAssertions`, `validateAssertions`, and `assertAccountExists` / `assertBalanceDelta` / `assertReceiptVerified` / `assertTxStatus`.

### Agent files
- `generateAgentTask`, `generateAgentAcceptance`, `generateAgentPackRef`, `generateMCPConfig`/`generateMCPConfigJson`, `generateAllAgentFiles`.

## Where the SSOT lives
`src/manifests/{language}.sdk-manifest.json` — schema-validated against `schemas/sdk-map.schema.json`, drift-checked by `scripts/check-manifest-drift.ts`, and the source the agent artifacts (`llms.txt` etc.) are generated from.

## Related
- `scripts/generate-agent-artifacts.mjs` (repo root) consumes these manifests to emit `llms.txt`/`llms-full.txt`/`AGENTS.md`.
