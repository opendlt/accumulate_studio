# RB-02 — MCP Resources and Prompts

**KPIs affected:** K2/K3/K4 in `mcp` mode (expect the largest single improvement), K9 (scope)
**Depends on:** RB-01 for measurement
**Pairs with:** RB-05 (the error catalog becomes a Resource)

---

## Why

MCP defines three primitives: **Tools** (model-invoked actions), **Resources** (application-controlled context), and **Prompts** (user-invoked templates). The server ships exactly one.

`apps/mcp-server/src/index.ts:105`:

```ts
capabilities: {
  tools: {},
}
```

The consequence is concrete. An agent connected to this server can call `acc.query`, but cannot read:

- that 1 ACME = 1e8 base units,
- that a key page needs credits before it can sign,
- the network registry it is choosing between,
- the operation catalog with signatures — 24 operations per language, already in the manifests,
- any error semantics.

All of that knowledge exists in this repo. The server withholds it. An agent must therefore *already know Accumulate* to use the tools — which inverts the entire value proposition.

And with no Prompts, the 8 golden paths in `apps/studio/src/data/flow-templates.ts` — the most validated asset in the project, each with `instructions`, `prerequisites`, `estimatedTime`, and a working node graph — are invisible to MCP hosts. A user in Claude Code cannot type `/accumulate:create-adi`.

## Verified current state

| Fact | Evidence |
|---|---|
| Only `tools` capability declared | `index.ts:105-107` |
| Only `ListTools` / `CallTool` handlers registered | `index.ts:112,123` |
| 14 tools across 4 modules | `tools/index.ts:19-24` |
| Manifests hold 24 ops/lang with full signatures | `packages/codegen/src/manifests/*.sdk-manifest.json` |
| 22 of 24 ops declare `requires` (e.g. `["keypair","credits"]`) | same |
| 8 golden templates with rich metadata | `flow-templates.ts:1028+` |
| SDK dep is `@modelcontextprotocol/sdk ^1.0.0` | `apps/mcp-server/package.json:32` |
| Build is a single esbuild bundle | `package.json:26` |

**Note on the SDK version:** `^1.0.0` resolves to a modern 1.x that supports resources and prompts. Confirm the installed version exposes `ListResourcesRequestSchema`, `ReadResourceRequestSchema`, `ListPromptsRequestSchema`, `GetPromptRequestSchema`, and `ListResourceTemplatesRequestSchema` before starting; pin the minimum in `package.json` once verified.

---

## Design

### Resource URI scheme

```
accumulate://concepts/{topic}          # amount-scaling, credits, adi-vs-lite, key-hierarchy, authorities
accumulate://networks                  # live registry with current selection
accumulate://sdk/{lang}/llms.txt       # concise router
accumulate://sdk/{lang}/llms-full.txt  # full API digest
accumulate://sdk/{lang}/operations     # JSON: ops with signatures, inputs, outputs, requires
accumulate://errors                    # canonical taxonomy (RB-05)
accumulate://templates/{id}            # golden-path flow as JSON
```

Static entries (`accumulate://networks`, `accumulate://errors`) go in `ListResources`. The parameterized families go in **`ListResourceTemplates`** with RFC 6570 URI templates — do not enumerate 5 langs × 3 files as 15 flat resources.

### Which resources earn their place

Prioritize by observed failure class from RB-01. Before that data exists, these are the defensible picks:

1. **`accumulate://concepts/amount-scaling`** — the single most common integration bug, already named as such in `generate-agent-artifacts.mjs:90`.
2. **`accumulate://concepts/credits`** — the prerequisite chain (ADI → credits on key page → can sign) that `requires: ["keypair","credits"]` encodes for 22 operations.
3. **`accumulate://sdk/{lang}/operations`** — machine-readable, not prose. An agent picking an operation should read JSON, not grep a text digest.
4. **`accumulate://errors`** — deferred to RB-05; register the URI now, populate there.

### Prompts from golden paths

