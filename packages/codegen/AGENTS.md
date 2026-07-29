# packages/codegen — repository guide for agents

Manifest-driven code generator. Turns a Studio flow (nodes + connections + config) into runnable code for Python, Rust, Dart, C#, and JavaScript.

Read the [root guide](../../AGENTS.md) first for monorepo setup.

## Build & test

```bash
npm run build --workspace=packages/codegen
npm test --workspace=packages/codegen
npm run validate:manifests    # from the repo root — manifests vs block catalog
npm run validate:canonical    # every canonical task covered by every manifest
```

No network required.

## Layout

```
src/manifest-generator.ts     the engine (~1150 lines)
src/manifests/*.sdk-manifest.json  per-language SDK maps — the source of truth
src/templates/<language>/*.hbs     Handlebars templates, one per block type
```

`src/manifests/` feeds far more than codegen: `llms.txt`, `llms-full.txt`, `AGENTS.md`, and the MCP server's resources are all generated from it. A manifest edit propagates to every agent-facing artifact — run `npm run gen:agent && npm run gen:mcp` after changing one.

## Gotchas

These have each cost real debugging time.

- **`Handlebars.compile` is lazy.** A template with a syntax error compiles without complaint and throws only when rendered. Tests must actually *render* every template, not merely compile it.
- **`}}}` adjacency.** A triple-stache next to a closing brace parses in a way you did not intend. Add whitespace.
- **`isVarRef` is per-language.** It detects a variable reference rather than a literal: Rust looks for `format!()`, C# for `$"` or `.String()`, Dart for `.toString()` or `${`. Adding a language means extending this, or every config value gets quoted as a literal.
- **All-uppercase strings are literals, not refs.** `isVarRef` rejects `/^[A-Z][A-Z0-9]*$/` so a token symbol like `TESTTKN` is not mistaken for a variable.
- **C# `.String()` belongs on Url objects only.** `Lid` and `Lta` are Url objects and need it; a stored URL string like `createAdiUrl` does not. Calling it on a string fails to compile.
- **CreateIdentity reuses `{{varName}}Url`.** The ADI URL is a timestamp expression; evaluating it twice yields two different URLs. Every language's template must bind it once and reuse the variable.
- **AddCredits is excluded from signer injection.** After a CreateIdentity, transactions switch to signing with `adiUrl/book/1` — but AddCredits must still sign with the lite identity, because the new key page has zero credits and cannot pay for its own funding.
- **UpdateKeyPage on a page with its own book signs with that book.** Accumulate requires all authorities to approve; signing with the page's own book satisfies both the ADI authority and the page's.
- **Snapshots are committed** so codegen tests run in a bare CI with no SDKs installed.

## Permitted commands

Safe unattended: build, test, the validators, and the generators.

Require a human first: editing a committed snapshot to make a test pass (confirm the new output is correct first), and any change to transaction marshaling or signing bytes.

## Before you commit

```bash
npm test --workspace=packages/codegen && npm run validate:manifests && npm run validate:canonical
```

If you changed a manifest or a template, regenerate the downstream artifacts too:

```bash
npm run gen:agent && npm run gen:mcp
```
