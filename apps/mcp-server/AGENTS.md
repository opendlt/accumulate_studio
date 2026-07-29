# apps/mcp-server — repository guide for agents

The Accumulate MCP server, published to npm as `accumulate-studio-mcp`. Exposes all three MCP primitives: 14 typed **tools**, context **resources**, and 8 golden-path **prompts**.

Read the [root guide](../../AGENTS.md) first for monorepo setup.

## Build & test

```bash
npm run build --workspace=apps/mcp-server   # runs gen:mcp, then esbuild
npm run typecheck --workspace=apps/mcp-server
npm run test:mcp                            # from repo root; needs the build first
npm run dev:mcp                             # tsx watch on stdio
```

The protocol tests drive the **built bundle** over stdio, not the source — see the bundling gotcha below for why that distinction matters.

## Layout

```
src/index.ts            server setup, capabilities, request handlers, CLI
src/permissions.ts      READ_ONLY < BUILD_ONLY < SIGN_AND_SUBMIT
src/tools/              network, query, transaction, verification tools
src/resources/          concept docs, network registry, operation catalogs
src/prompts/            the 8 golden paths as invocable workflows
src/generated/content.ts  GENERATED — do not edit
test/protocol.test.mjs  end-to-end JSON-RPC tests against dist/
```

## Gotchas

- **stdout is the protocol channel.** MCP JSON-RPC travels over stdout; a stray `console.log` corrupts the stream and the client fails in a way that looks like a protocol bug. All logging goes to **stderr** (see `main()` in `src/index.ts`). This applies to anything the server calls, too — the Python SDK's `QuickStart` prints progress to stdout, which is exactly this failure mode.
- **The bundle cannot read files at runtime.** Build is `esbuild --bundle` and the package ships `files: ["dist"]`. Anything loaded via `fs` exists in the source tree and is absent from the published package. All content is inlined at build time through `src/generated/content.ts`.
- **`src/generated/content.ts` is generated.** It comes from `scripts/generate-mcp-content.mjs`, which reads the SDK manifests and `apps/studio/src/data/flow-templates.ts`. Edit those, then `npm run gen:mcp`.
- **Never import from `apps/studio`.** That pulls React into the bundle. The flow templates are parsed by the generator and reduced to plain metadata instead.
- **Signing is never on by default.** Default mode is `BUILD_ONLY`; `SIGN_AND_SUBMIT` must be requested explicitly via `--permission-mode` or `ACCUMULATE_MCP_PERMISSION`. Do not change the default.
- **Mainnet is never selected implicitly.** Default network is testnet; an unknown `ACCUMULATE_NETWORK` falls back to testnet rather than erroring into something unsafe.
- **Declaring a capability without handlers breaks clients.** If you add to the `capabilities` block, register the handlers in the same change — clients will call methods that then fail.
- **Prompts must disclose permission limits.** A workflow ending in `tx.submit` states that the submit will be refused in `BUILD_ONLY`. Silently emitting steps that cannot complete wastes an agent turn.

## Permitted commands

Safe unattended: build, typecheck, tests, `gen:mcp`, and running the server against a testnet.

Require a human first: `npm publish`, changing the default permission mode or default network, and enabling mainnet.

## Before you commit

```bash
npm run typecheck --workspace=apps/mcp-server && npm run build:mcp && npm run test:mcp
```
