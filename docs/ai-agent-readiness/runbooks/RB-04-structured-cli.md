# RB-04 — Structured CLI with `--json` across all five SDKs

**KPIs affected:** K2/K3/K4 (a fourth harness mode: `cli`), K6
**Depends on:** RB-05 (error envelope), RB-01 (measurement)
**Relates to:** Phase 4's `accumulate-gen` CLI in `PROGRESS.md`

---

## Why

A large population of agents operates through a terminal, not by writing and compiling a program. For those agents, the current cost of "what is this account's balance?" is: create a project, add a dependency, write a file, compile, run, delete. That is six turns for a read.

Verified: **no first-party source file in any of the five SDKs contains a `--json` flag.** (A repo-wide grep returns hits only under `opendlt-python-v2v3-sdk/.venv/` — vendored `mypy`, `pip`, `pygments`.)

CLI entry points today:

| SDK | Entry point | Status |
|---|---|---|
| Rust | `unified/src/bin/` | **empty directory** |
| Dart | `unified/bin/accumulate.dart` | exists; no `--json` |
| Python | — | no `[project.scripts]` in `unified/pyproject.toml` |
| JavaScript | — | no `bin` in `package.json` |
| C# | — | no tool manifest |

Rust having an empty `src/bin/` is a stalled start worth finishing.

## The second reason: text output is a parsing tax

Agents parse whatever they are given. Human-formatted tables with ANSI color force brittle regex extraction, and a formatting change silently breaks the agent. A stable JSON envelope removes an entire class of failure.

---

## Design

### One verb set, five implementations

The CLI is a thin shell over the same golden path the SDKs expose. Do not invent new capability — expose what exists.

```
accumulate query <url>                         # any account
accumulate balance <url>
accumulate chain <url> [--start N] [--count N]
accumulate faucet <url>
accumulate credits estimate <url> --amount N
accumulate tx build <op> [--param k=v ...]
accumulate tx submit --envelope <file>
accumulate tx wait <txid>
accumulate tx status <txid>
accumulate keys generate [--algorithm ed25519]
accumulate net list
accumulate net status
accumulate version
```

Verbs mirror the MCP tool names (`acc.query` → `query`, `tx.wait` → `tx wait`) deliberately: one mental model across both front doors, and the MCP tool descriptions become the CLI help text.

### The envelope

**Every** `--json` response uses one shape. Success:

```json
{
  "ok": true,
  "data": { },
  "meta": { "network": "kermit", "sdk": "python", "version": "2.2.1", "durationMs": 412 }
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "ACC_ACCOUNT_NOT_FOUND",
    "category": "not_found",
    "retryable": false,
    "hint": "The account URL does not exist on this network.",
    "remediation": "Verify the URL and network...",
    "raw": "..."
  },
  "meta": { }
}
```

`error` is the RB-05 catalog entry verbatim. This is why RB-05 lands first — otherwise five CLIs invent five error shapes.

### Rules that make it agent-safe

1. **`--json` writes only JSON to stdout.** All logging, progress, and warnings go to stderr. One object, no banner. (Same discipline the MCP server already enforces at `index.ts:300-315`.)
2. **Exit codes are meaningful.** `0` success · `1` operation failed (envelope has `error`) · `2` usage error · `3` network unreachable. An agent should be able to branch on the exit code without parsing.
3. **Never prompt.** No interactive confirmation, ever. Anything dangerous requires an explicit flag.
4. **Mainnet is opt-in.** Default network is testnet. Mainnet requires `--network mainnet` *and* `ACCUMULATE_ALLOW_MAINNET=1`. Mirrors the MCP server's "never mainnet implicitly" stance (`index.ts:290`).
5. **Signing is opt-in.** Read verbs need no key. Anything that signs requires an explicit key source (`--key-file`, `--key-env`) and never reads an ambient default.
6. **`--json` output is versioned.** Include `envelope: "1"` so a future shape change is detectable.

### Discoverability

