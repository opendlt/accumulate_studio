# Hash Lock (HTLC) Payment — the 9th golden path

A hash-time-locked payment on Accumulate, as a Studio flow and as generated code in Python, JavaScript, Dart, Rust and C#. Template id: `hash-lock` (Advanced, ~10 min).

## What it does

The sender locks tokens to a SHA-256 hash. The receiver is credited only when someone reveals the preimage. In one run:

1. Create keys, fund from the faucet, buy credits, create an ADI with a sender and a receiver token account, fund the sender.
2. **Generate Hash Lock**: a random 32-byte preimage, its hash (`sha256` or `sha256d`) and an expiration (default 30 minutes).
3. **Send Tokens** with the lock (the `hashLock` header on an ordinary SendTokens). The sender is debited at once; the receiver gets a *locked deposit* and its balance does **not** change.
4. **Wait for Locked Deposit**: find the deposit among the send's `produced` records. A release targets the deposit, not the send.
5. **Release Locked Operation**: the receiver reveals the preimage. The receiver's balance rises by `LOCK_AMOUNT`.

The flow is 17 steps, cloned from Token Transfer so it reuses paths that are proven in every language. One ADI owns both accounts; in a real swap the receiver is another party. Flow variables: `ADI_NAME` (required), `LOCK_AMOUNT` (default `1.00000000` ACME).

## Limits

- **No refund.** The protocol design refunds an unreleased lock when it expires, but that path is unreachable in current core: an unclaimed lock is never refunded and cannot be released after it expires, so the funds are stranded. The flow therefore always releases, and no Studio, MCP or generated text promises a refund. The defect is written up in [`CORE-ISSUE-refund.md`](CORE-ISSUE-refund.md), awaiting a human to file it. Use small amounts.
- **No HASH160.** The protocol defines it; Studio offers `sha256` and `sha256d` only (RUNBOOK D-4). Both ran live in all five languages.
- **SDK-only in the CLI.** CLI mode refuses a flow that contains an HTLC block: it emits a comment saying so and exits 1, never a half-built command list (STATUS D-10). Use the generated SDK program, Studio, or the MCP tools.
- A locked send in Studio takes exactly one recipient. The protocol allows several (one deposit each, one shared hash).
- Testnet only. The proof is on Kermit (core 1.4.6.7). HTLC needs a node at 1.4.6.4 or later. Never run it against mainnet.

## How to run it

**In Studio** (needs the proxy for execution):

```bash
npm ci && npm run build:types && npm run install:proxy
npm run dev:all
```

Open the template gallery, pick **Hash Lock (HTLC) Payment**, Execute on Kermit, and fill in `ADI_NAME` (a unique name) in the Execute dialog. Execution runs through the sdk-proxy: `/api/send-tokens` takes `hash_algorithm`, `hash` and `expiration`, and `/api/sign-and-submit` accepts `ReleaseLockedOperation`.

**As generated code**: choose the template, pick a language, download the project, install and run it:

| Language | Package (tested version) | Run |
|---|---|---|
| Python | PyPI `accumulate-sdk-opendlt` 2.5.0 | `pip install -e .` then `python -m <package>.main` |
| JavaScript | npm `accumulate-sdk-opendlt` 2.5.2 | `npm install` then `node src/index.js` |
| Dart | pub.dev `opendlt_accumulate` 2.5.0 | `dart pub get` then `dart run` |
| Rust | crates.io `accumulate-sdk` 2.5.0 | `cargo run` |
| C# | NuGet `Acme.Net.Sdk` 2.5.0 | `dotnet run` |

A program takes 1–4 minutes. It exits non-zero on any failure of the locked send, the deposit wait or the release, and prints the node's reason (a wrong preimage prints `preimage does not match hash`). Generated programs name the ADI `adi-<unix seconds>-<6 random hex>` by default, so programs started in the same second do not collide (decision D-31). Set `ADI_NAME` to choose your own.

**From an agent** (MCP, `--permission-mode SIGN_AND_SUBMIT` to submit): `tx.build` takes an optional `hashLock` header `{hashAlgorithm, hash, expiration}` on `sendTokens`, validated like the node (`sha256`/`sha256d`, a 32-byte hash, an expiration 10 minutes to 30 days ahead; 15+ recommended), and builds `releaseLockedOperation` with `{lockedTxID, preimage}`. `tx.submit` re-checks the window. The `hash-lock` prompt walks through the flow.

## Evidence

Everything was run on Kermit and verified on chain by a stdlib-only script (`evidence/p6/verify_htlc.py`) that trusts nothing a program printed.

- [`evidence/e2e/INDEX.md`](evidence/e2e/INDEX.md): the table of 25 verified runs (per language: 2 consecutive published-registry runs, 1 local-SDK run, 1 `sha256d` lock, 1 wrong-preimage negative) plus the 15 live action-palette tests, with every txid. One JSON per run in `evidence/e2e/`, full program logs in `evidence/e2e/logs/`.
- `evidence/p6/`: the in-Studio run on Kermit (screenshots, the proxy log, the verifier output).
- `evidence/p5/`, `evidence/p4/`, `evidence/p2/`, `evidence/p0-probe.json`: the mock-execution runs, the five-language compile proof, the registry regression and the first ground-truth probe.
- [`STATUS.md`](STATUS.md): the phase ledger, decisions D-01 to D-27 and the defect triage. [`RUNBOOK.md`](RUNBOOK.md) is the plan; [`RELEASE-READINESS.md`](RELEASE-READINESS.md) the release summary.

## Where the code lives

| Area | Path |
|---|---|
| Blocks, catalog, prerequisites | `packages/types/src/{blocks,block-op-map,prerequisites}.ts` |
| Code generation (5 languages) | `packages/codegen/src/manifest-generator.ts`, `templates/<lang>/{generate_hash_lock,wait_for_locked_deposit,release_locked,send_tokens}.hbs`, `manifests/*.sdk-manifest.json` |
| The template | `apps/studio/src/data/flow-templates.ts` (`hashLockFlow`), `templates/hash-lock.yaml` |
| In-Studio execution | `apps/studio/src/services/execution/node-executor.ts`, `apps/sdk-proxy/app/routes/{tokens,generic}.py` |
| MCP | `apps/mcp-server/src/tools/transaction.ts`, `src/prompts/index.ts` |
| Agent docs | `scripts/generate-agent-artifacts.mjs` (the HTLC section of each SDK's `llms.txt` / `llms-full.txt`) |
