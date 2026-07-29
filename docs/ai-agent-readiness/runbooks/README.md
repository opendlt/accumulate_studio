# AI-Agent Readiness — Runbooks

Execution plans for closing the four agent-support pillars across `accumulate-studio` and the five Accumulate SDKs.

These sit beneath the phase docs (`../00-MASTER-PLAN.md` … `../05-PHASE-4-differentiation.md`). Phase docs say *what* and *why*; runbooks say *how*, with verified file references and acceptance criteria.

---

## Pillar assessment (2026-07-27)

| Pillar | State | Runbooks |
|---|---|---|
| **MCP** | 14 tools, 3-tier permissions, published — but only 1 of MCP's 3 primitives | RB-02 |
| **AGENTS.md** | Present in all 5 SDKs, but they are SDK *usage* guides, not repo manifests; studio has none | RB-03 |
| **LSP / code intelligence** | Typed surfaces mostly good; no machine-readable CLI; no error taxonomy | RB-04, RB-05, RB-07·A |
| **DevTools / sandboxing** | Absent — no devcontainers, no runtime introspection for Studio | RB-06, RB-07·B |

---

## The runbooks

| # | Title | Unlocks | Depends on | Status |
|---|---|---|---|---|
| [RB-01](RB-01-agent-harness-runner.md) | Agent-harness runner + K2–K4 baseline | K2, K3, K4 | agent key, testnet | ✅ **done** |
| [RB-02](RB-02-mcp-resources-and-prompts.md) | MCP Resources + Prompts | K2/K3/K4 in `mcp` mode | RB-01 | ✅ **done** |
| [RB-03](RB-03-manifest-genre-split.md) | Manifest genre split | K2/K3/K4 in `sdk` mode | RB-01 | ✅ **done** |
| [RB-04](RB-04-structured-cli.md) | Structured CLI with `--json` | new `cli` mode | RB-05, RB-01 | ⬜ not started |
| [RB-05](RB-05-error-taxonomy.md) | Canonical error taxonomy | **K7** | RB-01 | ⬜ not started |
| [RB-06](RB-06-devcontainers.md) | Devcontainers for all six repos | removes `install-fail` | RB-03 | ⬜ not started |
| [RB-07](RB-07-devtools-and-typed-surfaces.md) | Studio agent DevTools + typed-surface closure | **K6**, `codegen` mode | RB-01 | 🟡 Part A done; Part B generation half done |

Each completed runbook carries an **As-built** section recording what was delivered, what deviated from the plan, and what it found. Read those before starting the next one — RB-01's as-built in particular documents three measurement bugs that a false PASS depended on.

## Sequence

```
RB-01 ──┬──> RB-05 ──> RB-04
        ├──> RB-02
        ├──> RB-03 ──> RB-06
        └──> RB-07
```

**RB-01 first, and alone.** Every green KPI today measures packaging — names match, files ship, versions align, no drift. Every KPI that measures whether an agent can actually *succeed* is `PENDING`. Until the runner lands there is no before/after for anything else, and "agent-preferred" stays a claim rather than a number.

**RB-05 before RB-04**, because the CLI's JSON error envelope is the catalog entry. Five CLIs built before the taxonomy exists will invent five error shapes.

**RB-03 before RB-06**, because a container guarantees the toolchain and the manifest states the commands. Either alone is half a handoff.

RB-02, RB-03, and RB-07 are independent of each other and can run in parallel once RB-01 provides the baseline.

---

## Findings that drove these

Each is verified against the tree, not inferred:

1. **MCP declares only `tools`.** `apps/mcp-server/src/index.ts:105`. No Resources, no Prompts — so the amount-scaling rule, the prerequisite chain, the network registry, and the 8 golden paths are all withheld from agents. → RB-02

2. **The error-catalog renderer is dead code.** `scripts/generate-agent-artifacts.mjs:173` and `:202` render `m.errors` and `op.errors`. Measured across all five manifests: **0 top-level errors, 0 operations with errors**, while 22 of 24 operations declare `requires`. Every `llms-full.txt` ships with zero error information, and every `AGENTS.md` instructs agents to "branch on the SDK error type/code." → RB-05

3. **AGENTS.md is the wrong genre.** All five files are 33 lines of SDK usage guidance. None contains Build, Test, Lint, or Layout. `accumulate-studio` — the most complex repo, and the one that *generates* the others' manifests — has none at all. Rust ships a `Makefile` with `ci-check`, `coverage-gate`, and `audit` that its manifest never mentions. → RB-03

4. **No `--json` anywhere.** A repo-wide grep across all five SDKs returns first-party hits: zero. Rust's `src/bin/` is an empty directory. Python, JS, and C# have no CLI entry point. → RB-04

5. **No devcontainers, in any repo.** The only Dockerfile is `apps/sdk-proxy/Dockerfile` — deployment infra, not an agent workspace. → RB-06

6. **Rust and Dart type signals are unmeasured, not failing.** `tools/artifact-verify/verify.mjs` defines `expectPyTyped` (python), `expectXmlDoc` (csharp), `expectTypesEntry`/`expectExportsResolve` (javascript) — and nothing for rust or dart. The scorecard's `·` means *no check defined*. → RB-07·A

7. **Studio has no runtime introspection.** An agent cannot verify that a generated flow renders or executes. The `#flow=` permalink from P3-3 and the live preview from P3-4 are the pieces needed to build it. → RB-07·B

---

## Cross-cutting invariants

Decisions that must hold across runbooks, or the surfaces diverge:

- **One error shape.** The RB-05 catalog entry is what SDKs raise, what the CLI emits under `--json`, what MCP returns, and what headless Studio reports. Four front doors, one taxonomy.
- **One verb vocabulary.** MCP tool names and CLI verbs mirror each other (`acc.query` ↔ `query`, `tx.wait` ↔ `tx wait`).
- **Testnet by default, mainnet opt-in, signing opt-in.** Already true of the MCP server (`index.ts:290`); RB-04 and RB-06 must not weaken it.
- **stdout is protocol.** True for the MCP server today and for the CLI under `--json`. Logs go to stderr.
- **Generated, not hand-maintained.** Agent artifacts derive from `packages/codegen/src/manifests/`. Anything hand-written becomes the next drift surface — and K10 is the gate that catches it.
- **Verify the published artifact, never the source tree.** `verify.mjs:13-14`. Applies to every new check.

## Two standing external gates

Carried forward from `../PROGRESS.md` — neither can be self-satisfied:

1. **Registry publish tokens** — to ship the MCP minor bump (RB-02) and the CLIs (RB-04).
2. **Agent API key + funded testnet** — to run RB-01 at all, and therefore to measure anything.