`accumulate --help --json` returns the full command tree as JSON: verbs, flags, types, required-ness. An agent then needs exactly one call to learn the entire surface. This is the CLI equivalent of `ListTools` and is worth more than any prose help.

---

## Steps

### 1. Specify once

`docs/ai-agent-readiness/CLI-SPEC.md` — verbs, flags, envelope, exit codes, and a conformance checklist. All five implementations target this document. Without it you get five dialects.

### 2. Build the reference implementation

**Python first** — fastest to iterate, and it is the reference for error behavior per `PROGRESS.md`. Add to `unified/pyproject.toml`:

```toml
[project.scripts]
accumulate = "accumulate_client.cli:main"
```

Ship the conformance test suite alongside it: a table of (argv, expected exit code, JSON-schema assertion). That suite is then reused for the other four.

### 3. Port to the remaining four

| SDK | Mechanism |
|---|---|
| Rust | `src/bin/accumulate.rs` (fills the empty dir); `clap` derive |
| Dart | extend `bin/accumulate.dart`; declare `executables:` in `pubspec.yaml` |
| JS | `bin: { "accumulate": "./lib/cli.js" }` — namespace-check first, `npx accumulate-sdk-opendlt` is the safe invocation |
| C# | `<PackAsTool>true</PackAsTool>`, `<ToolCommandName>accumulate</ToolCommandName>` → `dotnet tool install -g Acme.Net.Sdk` |

**Binary-name collision is a real risk.** A global `accumulate` from five packages will conflict on a machine with more than one installed. Options: keep `accumulate` per-ecosystem (they rarely coexist), or prefix (`acc-py`, `acc-rs`). Decide in step 1 and hold it — do not let each SDK choose.

### 4. Add a JSON schema for the envelope

`schemas/cli-envelope.schema.json`, validated by the conformance suite in all five languages. This is what prevents drift.

### 5. Add `cli` mode to the harness

`runner.mjs:28` already declares `MODES = ['sdk', 'mcp', 'codegen']`. Add `'cli'`. Then measure: the same 8 tasks via CLI. Expect turns-to-first-tx to drop sharply for read-heavy tasks.

### 6. Document in `AGENTS.md` and `llms.txt`

Both need a CLI section (RB-03 generator work). `llms.txt` should show the one-liner form for the three most common reads — an agent that finds this never writes a program for a balance check.

---

## Acceptance criteria

- [ ] `CLI-SPEC.md` exists and all five implementations conform
- [ ] All 13 verbs work in all 5 SDKs
- [ ] `--json` emits exactly one envelope object on stdout, nothing else
- [ ] Envelope validates against `schemas/cli-envelope.schema.json` in all 5
- [ ] Errors carry RB-05 catalog codes
- [ ] Exit codes 0/1/2/3 behave as specified
- [ ] No verb prompts interactively under any input
- [ ] Mainnet requires both the flag and the env var
- [ ] `accumulate --help --json` returns the full command tree
- [ ] Conformance suite runs in each SDK's CI
- [ ] Harness `cli` mode runs all 8 tasks
- [ ] Binary naming decided once and applied uniformly

## Risks

**Five dialects.** The single biggest failure mode. Spec first, shared conformance suite, schema-validated envelope — all three are required, not optional.

**Scope creep into a full node CLI.** This is an SDK CLI. It exposes the SDK's golden path. It is not `accumulated`, does not manage validators, and does not need every RPC method.

**Key handling.** A CLI that signs is a CLI that touches private keys. Never read an ambient default key. Never log key material. Never accept a key as a positional argument (shell history). `--key-file` and `--key-env` only.

**Maintenance multiplier.** Five CLIs is five surfaces to keep in sync with the SDK. Generating the command layer from the same manifests that drive `llms.txt` would collapse this — worth evaluating before hand-writing the fifth one.

## Rollback

Additive per SDK. Removing the entry point declaration (`[project.scripts]`, `bin`, `PackAsTool`, `executables`) un-ships the CLI without touching library code.