Map each `FlowTemplate` to an MCP Prompt. The type already carries everything needed:

| `FlowTemplate` field | MCP Prompt field |
|---|---|
| `id` | prompt `name` (e.g. `create-adi`) |
| `name` + `description` | `description` |
| `instructions[]` | numbered steps in the message body |
| `prerequisites[]` | preamble |
| `flow.variables[]` | prompt `arguments` |

Emit 8 prompts. Each returns a message that states the goal, the ordered steps, the prerequisite chain, and the amount-scaling rule — then instructs the agent to use `tx.validate_prereqs` before `tx.submit`.

**Do not** make prompts return the node graph JSON. A prompt is an instruction template for the agent, not a payload for Studio.

### Source of truth

Resources must be **generated from the manifests**, not hand-written, or they become the next drift surface. `packages/codegen/src/manifests/*.sdk-manifest.json` is already the single source for `llms.txt`; extend that. Concept documents are the one hand-authored set — put them in `apps/mcp-server/src/resources/concepts/*.md` and bundle them.

**Bundling caveat:** the build is `esbuild --bundle` (`package.json:26`). Markdown and JSON read at runtime via `fs` will not be in `dist/`. Either inline them at build time via an esbuild loader, or add a prebuild step that emits a generated `.ts` module of string constants. The generated-module route is simpler and keeps `files: ["dist"]` correct.

---

## Steps

### 1. Declare the capabilities

`index.ts:105`:

```ts
capabilities: {
  tools: {},
  resources: {},
  prompts: {},
}
```

Declaring a capability without registering handlers makes hosts call methods that then fail — land handlers in the same change.

### 2. Add the resource module

`apps/mcp-server/src/resources/index.ts` exporting:

```ts
export const staticResources: Resource[];
export const resourceTemplates: ResourceTemplate[];
export async function readResource(uri: string): Promise<ResourceContents>;
```

`readResource` throws `McpError(ErrorCode.InvalidParams, ...)` on unknown URIs, listing valid prefixes — mirroring the existing unknown-tool message style at `index.ts:129-132`.

### 3. Add the prompts module

`apps/mcp-server/src/prompts/index.ts` exporting `allPrompts` and `getPrompt(name, args)`.

The MCP server must not import from `apps/studio` — that would drag React into the bundle. Add a prebuild step that reads `flow-templates.ts` and emits `apps/mcp-server/src/prompts/generated-templates.ts` with only `{id, name, description, instructions, prerequisites, variables}`. Extend `scripts/generate-agent-artifacts.mjs` or add a sibling script; either way it runs before `build:mcp`.

### 4. Register the four handlers

In `createServer()`, alongside the existing two:

```ts
server.setRequestHandler(ListResourcesRequestSchema, ...)
server.setRequestHandler(ListResourceTemplatesRequestSchema, ...)
server.setRequestHandler(ReadResourceRequestSchema, ...)
server.setRequestHandler(ListPromptsRequestSchema, ...)
server.setRequestHandler(GetPromptRequestSchema, ...)
```

### 5. Respect the permission model

Resources are read-only context and are available in all three modes — including `READ_ONLY`. Prompts are likewise safe to list.

But a prompt whose steps culminate in `tx.submit` should say so when the server is in `BUILD_ONLY`. Have `getPrompt` append a mode-aware note: in `BUILD_ONLY`, state that the final submit step will be refused and the user must restart with `SIGN_AND_SUBMIT`. Silently emitting steps that will fail is exactly the kind of dead end RB-01 counts as an intervention.

### 6. Update startup logging and help

`index.ts:304` logs `Registered ${allTools.length} tools`. Extend to resources and prompts. Add both to `printHelp()` (`index.ts:222`), and update `apps/mcp-server/README.md` and `docs/ai-agent-readiness/MCP.md` — the latter currently says "gives an AI agent 14 typed tools," which becomes wrong.

### 7. Version and republish

