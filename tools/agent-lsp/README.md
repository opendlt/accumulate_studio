# agent-lsp

Structured compiler feedback for AI agents — the code-intelligence pillar.

## Why this exists rather than a language server

The LSP row of the agent-readiness rubric asks for *precise language semantics:
type errors and symbol locations, machine-readable*. A real language server is
the ideal transport, but the servers are not installed uniformly. On the
maintainer's machine `rust-analyzer` and Dart's server are present; pyright,
OmniSharp and tsserver are not. An agent cannot depend on a capability that is
missing for three of five languages.

So this fronts the authoritative checker each toolchain already ships and
normalises the output to one LSP-shaped schema. The *semantics* come from the
same compiler a language server would front — only the transport differs.

| Language | Checker |
|---|---|
| rust | `cargo check --message-format=json` |
| dart | `dart analyze --format=machine` |
| javascript / typescript | `tsc --noEmit` |
| csharp | `dotnet build` |
| python | `python -m compileall` |

## Use

```bash
node tools/agent-lsp/diagnostics.mjs --lang rust --path /path/to/project
```

Over MCP, agents call the `acc.diagnose` tool with `{ language, path }` and get
the same object back.

```json
{
  "ok": false,
  "lang": "javascript",
  "tool": "tsc --noEmit",
  "counts": { "error": 1, "warning": 0 },
  "diagnostics": [
    { "file": "b.ts", "line": 1, "column": 7, "severity": "error",
      "code": "TS2322", "message": "Type 'string' is not assignable to type 'number'." }
  ]
}
```

Exit codes: `0` clean · `1` diagnostics present · `2` usage or toolchain error.
Set `AGENT_LSP_DEBUG=1` to print the raw command and output to stderr.

## The bug this tool was built to avoid

In JavaScript regex, `.` excludes line terminators and CR is one of them, so a
`(.+)$` pattern never matches a CRLF line. The first version parsed nothing on
Windows and reported **clean for code that did not compile** — the worst possible
failure for a checker, because an agent trusts it and moves on.

`parsers.mjs` is split out from the runner so that behaviour is unit-tested
without invoking a toolchain (`node --test tools/agent-lsp/test/`), and every
parser goes through `splitLines`, which splits on either ending.

## Limitations, stated plainly

- Python has no type checker here. `compileall` catches syntax errors only; it
  will not find a type mismatch. Installing `pyright` would raise this to parity
  with the others, and is the obvious next step.
- This reports diagnostics. Jump-to-definition and find-references still need a
  real language server; `rust-analyzer` and `dart language-server` are present on
  this machine and are the natural place to start.
