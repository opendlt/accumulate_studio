# Runbook: Hash Lock (HTLC) golden-path example for Accumulate Studio

**Goal.** Ship Accumulate Studio with a 9th golden-path example, **"Hash Lock (HTLC) Payment"**, and have the code Studio generates in all five languages (Python, JavaScript/TypeScript, Dart, Rust, C#) run end to end against a live network:

1. Lock tokens to a SHA-256 hash.
2. Find the locked deposit.
3. Release it with the preimage.
4. Prove the recipient was credited.

It must also run live inside Studio through the sdk-proxy. MCP, the agent artifacts and the docs must all describe it accurately.

**Execution.** This runbook is executed by an automated coding agent under `MASTER_PROMPT.md`. Progress is recorded in `docs/hash-lock-example/STATUS.md`, which the executor creates and maintains.

**Baseline.**
- Studio is at `3a663ef`.
- `accumulate-core` local is `d1225f9ac` (1.4.6.5). Upstream `origin/main` is at `2c43a6b17` (1.4.6.7). Upstream contains no HTLC code changes beyond local.
- All five SDKs are at 2.5.x (JS 2.5.2).

Every `file:line` reference was taken from those commits. **Re-check each reference before you edit**; line numbers drift.

---

## 0. What a hash lock is (authoritative summary)

Full detail is in Appendix A. This is the minimum every phase depends on.

| Concept | Fact | Source |
|---|---|---|
| Lock | No new transaction type. A **header field** `hashLock` (binary field 8) is set on an ordinary `SendTokens`. | `accumulate-core/protocol/transaction.yml:34-39` |
| `HashLockOptions` | `{1 hashAlgorithm enum, 2 hash bytes(hex in JSON), 3 expiration time}`. `expiration` is **absolute wall-clock UTC**. In binary it is Unix **seconds**; in JSON it is RFC 3339. | `transaction.yml:72-85` |
| Algorithms | `sha256`=1 (32 B), `sha256D`=2 (32 B, SHA256(SHA256(x))), `hash160`=3 (20 B, RIPEMD160(SHA256(x))). JSON names are case-insensitive on parse. | `protocol/enums.yml:391-403` |
| Node limits | The hash length must match the algorithm. Expiration is **required** and must be **≥10 min and ≤30 days** ahead, checked against the node's wall clock, at both submit and execute. | `chain/send_tokens.go:43-73` |
| Effect | The sender is debited immediately. Each recipient gets a `SyntheticLockedDeposit` (type 0x37) **instead of** a deposit. The recipient balance **does not change** until release. | `send_tokens.go:97-131`, `chain/synthetic_locked_deposit.go:73-114` |
| Release | New transaction `ReleaseLockedOperation` (0x18) with body `{lockedTxID, preimage}`. | `user_transactions.yml:287-297` |
| `lockedTxID` | The **SyntheticLockedDeposit's txid** (`acc://<hash>@<recipient-account>`), **not** the SendTokens txid. Find it in the send's `produced` records. | `test/e2e/txn_htlc_test.go:169-181` |
| Release principal and signer | The principal must equal the deposit's recipient URL. The transaction must be signed by that account's authority (ADI key page, or lite identity), and that signer must have credits. | `chain/release_locked_operation.go:37-63,149-151` |
| Preimage | 1–256 bytes. The hash is computed over the raw bytes with no prefix. | `release_locked_operation.go:87-93,153-174` |
| Failure timing | A wrong preimage, an expired lock or a double release is **accepted at submit** and **fails at execute**. Always poll the release status. | `release_locked_operation.go:70-188` |
| Release result | `ReleaseLockedOperationResult{preimage, hashAlgorithm, hash, amount, token}`. The deposit's result becomes `{releaseTxID}`. Its status stays `delivered`. | `release_locked_operation.go:279-296` |
| Refund | There is **no refund transaction**. The design refunds automatically on a major-block expiry. **⚠ That path is unreachable in current core** (see the Refund defect below). | `block/msg_transaction.go:758-803` |
| Other transaction types | `hashLock` is **silently ignored** on everything except SendTokens. | `send_tokens.go` is the only reader |
| Availability | Shipped in 1.4.6.3; wire-correct from **1.4.6.4** (1.4.6.3 used field 7 and must never be used). Not version-gated. **Kermit runs 1.4.6.7**, so HTLC is live there. Mainnet is not confirmed; never target it. | `CHANGELOG.md` |
| Fees | Locked SendTokens: normal transfer fee (3 credits, plus a possible +0.10 for a second 256 B chunk). Release: 0.01 credits. The **recipient's signer pays for the release**. | `protocol/fee_schedule.go:171,215-217` |

### ⚠ Refund defect (known core issue)

**The defect.** `expireLockedDeposit` returns early when `status.Code == errors.Delivered` (`internal/core/execute/v2/block/msg_transaction.go:772-775`). It assumes "delivered" means "released". But **every** successfully executed `SyntheticLockedDeposit` is `Delivered`, and a release changes only its `Result`. So:
- An unclaimed lock is never refunded.
- After expiry, a release is also refused ("locked deposit has expired").
- **The funds are stranded.**

**Evidence in core's own tests.** `TestHTLC_ExpiredLock` is skipped (`test/e2e/txn_htlc_test.go:667-671`). The swap test states "The actual refund mechanism on Accumulate is not yet implemented" (`:1059-1062`). All five SDK `llms.txt` files nonetheless say the tokens are "refunded to the sender".

**Consequences for this runbook (binding):**
- The Studio example **does not include a refund step** and **must not claim** a refund works. Its copy says the protocol design refunds on expiry, but that this is **not currently functional on the network**, and it links the issue.
- Use small amounts (the default lock amount is 1 ACME). The flow always releases.
- Phase 0 drafts a core issue report for a human to file. Phase 8 corrects the SDK docs' refund wording in the generator source, not in the SDK repos.

---

## Design (decided; the executor may refine it only through a recorded decision)

### D-1. The flow: "Hash Lock (HTLC) Payment", id `hash-lock`

It is self-contained and cloned from Token Transfer (`apps/studio/src/data/flow-templates.ts:291-445`), so it reuses paths that are already proven in every language. One ADI owns a sender and a receiver token account. The instructions explain that in a real swap the receiver is a different party.

| # | id | type | config (key points) |
|---|---|---|---|
| 0 | `generate_keys` | GenerateKeys | Ed25519 |
| 1 | `faucet` | Faucet | `times: 3` |
| 2 | `wait_for_balance` | WaitForBalance | `minBalance '15.00000000'` |
| 3 | `add_credits` | AddCredits | `'5.00000000'` |
| 4 | `wait_for_credits` | WaitForCredits | `minCredits 1000` |
| 5 | `create_identity` | CreateIdentity | `acc://{{ADI_NAME}}.acme` |
| 6 | `add_adi_credits` | AddCredits | recipient `{{create_identity.adiUrl}}/book/1` |
| 7 | `wait_for_adi_credits` | WaitForCredits | account `…/book/1` |
| 8 | `create_sender_account` | CreateTokenAccount | `…/htlc-sender` |
| 9 | `create_receiver_account` | CreateTokenAccount | `…/htlc-receiver` |
| 10 | `fund_sender` | SendTokens | lite → sender, `'500000000'` |
| 11 | `wait_for_sender_balance` | WaitForBalance | sender ≥ 1 |
| 12 | `create_hash_lock` | **GenerateHashLock (NEW, utility)** | `hashAlgorithm: 'sha256'`, `expirationMinutes: 30` |
| 13 | `locked_send` | SendTokens **+ hash lock** | principal sender, signer `book/1`, recipient receiver, amount `{{LOCK_AMOUNT}}`, `hashLockFrom: 'create_hash_lock'` |
| 14 | `wait_for_locked_deposit` | **WaitForLockedDeposit (NEW, utility)** | `sendTxId: '{{locked_send.txId}}'` (use whatever the actual SendTokens txid output name is), `maxAttempts: 60`, `delayMs: 2000` |
| 15 | `release_locked` | **ReleaseLockedOperation (NEW, transaction)** | principal receiver, signer `book/1`, `lockedTxId: '{{wait_for_locked_deposit.lockedTxId}}'`, `preimage: '{{create_hash_lock.preimage}}'` |
| 16 | `wait_for_receiver_balance` | WaitForBalance | receiver ≥ `LOCK_AMOUNT` |

**Flow variables:**
- `ADI_NAME` (required).
- `LOCK_AMOUNT` (decimal, default `'1.00000000'`). Add a `FLOW_VAR_DEFAULTS_*` override to base units (`"100000000"`), the way `TRANSFER_AMOUNT` does it (`packages/codegen/src/manifest-generator.ts:160-193`). Check how the Studio executor scales it (`node-executor.ts:66-74` always multiplies by 1e8), and make the in-Studio amount and the generated amount agree (§P6).

**Assertions:**
- `account.exists` for both accounts.
- `tx.status.equals success` for `locked_send` and for `release_locked`.
- A balance check on the receiver.

Do **not** let `assertions-generator.ts:190` emit a `balance.delta` on the receiver for the *locked* send; the receiver's balance doesn't move until release.

### D-2. The three new blocks

**GenerateHashLock** (utility, category `token`, icon `lock` or a new `key-round`)
- Config:
  - `hashAlgorithm` enum `['sha256','sha256d']`, default `sha256`.
  - `expirationMinutes` integer, default 30, min 15, max 43200.
  - `preimage` optional hex. Leave it empty to auto-generate 32 random bytes.
- Outputs: `preimage` (hex), `hash` (hex), `hashAlgorithm`, `expiration` (unix seconds, whole), `expirationIso`.
- **HASH160 is excluded in v1** (decision D-4).
- A 15-minute minimum leaves a margin over the node's 10-minute floor for clock skew and latency (core gotcha 3; loadgen uses 30).

**SendTokens hash-lock extension.** Add flat optional fields; `BlockConfigModal` has no nested-object widget (`BlockConfigModal.tsx:418-458`).
- `hashLockFrom` (node id of a GenerateHashLock block), **or** explicit `hashAlgorithm` / `hashLockHash` / `hashLockExpiration` refs. Pick one shape, record it as a decision, and keep codegen, executor, YAML and MCP consistent.
- When it is set, codegen emits the hash-locked call path (Appendix B) and the block's success message says "LOCKED".

**WaitForLockedDeposit** (utility)
- Config: `sendTxId`, `maxAttempts`, `delayMs`.
- Output: `lockedTxId`.
- Behaviour:
  1. Poll v3 `query` on the send txid until the response has `produced.records`.
  2. Query each `records[].value`.
  3. Pick the one whose `message.transaction.body.type == "syntheticLockedDeposit"` **and** `status == "delivered"`.
- No SDK has a helper for this, so every language template contains the loop (Appendix B). Treat a NotFound on the deposit as "not ready yet", not as an error.

**ReleaseLockedOperation** (transaction, op id `release_locked`)
- Config: `principal` (the recipient account), `signerUrl`, `lockedTxId`, `preimage` (hex).
- Codegen must:
  - check the submit result **and** the delivered status;
  - print the failure reason;
  - **exit non-zero** on failure. Dart and Rust SDK waits report a failed release as a timeout; see Appendix C.

### D-3. The generated code must work against **published** SDK versions

Users will `pip install`, `npm install`, `dart pub add`, `cargo add` or `dotnet add` from the registries. Templates must therefore avoid every published-SDK defect listed in Appendix C; workarounds live in the templates.

SDK repo fixes are welcome on local branches, but **publishing needs a human**. The release must not depend on an unpublished SDK fix unless a human approves publishing it first.

Minimum versions:

| Language | Package | Minimum |
|---|---|---|
| Python | `accumulate-sdk-opendlt` | 2.5.0 |
| JS | `accumulate-sdk-opendlt` | **2.5.1** (2.5.0 is deprecated: broken ESM import) |
| Dart | `opendlt_accumulate` | 2.5.0 |
| Rust | `accumulate-sdk` (lib `accumulate_client`) | 2.5.0 |
| C# | `Acme.Net.Sdk` | 2.5.0 |

### D-4. Scope exclusions (recorded; do not silently expand)

- **HASH160 in Studio is out of v1.**
  - Python's `hashlib.new('ripemd160')` can be missing under OpenSSL 3. Rust has no ripemd dependency. No SDK has a helper.
  - The protocol supports it. Studio documents it as "SDK-level only".
- **No refund step** (see the Refund defect).
- **Not added as a 9th canonical agent-harness task.** That would change the 40-run scorecard and need `harness:run`, which spends money. It is a recorded follow-up.
- **HTLC is not in the CLI** (`generateCLI`, `manifest-generator.ts:1767+`). CLI mode emits a clear comment and no broken commands.

---

## Phase P0: Preflight and ground truth (no product edits)

**P0.1 Environment.** Record versions in STATUS.md: Node ≥18, Python 3.11+ (with pip/venv), Dart, Rust/cargo, .NET 9 SDK, git.
- The Python SDK review found `C:\Python314\python.exe` **without pytest or pydantic**. Create a venv for SDK work: `python -m venv C:\tmp\htlc-venv`.
- A missing toolchain is a **blocker**. Report it; do not skip that language.

**P0.2 Repo state.** Make sure the Studio tree is clean on `main`, then create branch `feat/htlc-golden-path`. Record the HEAD of each related repo. Do **not** modify `accumulate-core`.

**P0.3 Baseline gates** (all must pass before any edit; record the counts):
```
npm ci && npm run build:types
npm run typecheck && npm test && npm run validate:manifests && npm run harness:test
npm run validate:canonical && npm run verify:codegen
npm run build:mcp && npm run test:mcp
(cd apps/sdk-proxy && python -m pytest -q)
```
A baseline failure goes in STATUS.md as pre-existing, and is fixed or explicitly waived by a human.

**P0.4 Live network probe (Kermit, read-only).** Query network status and record the core version. HTLC needs ≥1.4.6.4.

**P0.5 Ground-truth HTLC run.** Write a standalone **Python** script in `C:\tmp\htlc-probe-python\` against the **published** `accumulate-sdk-opendlt` 2.5.0 (fresh venv). It runs: lite keys → faucet → credits → locked SendTokens to a second lite account → find the deposit → release, with the recipient lite identity funded with credits.
- Record **verbatim JSON** in `docs/hash-lock-example/evidence/p0-probe.json` for:
  - the send's v3 query response, including the `produced` shape;
  - the deposit's query response, including the `result` shape;
  - the release's query response.
- Every "shape not verified" note in Appendix B is settled from this evidence. Templates must match observed shapes, not assumed ones.
- Also record a **negative probe**: a release with a wrong preimage must end with a failed status and `"preimage does not match hash"`.

**P0.6 Core issue draft.** Write `docs/hash-lock-example/CORE-ISSUE-refund.md`, a precise issue report for the refund defect with file:line, the reasoning, a suggested fix (gate on `SyntheticLockedDepositResult.ReleaseTxID == nil`, not on `Delivered`), and test evidence. **A human files it**; do not post it.

**Gate P0:** the baseline is green or waived, Kermit is ≥1.4.6.4, the probe released successfully with txids recorded, and the negative probe failed as expected.

---

## Phase P1: Per-language reference programs and SDK audit

**P1.1 One reference program per language.** For each of the five languages, write a minimal HTLC program in `C:\tmp\htlc-probe-<lang>\`, using the **published** registry package at the minimum version in D-3. It mirrors P0.5 and uses the APIs in Appendix B.
- Each program must print the send txid, the locked txid, the release txid, and the receiver's final balance.
- Each must **exit non-zero on any failure**.
- Run each against Kermit until it passes. These five programs are the **source of truth** for the codegen templates in P4.

**P1.2 Offline SDK tests.** Run the HTLC tests in each SDK (commands in Appendix C) and record the pass counts.

**P1.3 Defect triage.** For every defect in Appendix C and any new finding, record one of:
- **(a) workaround in template** (default);
- **(b) SDK fix on a local branch** in that SDK repo. Use a single-line commit, **no push or publish**, and say so in STATUS.md;
- **(c) blocker**: the published SDK cannot do HTLC at all. **Stop and ask a human.**

Recommended SDK branch fixes (non-blocking):
- Python: the top-level `HashLockOptions` export.
- Dart D1 and Rust R1: failed-status masking.
- C#: validation on the dictionary path.
- JS: strict hex parsing.

**Gate P1:** five reference programs passed on Kermit (txids recorded), and no unresolved (c) blockers.

---

## Phase P2: Align Studio's SDK versions, then run a regression

The Studio-emitted dependencies are stale and must reach the D-3 minimums:

| Where | Change |
|---|---|
| `packages/codegen/src/project-scaffolds.ts:60,155,246,320,393` | py `>=2.5.0`, rust `"2.5"`, dart `^2.5.0`, js `^2.5.2` (**currently `^0.12.3`**), C# `2.5.*` (**currently `1.0.*`**) |
| `packages/codegen/src/manifests/*.sdk-manifest.json` | `sdk_version` and `commit` set to the current SDK HEADs |
| `apps/sdk-proxy/pyproject.toml:7`, `requirements.txt:1` | `accumulate-sdk-opendlt>=2.5.0` |
| `packages/codegen/tests/csharp-harness/CSharpHarness.csproj:14` | `Acme.Net.Sdk` (`0.1.*`) → the version that matches the local SDK |
| `scripts/check-canonical-coverage.ts:33-39` | `PUBLISHED_VERSION` set to the current registry versions |
| `C:\tmp\js-template-test\package.json` | depends on `accumulate.js`; relink to `accumulate-sdk-opendlt` (templates import that name) |

**Regression.** A major-version jump (JS 0.12 → 2.5, C# 1.0 → 2.5) can break the **existing 8 golden paths**.
1. Regenerate all 8 in all 5 languages: `verify:codegen`, plus `scripts/generate-*.mjs`. The Python and Dart golden paths come from studio-headless.
2. Compile them all: run the `*-validation.test.ts` suites.
3. Live-run **Token Transfer and Multi-Signature** in each language against a **fresh project that installs from the registry** at the new pins.

Any break is fixed in templates before you continue.

**Gate P2:** all offline gates are green, and the live regression for 2 templates × 5 languages passed (txids recorded).

---

## Phase P3: Types, catalog and Studio UI

Read `packages/types` first. **Typecheck enforces the three `Record<BlockType,…>` maps.**

1. `packages/types/src/blocks.ts`:
   - Add `ReleaseLockedOperation` to `TransactionType` (`:24-50`).
   - Add `GenerateHashLock` and `WaitForLockedDeposit` to `UtilityBlockType` (`:56-63`).
   - Add the config interfaces, extend `SendTokensConfig` (`:126-134`), and extend the `SpecificBlockConfig` union (`:255-279`).
   - Add `BLOCK_CATALOG` entries modelled on SendTokens (`:480-515`) and LockAccount (`:769-792`).
   - The descriptions drive the widgets. "url" in a description produces a UrlField. Fields resolved from refs should say "auto-resolved" so required-validation skips them (`apps/studio/src/services/config-validation.ts:9-12`).
2. `block-op-map.ts:14-42`: add `ReleaseLockedOperation: 'release_locked'`, `GenerateHashLock: 'generate_hash_lock'` and `WaitForLockedDeposit: 'wait_for_locked_deposit'`.
3. `prerequisites.ts:67` `PREREQUISITE_GRAPH`:
   - Add `requires`, `produces`, `creditCost`, `explanation` and `defaultRecipe` for the three blocks.
   - Add a `ResourceKind` such as `'locked-deposit'` (`:13-27`).
   - The `defaultRecipe` for ReleaseLockedOperation must build a complete chain, because the action-palette e2e builds flows from it (`packages/codegen/tests/action-palette-e2e.test.ts:187-229`).
4. Icons: add the same key to **both** `components/flow-builder/BlockNode.tsx:42-66` and `components/palette/BlockItem.tsx:34-57`.
5. The hand-maintained lists:
   - `ExecuteConfirmModal.tsx:30-55` `CREDIT_COSTS`
   - `services/flow-serializer.ts:140-163,215-236`
   - `services/assertions-generator.ts:190,300-320` (no receiver `balance.delta` on a locked send)
   - `agent-files.ts:128-150,331,445-455`
   - `manifest-generator.ts:72-77` `TX_TYPES` (add ReleaseLockedOperation so signer injection applies)
6. **Browser constraint:** the Studio-side preimage and hash generation must use `crypto.getRandomValues` and `crypto.subtle.digest('SHA-256')`, plus manual hex. **No `Buffer`.**

**Gate P3:** `npm run typecheck`, the Studio vitest suites, and `validate:manifests` are green. `validate:manifests` will **fail until P4 adds the manifest ops**, so run P3 and P4 back-to-back before checking this gate.

---

## Phase P4: Codegen (5 languages × 3 new blocks + the SendTokens variant)

1. **`computeNodeVars`** (`manifest-generator.ts:702+`, switch `:790`): add cases for the three blocks. Extend the SendTokens case (`:974-1019`) with a `hashLock` flag and its vars.
   - Hex literals of ≥16 characters are already treated as literals by `isVarRef` (`:738-750`). Keep that behaviour.
2. **Suffix maps:** add `preimage`, `hash`, `expiration`, `lockedTxId` (and any other new outputs) to **all five** `OUTPUT_VAR_SUFFIXES_*` (`:375,393,411,429,447`). Check `URL_OUTPUTS` (`:465-468`): `lockedTxId` is a string txid, not a URL object, so no `.String()` in C#.
3. **Templates** (`packages/codegen/src/templates/{python,javascript,dart,rust,csharp}/`):
   - Add `generate_hash_lock.hbs`, `wait_for_locked_deposit.hbs` and `release_locked.hbs`.
   - Add a `{{#if hashLock}}` branch to each `send_tokens.hbs`.
   - Register each new template in `template-loader.ts` with a `?raw` import (`:10-180`) and a map entry (python `:196`, rust `:228`, dart `:260`, csharp `:292`, js `:324`). TypeScript reuses JavaScript.
   - **Copy the API usage from the P1 reference programs**, not from memory.
4. **Preambles:**
   - JS: add the imports `HashAlgorithm` (`core.HashAlgorithm`) and node `crypto` (`javascript/_preamble.hbs:10-21`).
   - Python: `from accumulate_client.tx.header import HashLockOptions` (**not** the top-level export; Appendix C).
   - Rust: `use accumulate_client::generated::enums::HashAlgorithm; use accumulate_client::HeaderOptions;` plus `rand` and `chrono` if they aren't already in the scaffold Cargo.toml.
   - Dart: `dart:math`, `package:crypto`.
   - C#: `System.Security.Cryptography`.
   - Update `project-scaffolds.ts` with any new crate or package dependencies.
5. **Failure semantics** in every new template:
   - print the reason;
   - append to `tx_ids`;
   - **exit non-zero on failure of the locked send, the deposit wait or the release.** A silent "FAILED" followed by continuing is not acceptable for this flow.
6. **Manifests** (`packages/codegen/src/manifests/*.sdk-manifest.json`):
   - Add ops `release_locked`, `generate_hash_lock` and `wait_for_locked_deposit`, with real symbols, paths, signatures, inputs, outputs and notes.
   - Add `hashLock` to `send_tokens` inputs and notes.
   - `scripts/check-manifest-drift.ts:51-64` must pass.
7. **CLI mode:** emit a comment saying HTLC is SDK-only. The output must not contain broken commands.
8. Hard-coded lists: `ALL_BLOCK_TYPES` in `tests/action-palette-codegen.test.ts:27`, `tests/project-scaffolds-unified.test.ts:6` and `tests/action-palette-e2e.test.ts:60-69`, plus `getConfig` (`:231-273`).

**Gate P4:**
- `npm test -w packages/codegen` is green.
- `verify:codegen` reports no `{{`, `[object Object]` or `undefined` in any language.
- Generated code for an HTLC flow **compiles in all 5 languages**: py_compile, `node --check`/tsc, `dart analyze`, `cargo check`, `dotnet build`.

---

## Phase P5: Golden-path template, YAML and offline tests

1. `apps/studio/src/data/flow-templates.ts`:
   - Add `hashLockFlow` per D-1.
   - Add the registry entry to `GOLDEN_PATH_TEMPLATES` (`:1066`): id `hash-lock`, name `Hash Lock (HTLC) Payment`, category `advanced`, tags `['tokens','advanced','htlc']`, estimatedTime `'10 min'`.
   - Write instructions and prerequisites, including a sentence on the refund status.
   - **The MCP parser constraint** (`scripts/generate-mcp-content.mjs:262`): keys in the order `id, name, description, category, estimatedTime, tags, flow, instructions, prerequisites`; single-quoted strings; **no apostrophes** in `name`.
2. `templates/hash-lock.yaml`:
   - Fully self-contained; the validators mock-execute it.
   - Keep `templates/index.ts:801-810` consistent.
3. `apps/studio/src/data/__tests__/flow-templates.test.ts:144-202`: add a `hash-lock` case that asserts the block order, the refs (`locked_send` → `wait_for_locked_deposit` → `release_locked`), and that `locked_send` carries a hash lock.
4. Mock RPC routers (`packages/codegen/tests/validate_{lang}.*`, python `route_rpc` `:33-103`):
   - Return a `produced` record and a `syntheticLockedDeposit` deposit, in the **shapes recorded in P0.5 evidence**.
   - Add `hash-lock` to `SELF_CONTAINED_TEMPLATES` and `TEMPLATE_TO_BASELINE` in each `*-validation.test.ts`.
5. **Snapshots:** `cd packages/codegen && npx vitest run codegen-snapshots -u` adds 5 snapshots.
   - **Review every new snapshot by hand** against the P1 reference program for that language.
   - **Existing snapshots must not change** unless P2 intentionally changed them. Explain any diff in STATUS.md.

**Gate P5:** all Studio and codegen suites are green, including the 5 `*-validation` suites mock-executing `hash-lock`.

---

## Phase P6: Live execution in Studio (sdk-proxy plus browser)

1. **Proxy (Python):**
   - `models.py:81-84` `SendTokensRequest`: add optional `hash_algorithm`, `hash`, `expiration` (unix seconds).
   - `routes/tokens.py:15-62`: pass `hash_lock=` to `sign_submit_and_wait` (use the dict form or the `tx.header` model; Appendix C).
   - Add `ReleaseLockedOperation` to `routes/generic.py:32-38` `ALLOWED_TX_TYPES`, and handle the hex preimage (`_TYPES_WITH_BYTES_FIELDS`, `:99-109`). Alternatively add a dedicated `/api/release-locked` route.
   - Add pytest coverage for all of it.
   - The proxy must report a release that fails at execute as **failed**. The Python SDK 2.5.0 fixed the false `success=True`; verify it.
2. **Executor** (`apps/studio/src/services/execution/node-executor.ts`):
   - Add switch cases (`:113-166`) and `mapBlockTypeToTxType` (`:1367-1388`).
   - GenerateHashLock runs client-side, with no Buffer.
   - WaitForLockedDeposit polls `/api/query-tx` and scans `produced`.
   - ReleaseLockedOperation goes through the generic route or the new route.
3. **Fix the latent SendTokens executor bug if it affects this flow.** It reads only `config.from` and ignores `config.principal` (`node-executor.ts:569-574`), but the Token Transfer flow uses `principal`. Add a regression test.
4. **Amounts:** make the in-Studio `LOCK_AMOUNT` produce the same base-unit amount as the generated code. Respect the AGENTS.md rule: ACME is scaled ×1e8 once, in the engine. Add a test in `node-executor.amount.test.ts`.
5. **Live run:**
   1. `npm run dev:all`.
   2. Load the template from the gallery.
   3. Execute it on Kermit.
   4. Capture the txids and a screenshot or GIF into `docs/hash-lock-example/evidence/`.
   5. Check that the thumbnail, the config modal for each new block, keyboard placement and the onboarding tour all still work.

**Gate P6:** the proxy pytest is green, the Studio suites are green, and a full in-browser HTLC run on Kermit succeeded, with the deposit's `result.releaseTxID` set.

---

## Phase P7: Live end-to-end proof of the generated code (the release criterion)

For **each of the 5 languages**:
1. **Published-SDK run (release criterion).**
   - Export the `hash-lock` template's generated project from Studio: studio-headless, or the same path the UI download uses, including the scaffold dependency file.
   - Put it in a fresh directory `C:\tmp\htlc-e2e-<lang>-published\`.
   - Install dependencies **from the public registry** and run it against Kermit.
2. **Local-SDK run.** Run the same program in `C:\tmp\<lang>-template-test`, which is path-linked to the local SDK.
3. **Repeat.** **3 consecutive successful published-SDK runs** per language, because of network flakiness. One retry per failed run is allowed; a failure is investigated and fixed, never retried away.
4. **Independent verification of each run.** Using a separate script, not the program's own output, query:
   - the send (`delivered`);
   - the deposit (`delivered`, `result.releaseTxID` equal to the release txid);
   - the release (`delivered`, `result.preimage` equal to the generated preimage);
   - the receiver balance (+`LOCK_AMOUNT`).

   Record everything in `docs/hash-lock-example/evidence/e2e-<lang>.json`.
5. **Negative check.** Generate a variant with a wrong preimage (test-only; do not ship it as a template). The program must **exit non-zero** and print the node's error.
6. **Action-palette e2e for the new blocks:** `cd packages/codegen; RUN_E2E=1 npx vitest run action-palette-e2e -t "<Lang>"`. Budget: `KERMIT_TIMEOUT` is 15 minutes per test.
7. **TypeScript:** the JS output also runs as TypeScript (`tsc --noEmit` plus a run) if Studio offers TS as a target.

**Gate P7:**
- 5 languages × 3 published-SDK runs, plus local-SDK runs, plus 5 negative checks, all as expected.
- An independent verification JSON exists for every run.
- **This is the "perfectly executes" bar. Nothing ships without it.**

Faucet etiquette: use at most `times: 3` per run, and pause if the faucet rate-limits.

---

## Phase P8: MCP, agent artifacts and documentation

1. **Generator count guards** (template count 8 → 9):
   - `scripts/generate-mcp-content.mjs:291-296`. Make the guard derive the count instead of hard-coding it, or set it to 9 with a comment.
   - `apps/mcp-server/test/protocol.test.mjs:284-292` (the prompt count and id list).
   - `apps/mcp-server/AGENTS.md` ("8 golden-path prompts").
   - `docs/ai-agent-readiness/MCP.md:32`.
   - Search the repo for other hard-coded `8` template or prompt counts: `grep -rn "8 golden\|!== 8\|length, 8\|toBe(8)"`.
   - **Do not** change `tools/agent-harness` counts; the harness stays at 8 canonical tasks (D-4).
2. **MCP hand-edited files:**
   - `src/prompts/index.ts:45,62-64`
   - `src/tools/transaction.ts`: `validTypes` (`:109-126`) gets `releaseLockedOperation`; also `validatePayload` (`:842-878`) and `getBaseCredits` (`:883-900`).
   - Add optional `hashLock` header support to `tx.build` and submit (`:192-226`, `:589-593`), so an agent can express the lock. Add protocol tests.
   - Help text: `src/index.ts:355-356`.
3. **Agent artifacts generator** (`scripts/generate-agent-artifacts.mjs`):
   - Add an HTLC section to `renderLlmsFull` (`:406+`) and llms/AGENTS, driven by the manifests.
   - **Why it's urgent:** today each SDK's `llms-full.txt` has hand-written HTLC text (e.g. `opendlt-python-v2v3-sdk/unified/llms-full.txt:155-163`) that the next `gen:agent:dist` silently deletes.
   - The generated section must **correct the refund wording**: "refund on expiry is the protocol design but is not currently functional; see the issue".
   - Run `npm run gen:agent && npm run gen:mcp` and commit the output.
   - **`gen:agent:dist` needs a human**; leave it for the release checkpoint.
4. **Docs:**
   - Add the example to Studio's user-facing docs and README template list.
   - Add an entry to the `docs/ai-agent-readiness/PROGRESS.md` style log if one is maintained.
   - Add a short `docs/hash-lock-example/README.md` explaining the example, the limits (no refund, no HASH160, SDK-only in the CLI), and the evidence.

**Gate P8:** `build:mcp && test:mcp` is green, `gen:agent` and `gen:mcp` produce no drift after a re-run, and `validate:canonical` is green.

---

## Phase P9: Release readiness

1. Run the full gate suite from P0.3 plus `verify:codegen`, then `npm run build` (all workspaces). Everything must be green, and the counts must be **≥ baseline**.
2. **Diff review:**
   - No hand edits to generated directories (`docs/ai-agent-readiness/generated/**`, `apps/mcp-server/src/generated/**`).
   - No stray debug output. No `Buffer` in Studio browser code.
   - No secrets or keys in evidence files; redact private keys.
3. Run `/code-review` (high) on the branch diff. Fix confirmed findings and re-run the gates.
4. **Commits:** one logical commit per phase on `feat/htlc-golden-path`, each a single-line message in the repo's style, with **no attribution trailers** (repo convention).
5. Write `docs/hash-lock-example/RELEASE-READINESS.md` with:
   - the gate results;
   - an evidence index of every txid per language;
   - the published SDK versions it was tested against;
   - known limits;
   - SDK branch fixes awaiting publish;
   - the core issue awaiting filing;
   - the human checkpoints below.
6. **Human checkpoints, never done unattended:**
   - pushing the branch or opening a PR;
   - any SDK publish;
   - `gen:agent:dist` (writes into the five SDK repos);
   - filing the core issue;
   - deploying Studio;
   - anything on mainnet.

**Definition of done:**
- P0–P9 gates are all green and recorded in STATUS.md with evidence.
- The `hash-lock` template generates code that ran successfully against the published SDKs in all 5 languages, 3 times each, with independent on-chain verification.
- The in-Studio live run succeeded.
- MCP, agent artifacts and docs are accurate, including the refund caveat.
- RELEASE-READINESS.md is written.

---

## Appendix A: Protocol reference

Source: accumulate-core.

**Wire format**

| Structure | Fields |
|---|---|
| `TransactionHeader` | field 8 `hashLock` (`HashLockOptions`). Fields 1–7: principal, initiator, memo, metadata, expire, holdUntil, authorities. |
| `HashLockOptions` | 1 `hashAlgorithm` (enum), 2 `hash` (bytes), 3 `expiration` (zig-zag varint of UTC Unix seconds; sub-seconds dropped) |
| `ReleaseLockedOperation` (0x18) | 1 type, 2 `lockedTxID` (TxID string), 3 `preimage` (bytes) |
| `SyntheticLockedDeposit` (0x37) | 1 type, 2 `SyntheticOrigin`, 3 token, 4 amount, 5 sender, 6 hashAlgorithm, 7 hash, 8 expiration, 9 isIssuer |
| Results (union, field 1 is the type) | `ReleaseLockedOperationResult{2 preimage, 3 hashAlgorithm, 4 hash, 5 amount, 6 token}`; `SyntheticLockedDepositResult{2 releaseTxID?}` |

**Golden vector.** `tx_sendtokens_hashlock` hash `c8bed4fc4014c14fccc02a4e2c14a29cbf24ef9ca4696b1eb0857bb454c624e0`. Header field 8 bytes: `082a 0101 0220<32B> 03cad4ea8d0e`. The vectors live in each SDK's test fixtures (1.4.6.7, from Go `e1d1db9`).

**Errors**

- **SendTokens with hashLock, at Validate and Execute:**
  - "hashlock hash cannot be empty"
  - "hashlock hash must be 32 bytes for %v, got %d"
  - "hashlock hash must be 20 bytes for HASH160, got %d"
  - "unsupported hashlock algorithm: %v"
  - "hashlock expiration is required"
  - "hashlock expiration must be at least 10 minutes in the future"
  - "hashlock expiration cannot exceed 30 days"
- **Release, at Validate:**
  - "locked transaction ID is required"
  - "preimage is required"
  - "preimage too large (max 256 bytes)"
- **Release, at Execute:**

  | Error | Status |
  |---|---|
  | "locked transaction not found" | notFound |
  | "locked deposit has already been released" | badRequest |
  | "referenced transaction is not a locked deposit" | badRequest |
  | "release must be signed by locked deposit recipient" | unauthorized |
  | "preimage does not match hash" | unauthenticated |
  | "locked deposit has expired" | expired; compared against block time |

  Execute can also fail on: "invalid principal: want token account", "token type mismatch", "unable to add deposit balance to account".
- **Deposit failures** (token mismatch, a missing ADI account) **refund immediately** via `DidFail`. This is the one refund path that works.

**Waiting pattern**
1. Poll the send until it is `delivered` and `produced` is non-empty.
2. Poll each produced id until one is a delivered `syntheticLockedDeposit`. Treat NotFound as not ready.
3. Submit the release.
4. Poll the release until it is `delivered` (`result.type == releaseLockedOperation`) or failed (`error.message`).

The release needs no synthetic transaction, so it settles in one step.

**Other gotchas**
- A multi-recipient send creates one deposit per recipient, all sharing one hash. One preimage unlocks them all.
- Any token works, not only ACME.
- `isIssuer` is always false.
- The release reveals the preimage publicly, which is how cross-chain swaps learn it.
- Expiration must be whole seconds in UTC. Never send fractional seconds in JSON, or the transaction hash can mismatch.

**Devnet** (optional):
```
accumulated run devnet -w C:\tmp\htlc-devnet --port 27656 -b 1 -v 1 -f 0 --name HTLCTest
```
Then `DEVNET_API=http://127.0.0.1:27660/v2 go run ./test/cmd/htlc-devnet/...` from accumulate-core.

---

## Appendix B: Per-SDK HTLC API

Verify each API against the P1 reference programs; the `produced` and deposit shapes come from the P0 evidence. All five sign locally. Python, Dart, Rust and C# submit through V3. JS submits through V2 `execute-direct` first and falls back to V3.

| | Python 2.5.0 | JS 2.5.2 | Dart 2.5.0 | Rust 2.5.0 | C# 2.5.0 |
|---|---|---|---|---|---|
| Lock type | `accumulate_client.tx.header.HashLockOptions(hash_algorithm="sha256", hash=bytes, expiration=datetime)` (`tx/header.py:200`), or the dict `{"hashAlgorithm","hash":hex,"expiration":unix_s}` | `TxBody.hashLock(core.HashAlgorithm.SHA256, hash, expDate)` (`tx_body.ts:324`) | `HashLockOptions(hashAlgorithm: HashAlgorithm.SHA256, hash: Uint8List, expiration: DateTime)` (`build/context.dart:40`) | `TxBody::hash_lock(HashAlgorithm::Sha256, Vec<u8>, exp_unix_secs_i64)` (`helpers.rs:348`); enum at `accumulate_client::generated::enums::HashAlgorithm` | `TxBody.HashLock("sha256", hashHexLower, DateTimeOffset)` (`TxBody.cs:397`), placed in `new HeaderOptions{HashLock=…}` |
| Validate | `lock.validate_for_submit()` | `helpers.validateHashLockForSubmit(lock)` | `lock.validateForSubmit()` | `lock.validate_for_submit(now_unix)?` | typed `new HashLockOptions{…}.ValidateForSubmit()`; the dict path has none |
| Locked send | `signer.sign_submit_and_wait(principal, body, hash_lock=lock)` (`convenience.py:1403`) | `signer.signSubmitAndWait(p, body, { hashLock: lock })` (`smart_signer.ts:342`) | `signer.signSubmitAndWait(principal:, body:, hashLock: lock)` (`smart_signer.dart:389`) | `signer.sign_submit_and_wait_with_options(p, &body, &HeaderOptions{hash_lock: Some(lock), ..Default::default()}, 30).await` (`helpers.rs:1053`). Plain `sign_submit_and_wait` **cannot** carry a lock. | `signer.SignSubmitAndWaitAsync(p, body, headerOptions: opts)` (`SmartSigner.cs:349`) |
| Release body | `TxBody.release_locked_operation(locked_txid, preimage_bytes_or_hex)` (`convenience.py:941`) | `TxBody.releaseLockedOperation(lockedTxId, preimage)` (`tx_body.ts:339`) | `TxBody.releaseLockedOperation(lockedTxId:, preimage:)` (`builders.dart:449`) | `TxBody::release_locked_operation(&locked, &preimage)` (`helpers.rs:336`) | `TxBody.ReleaseLockedOperation(lockedTxId, preimageHex)` (`TxBody.cs:380`) |
| Raw v3 query | `client.v3.query(txid)` | `client.queryTx(txid)` (V2, `.produced`) or the V3 client | `acc.v3.rawCall('query', {'scope': id})` | `client.v3_client.call_v3::<Value>("query", json!({"scope": id}))` | `client.QueryTransactionAsync(id)`; `SmartSigner.InterpretTransactionStatus` |
| Hash | `hashlib.sha256` | node `crypto.createHash('sha256')` | `package:crypto` `sha256` | `accumulate_client::sha256` | `SHA256.HashData` |
| Random preimage | `os.urandom(32)` | `crypto.randomBytes(32)` | `Random.secure()` | `rand::random::<[u8;32]>()` | `RandomNumberGenerator.GetBytes(32)` |

**Locked-deposit discovery** (identical in every language):
1. Query the send txid and iterate `produced.records[].value`.
2. Query each id and pick the first whose `message.transaction.body.type == "syntheticLockedDeposit"` and `status == "delivered"`.
3. Retry up to `maxAttempts` with `delayMs` between tries.

The JS V2 `queryTx` path returns `produced` as an array of txid strings. Pick whichever shape P0 evidence shows works, and be consistent.

---

## Appendix C: Known SDK defects and test commands

### Defects

| ID | SDK | Defect | Template workaround |
|---|---|---|---|
| PY-1 | Python | `accumulate_client.HashLockOptions` (top level) resolves to the wrong class (`types.py:379`): no validator, int algorithm defaulting to 0, and hex is not decoded. | Import from `accumulate_client.tx.header`, or pass the dict form. |
| PY-2 | Python | An int `expiration` means Unix **seconds**. | Never pass milliseconds. |
| PY-3 | Python | Emits `"sha256d"` where Go emits `"sha256D"`. Harmless to the hash. | Use `sha256` in v1. |
| JS-1 | JS | `Buffer.from(hex)` silently truncates invalid hex. | Validate hex length before use; call `validateHashLockForSubmit`. |
| JS-2 | JS | The V3 fallback in `pollForDelivery` cannot detect delivery. | Verify the result independently with a raw query. |
| JS-3 | JS | `HashAlgorithm` and `validateHashLockForSubmit` are only reachable via `core.` and `helpers.` (or subpaths). | Import accordingly. |
| JS-4 | JS | 2.5.0 is deprecated (broken ESM import). | Pin ≥2.5.1. |
| DART-1 | Dart | `signSubmitAndWait` treats any string status other than `"delivered"` as pending, so a failed release becomes a timeout. | After the wait, raw-query the txid and report `status`/`error`. |
| DART-2 | Dart | The legacy header models emit PascalCase `HashLock`, which the encoder ignores. | Use only `SmartSigner(hashLock:)`. |
| RUST-1 | Rust | Same status masking as DART-1; `wait_for_tx` is broken for V3 string status. | Raw-query after the wait. |
| RUST-2 | Rust | `HashAlgorithm` is not re-exported at the crate root; expiration is `i64` seconds. | Use the full path. |
| RUST-3 | Rust | `generated/header.rs` was hand-edited, and regenerating drops HTLC. | SDK-side note only. |
| CS-1 | C# | `TxBody.HashLock` (dict) does no validation; `expiration` is optional and defaults to null. | Always pass an expiration; validate with the typed `HashLockOptions` first. |
| CS-2 | C# | The preimage is a hex string; the enum is named `HashLockAlgorithm`. | Lowercase hex via `Convert.ToHexString(x).ToLowerInvariant()`. |
| ALL | All | No helper for the preimage, deposit discovery, lock state or refund. | Templates implement deposit discovery inline. |

### Offline HTLC test commands (record counts)

| SDK | Command | Last known result |
|---|---|---|
| Python | `cd C:\Accumulate_Stuff\opendlt-python-v2v3-sdk\unified && <venv>\Scripts\python -m pip install -e .[dev] && <venv>\Scripts\python -m pytest tests/test_htlc_golden_vectors.py -q` | not yet run (deps missing) |
| JS | `cd C:\Accumulate_Stuff\opendlt-javascript-v2v3-sdk\javascript && npx jest --config=test/jest.config.cjs test/htlc-api.test.ts test/golden-vectors.test.ts` | 62/62 |
| Dart | `cd C:\Accumulate_Stuff\opendlt-dart-v2v3-sdk\unified && dart test test/unit/htlc test/conformance/codec/golden_vectors_1_4_6_7_test.dart` | 26/26 |
| Rust | `cd C:\Accumulate_Stuff\opendlt-rust-v2v3-sdk\unified && cargo test --test golden_vectors_1_4_6_7` | 10/10 |
| C# | `cd C:\Accumulate_Stuff\opendlt-c-sharp-v2v3-sdk && dotnet test --filter FullyQualifiedName~GoldenVector` | 47/47 |

---

## Appendix D: Files expected to change

All under `accumulate-studio` unless noted.

- **`packages/types/src`:** `blocks.ts`, `block-op-map.ts`, `prerequisites.ts`, `flow.ts` (only if a new AssertionType is added).
- **`packages/codegen/src`:**
  - `manifest-generator.ts`, `template-loader.ts`, `project-scaffolds.ts`
  - `templates/{5 langs}/{send_tokens,generate_hash_lock,wait_for_locked_deposit,release_locked}.hbs`
  - `_preamble.hbs` (×5)
  - `manifests/*.sdk-manifest.json` (×5)
- **`packages/codegen/tests`:** `*-validation.test.ts`, `validate_*` mock routers, `action-palette-*.test.ts`, `project-scaffolds-unified.test.ts`, `__snapshots__`, `csharp-harness/CSharpHarness.csproj`.
- **`apps/studio/src`:** `data/flow-templates.ts` (and its test), `components/flow-builder/BlockNode.tsx`, `components/palette/BlockItem.tsx`, `ExecuteConfirmModal.tsx`, `services/{flow-serializer,assertions-generator,agent-files}.ts`, `services/execution/node-executor.ts` (and its tests).
- **`templates/`:** `hash-lock.yaml`, `index.ts`.
- **`apps/sdk-proxy`:** `app/models.py`, `app/routes/tokens.py`, `app/routes/generic.py`, `pyproject.toml`, `requirements.txt`, `tests/*`.
- **`apps/mcp-server`:** `src/{index.ts,prompts/index.ts,tools/transaction.ts}`, `test/protocol.test.mjs`, `AGENTS.md`. `src/generated/**` is regenerated only.
- **`scripts/`:** `generate-mcp-content.mjs`, `generate-agent-artifacts.mjs`, `check-canonical-coverage.ts`.
- **`docs/`:** `ai-agent-readiness/MCP.md`, `docs/ai-agent-readiness/generated/**` (regenerated only), `docs/hash-lock-example/**`.
- **Outside the repo (scratch, never committed):** `C:\tmp\htlc-probe-*`, `C:\tmp\htlc-e2e-*`, `C:\tmp\*-template-test`.
