# agent-lsp

Code intelligence for AI agents: compiler diagnostics, jump-to-definition,
find-references and workspace symbol search — all as JSON, across five SDKs.

This is the LSP row of the agent-readiness rubric.

## Two tools, because the questions are different

**`diagnostics.mjs` — "does this compile, and what's wrong?"**

Fronts each toolchain's authoritative checker and normalises the output to one
LSP-shaped schema. The semantics come from the same compiler a language server
would front; only the transport differs, and a compiler is always present
wherever the code can be built.

| Language | Checker |
|---|---|
| rust | `cargo check --message-format=json` |
| dart | `dart analyze --format=machine` |
| javascript / typescript | `tsc --noEmit` |
| csharp | `dotnet build` |
| python | `pyright --outputjson` (falls back to `compileall` if absent) |

**`navigate.mjs` — "where is this defined, and who uses it?"**

Navigation cannot be answered by a compiler; it needs a server that has indexed
the project. This drives the real language server and returns one shape whichever
one answered.

| Language | Server | Status |
|---|---|---|
| rust | `rust-analyzer` | ✅ (`rustup component add rust-analyzer`) |
| python | `pyright-langserver` | ✅ (bundled with pyright) |
| dart | `dart language-server` | ✅ (ships with the Dart SDK) |
| javascript / typescript | `typescript-language-server` | ✅ |
| csharp | — | ❌ reported as unavailable, not silently empty |

## Use

```bash
# diagnostics
node tools/agent-lsp/diagnostics.mjs --lang rust --path /path/to/project

# navigation
node tools/agent-lsp/navigate.mjs symbol     --lang python --path <root> --query SmartSigner
node tools/agent-lsp/navigate.mjs definition --lang rust   --path <root> --file <f> --line 12 --col 13
node tools/agent-lsp/navigate.mjs references --lang dart   --path <root> --file <f> --line 1  --col 7
```

Over MCP, agents call `acc.diagnose` and `acc.navigate` and get the same objects.

```json
{ "ok": true, "verb": "references", "count": 6,
  "locations": [ { "file": "…/main.rs", "line": 12, "column": 13,
                   "endLine": 12, "endColumn": 19 } ] }
```

Exit codes: `0` results / clean · `1` diagnostics present or no results · `2`
usage or toolchain error. `AGENT_LSP_DEBUG=1` prints the raw command and output
to stderr.

## Three bugs this was built to avoid

**A checker that cannot fail.** In JavaScript regex `.` excludes line
terminators and CR is one, so `(.+)$` never matches a CRLF line. The first
version parsed nothing on Windows and reported **clean for code that did not
compile**. Every parser now goes through `splitLines`, and that behaviour is
unit-tested without invoking a toolchain.

**An empty answer that looks like a real one.** Language servers index
asynchronously. rust-analyzer answered `workspace/symbol` in 261 ms with nothing,
seconds before it had the answer — indistinguishable from "this symbol has no
references". Queries now retry until non-empty or a deadline, which adapts to
project size instead of guessing with a fixed sleep.

**A missing capability that looks like a negative result.** Where no server is
installed, the tool says so (`available: false` with the install command) rather
than returning an empty list an agent would read as fact.

## Honest limits

- **C# has no language server here.** Diagnostics work via `dotnet build`;
  navigation reports unavailable. `dotnet tool install -g csharp-ls` would close
  it, and the server registry has a slot ready.
- **Navigation is position-based** (`--file --line --col`) for definition and
  references. `symbol` searches by name and is usually the better entry point for
  an agent that knows *what* it is looking for but not *where*.
- **First call on a large project is slow** — rust-analyzer indexes the whole
  crate graph before it can answer. The retry deadline defaults to 90 s and is
  configurable with `--timeout-ms`.
