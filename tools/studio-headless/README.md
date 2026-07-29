# studio-headless

Agent-facing runtime introspection for Studio's code generator (RB-07B).

For every other artifact in this program an agent can verify its own output — run the tests, call the API, query the chain. Studio is a browser app, so it could not. This makes generation results machine-readable.

## Use

```bash
npm run build:headless       # bundle it (esbuild)
npm run verify:codegen       # 8 templates x 5 languages, no network — the CI gate

npm run studio:headless -- --list
npm run studio:headless -- --template token-transfer --lang rust
npm run studio:headless -- --flow ./my-flow.json --lang python
npm run studio:headless -- --all --out report.json
```

Exit codes: `0` all generations clean · `1` at least one failed · `2` usage error.

stdout carries only the JSON document; progress goes to stderr — the same discipline the MCP server and the SDK CLIs follow.

## Output

```json
{
  "schema": 1,
  "ok": true,
  "summary": { "total": 40, "passed": 40, "failed": 0, "errors": 0, "warnings": 0 },
  "results": [
    {
      "template": "token-transfer",
      "language": "rust",
      "nodeCount": 13,
      "ok": true,
      "bytes": 15624,
      "lines": 317,
      "durationMs": 166,
      "diagnostics": [],
      "error": null
    }
  ]
}
```

## What it checks

**Flow structure** (before generation) — these exist because output-only checks reported a clean pass for a flow whose blocks did not exist. A single `NotARealBlockType` node produced 53 lines of valid-looking Python and scored `ok: true`.

- unknown block types (validated against `BLOCK_CATALOG`)
- empty flows
- multi-node flows with no connections
- duplicate node ids

**Generated code** (after generation):

- unrendered `{{...}}` expressions — `Handlebars.compile` is lazy, so an unbound variable survives compilation and only shows up in the output
- `[object Object]` — a value stringified wrongly
- literal `undefined`
- empty output
- any reference to **mainnet**
- unscaled decimal amount literals (the 1 ACME = 1e8 footgun)
- unbalanced braces and parentheses

## Why it is bundled rather than run directly

`packages/codegen` is bundler-only in two independent ways:

1. `tsconfig.base.json` sets `moduleResolution: bundler`, so emitted ESM has extensionless specifiers that Node's resolver rejects. `packages/types/dist` has the same problem.
2. `template-loader.ts` imports `.hbs` files with Vite's `?raw` suffix, which only a bundler understands.

Studio is unaffected (Vite handles both), but no Node script can consume the generator directly. `scripts/build-headless.mjs` bundles the entry with esbuild — the approach `apps/mcp-server` already uses — plus a small plugin that resolves `?raw` as text.

This is a workaround, not a fix. Making `@accumulate-studio/codegen` importable from Node would need a module-strategy change across the monorepo.

## Scope

This is an introspection tool, not a replacement for the app's test suite. It answers "did this flow generate correct-looking code, and if not why". It does not render the UI.

Browser-level console and network capture (the Playwright half of RB-07B) is not implemented — it needs a new dependency and a ~300MB browser download. The generation half is the part that gates CI and catches real defects; it runs in ~2 seconds with no network.
