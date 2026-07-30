# Accumulate SDK CLI — specification (RB-04)

**Envelope version: `1`** · **Spec status: normative.** All five SDK CLIs target this
document. Any divergence is a bug in the implementation, not a dialect.

---

## 1. Command name

The command is **`accumulate`** in every ecosystem.

Five packages each shipping a global `accumulate` will collide on a machine with
more than one installed. That is accepted deliberately: the SDKs rarely coexist,
and a single name keeps every doc, `llms.txt` snippet and agent prompt identical.
When they do coexist, use the ecosystem-scoped invocation, which is always
unambiguous and never installs a global shim:

| SDK | Scoped invocation |
|---|---|
| Python | `python -m accumulate_client.cli` |
| JavaScript | `npx accumulate-sdk-opendlt` |
| Rust | `cargo run --bin accumulate --` |
| Dart | `dart run opendlt_accumulate:accumulate` |
| C# | `dotnet accumulate` (after `dotnet tool install`) |

## 2. Verbs

Verb names mirror the MCP tool names (`acc.query` → `query`, `tx.wait` → `tx wait`)
so one mental model covers both front doors.

| Verb | Network | Signs | Notes |
|---|:--:|:--:|---|
| `query <url>` | yes | no | any account |
| `balance <url>` | yes | no | token account balance |
| `chain <url> [--start N] [--count N]` | yes | no | chain entries |
| `faucet <url>` | yes | no | testnet only |
| `credits estimate <url> --amount N` | yes | no | credits for N ACME |
| `tx build <op> [--param k=v ...]` | no | no | emits an unsigned body |
| `tx submit --envelope <file>` | yes | yes | requires a key source |
| `tx wait <txid>` | yes | no | polls to final state |
| `tx status <txid>` | yes | no | single status read |
| `keys generate [--algorithm ed25519]` | no | no | never touches disk |
| `net list` | no | no | static registry |
| `net status` | yes | no | reachability |
| `version` | no | no | SDK + envelope version |

Global flags: `--json`, `--network <id>`, `--help`, `--version`.
Key flags (signing verbs only): `--key-file <path>`, `--key-env <VAR>`.

## 3. The envelope

Under `--json`, **stdout carries exactly one JSON object and nothing else.** No
banner, no progress, no trailing newline noise. Logs, warnings and progress go to
**stderr**.

Success:

```json
{
  "envelope": "1",
  "ok": true,
  "data": {},
  "meta": { "network": "kermit", "sdk": "python", "version": "2.3.1", "durationMs": 412 }
}
```

Failure — `error` is the RB-05 catalog entry verbatim:

```json
{
  "envelope": "1",
  "ok": false,
  "error": {
    "code": "ACC_ACCOUNT_NOT_FOUND",
    "category": "not_found",
    "retryable": false,
    "hint": "The account URL does not exist on this network.",
    "remediation": "Verify the URL and the network...",
    "raw": "Accumulate Error Not Found"
  },
  "meta": { "network": "kermit", "sdk": "python", "version": "2.3.1", "durationMs": 88 }
}
```

`retryable` is the field an agent acts on. It is never omitted.

Validated by [`schemas/cli-envelope.schema.json`](../../schemas/cli-envelope.schema.json).

## 4. Exit codes

An agent must be able to branch without parsing.

| Code | Meaning |
|:--:|---|
| `0` | success (`ok: true`) |
| `1` | operation failed — envelope carries `error` |
| `2` | usage error (unknown verb, missing/invalid argument) |
| `3` | network unreachable (transport failure, not a protocol error) |

## 5. Safety rules

1. **Never prompt.** No interactive confirmation under any input, ever.
2. **Mainnet is opt-in twice:** `--network mainnet` **and** `ACCUMULATE_ALLOW_MAINNET=1`.
   Either alone is a usage error (exit `2`).
3. **Signing is opt-in.** Read verbs need no key. Signing verbs require an explicit
   `--key-file` or `--key-env` and never read an ambient default.
4. **Keys are never positional** (shell history) and never logged.
5. **Default network is testnet/kermit**, never mainnet.

## 6. Discoverability

`accumulate --help --json` returns the entire command tree as one envelope —
verbs, flags, types, required-ness, whether each needs the network or signs. This
is the CLI equivalent of MCP's `ListTools`: one call teaches an agent the whole
surface.

```json
{ "envelope": "1", "ok": true,
  "data": { "command": "accumulate", "verbs": [ { "name": "query", "args": [...], "flags": [...],
             "network": true, "signs": false, "summary": "..." } ] }, "meta": {} }
```

## 7. Conformance

`tools/cli-conformance/run.mjs` drives any implementation as a black box: it
executes argv tables, asserts exit codes, and validates every stdout envelope
against the schema. It is language-agnostic on purpose — the same suite is the
gate for all five, which is what stops five dialects.

```bash
node tools/cli-conformance/run.mjs --cmd "python -m accumulate_client.cli"
```