This is a feature addition to a published package: bump `accumulate-studio-mcp` to `1.1.0`. K9's scorecard value is the hardcoded string `'accumulate-studio-mcp@1.0.0 on npm'` (`scorecard.mjs:77`) — update it, and consider deriving it from the registry the way the other KPIs are derived.

---

## Acceptance criteria

- [ ] `resources/list`, `resources/templates/list`, `resources/read`, `prompts/list`, `prompts/get` all respond correctly over stdio
- [ ] All 8 golden paths appear as prompts; each names its prerequisites and the 1e8 rule
- [ ] `accumulate://sdk/{lang}/operations` returns valid JSON for all 5 languages, with 24 operations each
- [ ] Unknown URIs and unknown prompt names produce actionable `McpError`s
- [ ] Resource content is generated from manifests — editing a manifest and rebuilding changes the resource
- [ ] `npm run build:mcp` produces a `dist/` that serves all resources with no runtime `fs` reads
- [ ] Prompts in `BUILD_ONLY` disclose that submit steps will be refused
- [ ] `typecheck` clean
- [ ] RB-01 re-run in `mcp` mode shows movement vs. the `sdk` baseline

## Risks

**Drift.** Hand-written resources rot. The generation requirement in step 3 is the mitigation; `artifact-verify` should eventually assert resource content matches manifest content (K10).

**Bundle size.** `llms-full.txt` × 5 languages inlined is meaningful. Measure; if it is a problem, serve the full digest from a URI that reads the packaged manifest JSON rather than the rendered text.

**Over-serving.** Do not expose every manifest field as a resource. Each resource costs the agent context. Cut anything RB-01 does not show a failure class for.

## Rollback

Remove the three handler registrations and revert the capabilities block. Tools continue to work — the change is strictly additive. Unpublish is not needed; `1.0.0` remains installable.

---

## As-built (2026-07-27)

Implemented and verified end-to-end against the built bundle. `accumulate-studio-mcp` bumped to **1.1.0**.

**Delivered:** `capabilities` now declares `tools`, `resources`, and `prompts`; all five handlers registered (`resources/list`, `resources/templates/list`, `resources/read`, `prompts/list`, `prompts/get`).

- **5 concept documents** — amount-scaling, credits, adi-vs-lite, key-hierarchy, networks
- **Live network registry** at `accumulate://networks`, reflecting the current selection rather than a build-time snapshot
- **5 operation catalogs** — 24 operations each, 120 total, with symbols, signatures, inputs, outputs, and `requires`
- **8 golden-path prompts**, each stating the 1e8 rule, the credit prerequisite chain, and ordered steps

**21 protocol tests** drive the real `dist/index.js` over stdio and all pass.

### Decisions worth recording

**Content is generated, not hand-written.** `scripts/generate-mcp-content.mjs` reads the SDK manifests and `flow-templates.ts` and emits `src/generated/content.ts`, wired into `prebuild`. A consistency gate fails the build if a package name drifts from `generate-agent-artifacts.mjs` — the two front doors cannot disagree.

**Generated module, not runtime `fs`.** The server is bundled with `esbuild --bundle` and ships `files: ["dist"]`, so anything read at runtime would exist in the source tree and be absent from the published package. Inlining at build time is the only correct option, and the protocol tests run against the bundle specifically to catch a regression here.

**No import from `apps/studio`.** That would pull React into the bundle. The generator parses `flow-templates.ts` and reduces it to plain metadata. It asserts exactly 8 templates parse and fails loudly if the file's shape drifts.

**Prompts disclose permission limits.** In `BUILD_ONLY`, a workflow ending in a submit says so and names the flag to change it. Silently emitting steps that will be refused costs an agent a turn — the exact waste K3 measures.

**`GetPromptResult` from the SDK, not a local interface.** A hand-rolled return type resolves against the wrong member of the SDK's result union and fails to typecheck.

### Follow-on

`accumulate://errors` is specified in the URI scheme but not yet populated — it lands with RB-05, along with the `acc.explain_error` tool.
