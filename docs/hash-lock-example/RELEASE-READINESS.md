# Hash Lock (HTLC) Payment: release readiness

Branch `feat/htlc-golden-path`. Code frozen at `cf17206`; every gate below ran on that tree. Written for the human who decides what to push, publish and file. The plan is [`RUNBOOK.md`](RUNBOOK.md), the working record is [`STATUS.md`](STATUS.md), the requirement-by-requirement proof is [`AUDIT.md`](AUDIT.md), the example itself is described in [`README.md`](README.md).

## 1. Verdict

The 9th golden path, **Hash Lock (HTLC) Payment**, works end to end in Python, JavaScript, Dart, Rust and C# against the five **published** SDKs on Kermit, in Studio through the sdk-proxy, and through the MCP tools, and every claim has an independent on-chain verification. The release bar that was run is **2 consecutive published runs per language** (decision D-03, kept by the user's answer D-30; the original bar of 3 was not restored). Nothing in this branch publishes, deploys, files or targets mainnet: those are the human checkpoints in section 11.

## 2. Gate results (final run, `evidence/p9b/`)

Venv first on PATH, `REQUIRE_TOOLCHAINS=1`. Every step exited 0. Every count is at or above its P0 baseline and its P7 value.

| Gate | Result | Baseline / P7 |
|---|---|---|
| `npm run typecheck` | exit 0 (now builds the libraries first, D-34) | exit 0 |
| `npm test` | exit 0, **1,453 passed**, 135 skipped (live-gated): mcp 39 · studio 741 · agent-pack 51 · codegen 605 · verification 17 | 1,195 / 1,399 |
| `npm run validate:manifests` | exit 0, 28/28 blocks in each of the 5 manifests (5 manifests reported) | 25/25 |
| `npm run validate:canonical` | exit 0 | exit 0 |
| `npm run harness:test` | exit 0, 74/74 | 74 |
| `npm run verify:codegen` | exit 0, 45/45 clean | 40 (45 with hash-lock) |
| `npm run build:mcp` + `npm run test:mcp` | exit 0, 39/39 | 26 / 27 |
| `npm run lint` | exit 0, 0 errors / 95 warnings | 0 / 95 (ceiling) |
| proxy `pytest` | 65 passed | 43 / 65 |
| `npm run build` (ALL workspaces) | exit 0 | not run before this branch |
| `gen:agent` + `gen:mcp` re-run | no drift (sha256 of every generated file identical before and after) | |
| Snapshots | 30 of the 40 pre-existing identical to the branch base; the other 10 changed ON PURPOSE (random ADI-name default, D-31), reviewed line by line; 5 added (hash-lock x 5) | 40 |

Earlier gate runs: `evidence/p8/`, `evidence/p9/` (first P9 run, 1,442 passed), and per-phase counts in STATUS.md. The count of 1,399 was P6/P7.

## 3. What ran live

Per language, all on Kermit (core 1.4.6.7), every run verified by `evidence/p6/verify_htlc.py` (stdlib only, queries the chain itself, trusts nothing the program printed):

| | published run 1 | published run 2 | `sha256d` lock | wrong preimage (must fail) | local SDK |
|---|---|---|---|---|---|
| Python | PASS 16/16 | PASS 16/16 | PASS | PASS 9/9 (exit 1, node error) | PASS |
| JavaScript | PASS | PASS | PASS | PASS | PASS |
| Dart | PASS | PASS | PASS | PASS | PASS |
| Rust | PASS | PASS | PASS | PASS | PASS |
| C# | PASS | PASS | PASS | PASS | PASS |

Also: the template run from the Studio gallery in a real browser through the real proxy (17/17 nodes, 7/7 assertions, verifier 14/14, `evidence/p6/`), and the action-palette e2e for the 3 new blocks x 5 languages (15/15 live). Programs run 62-240 s. Invalid attempts are kept as evidence beside the counted ones (`*-invalid-collision`, `*-shared-target-dir`); none was retried away unexamined (STATUS D-26).

**What was not re-run live.** The default ADI name changed after these runs (D-31: `adi-<unix seconds>` became `adi-<unix seconds>-<6 random hex>` in all five languages). It is covered by the five `*-validation` suites (the generated programs run against the faithful node mock with the new name), by 20 new tests that execute the generated name expression in JavaScript and Python and compile-and-run it in Rust, Dart and C#, and by the unchanged ADI naming rules (lowercase letters, digits, hyphen). No live run exercised the suffixed name; one live run per language is the recommended confirmation (section 11).

## 4. Published SDK versions tested

| Language | Registry package | Version |
|---|---|---|
| Python | PyPI `accumulate-sdk-opendlt` | 2.5.0 |
| JavaScript | npm `accumulate-sdk-opendlt` | 2.5.2 |
| Dart | pub.dev `opendlt_accumulate` | 2.5.0 |
| Rust | crates.io `accumulate-sdk` | 2.5.0 |
| C# | NuGet `Acme.Net.Sdk` | 2.5.0 |

The published-run logs (`evidence/e2e/logs/<lang>-published-<n>.log`) show these registry versions and no local path; the local-SDK logs show the path link.

## 5. Evidence index

Every counted live run, with the send, the locked deposit and the release txids (`evidence/e2e/<lang>-<run>.json` holds the verifier output and the raw chain queries; `evidence/e2e/INDEX.md` has the same runs with timings):

| lang | run | verdict | checks | send txid | locked deposit txid | release txid |
|---|---|---|---|---|---|---|
| python | published-1 | PASS | 16/16 | `acc://f5285c8034f96a8732ed357e6da4626a568de5842aaa88be15e6abbe6dceabf9@adi-1792188099.acme/htlc-sender` | `acc://042ac683868e79b807da945294444205b3a7456f137107ff4a2d9771e818b87c@adi-1792188099.acme/htlc-receiver` | `acc://30e755870e3bbae40803d0e13574ce7c5448fec900762b3df719f66753e93928@adi-1792188099.acme/htlc-receiver` |
| python | published-2 | PASS | 16/16 | `acc://2a0e6367112a8641779abfe5c919f9ef321980b8506e28f24e843f285f08914d@adi-1792188593.acme/htlc-sender` | `acc://1ca731c07339c849be5a0250ce35517de58b43461628ba4f46237e6df64312fe@adi-1792188593.acme/htlc-receiver` | `acc://ca04070fda53d6da1a5d80ed87a35382b50a7473dd5038ee6dedba247be89add@adi-1792188593.acme/htlc-receiver` |
| python | sha256d-1 | PASS | 16/16 | `acc://8d540d94e82ebb6bd6024bf4d30695a9e728ac4fe76d235b9b39c79358aac4b9@adi-1792188589.acme/htlc-sender` | `acc://bade20ea9d4b9dc67d9ac047858e495d856fc2e40edd7f9bfc8a637302669e04@adi-1792188589.acme/htlc-receiver` | `acc://63d3676699811c2de010c4e1d8dd8c7c8d17de5d4640d9d6c4270dfa225942b7@adi-1792188589.acme/htlc-receiver` |
| python | local-1 | PASS | 16/16 | `acc://1f3ccc8d24e6e2cc55c864ad3676577b0f8fa6110ce687865e889693d0fa4d85@adi-1792188991.acme/htlc-sender` | `acc://bc8de2cd8fad71eab29339259f9923652b6de0ad8f16195981686baad11201bb@adi-1792188991.acme/htlc-receiver` | `acc://fd743da21356b73a2f262b04ce7735fe7dd218370293865b9ae25c2c968be95d@adi-1792188991.acme/htlc-receiver` |
| python | wrong-1 | PASS | 9/9 | `acc://fecab582f92a4f7e2623fe42fd52a27837b949ee3bac1e0e737bd826f1357fe5@adi-1792188988.acme/htlc-sender` | `acc://cf4c87650949128a8671115027a730a9946ace2d14f47f00b0ce950ef44da195@adi-1792188988.acme/htlc-receiver` | (rejected by the node) |
| javascript | published-1 | PASS | 16/16 | `acc://ce16b3f63e0e9fe8f1312bab4546f9db48497f16780b3c25ce74dd70a3970109@adi-1792188300.acme/htlc-sender` | `acc://55a5169fddff8c32aeedeafe436884cd4e1ca03c03833794b560d9f56f1aa95f@adi-1792188300.acme/htlc-receiver` | `acc://3854b2ac33ea2724eb2b56ef76c64ba53769663eea53d5455532c59716443f72@adi-1792188300.acme/htlc-receiver` |
| javascript | published-2 | PASS | 16/16 | `acc://6d72904f3b23d833ffe3ceedbc599c867dc6c50d564ec626857fc237940a9a65@adi-1792188407.acme/htlc-sender` | `acc://7ceb58e5db54b9eb734f6e4ba3000d2a6b801650c1a02df7bfff12c965fbe085@adi-1792188407.acme/htlc-receiver` | `acc://ff687388b81ee815850e8fb791ef1f681b0953d5631864a82bb4c37a133783d9@adi-1792188407.acme/htlc-receiver` |
| javascript | sha256d-1 | PASS | 16/16 | `acc://b75a70aedd7da268914666acadb0b279fe9e7624bf55d31ee3b6a6fc93951cc4@adi-1792188944.acme/htlc-sender` | `acc://7886abf2a26bcb33ddf0ad81652529764204ac693531c654ba1dc0077d9e8c27@adi-1792188944.acme/htlc-receiver` | `acc://79345e33fe7a9e3d07fa2f0b5cbf3a2fef0d455fe94dd560a588091479392265@adi-1792188944.acme/htlc-receiver` |
| javascript | local-1 | PASS | 16/16 | `acc://a9856811b5bf827363d82f0d91540c6df51ec7e8c7dcd5ff4c104f876562a3a4@adi-1792188716.acme/htlc-sender` | `acc://76cbe80f1a65ccd6710d2b7228b73ae230158d439acbd790b4765625d8b168a6@adi-1792188716.acme/htlc-receiver` | `acc://7e3d36d04e154718862031bd198fed5816f3ac25ac7a1508ffa032c349a9022f@adi-1792188716.acme/htlc-receiver` |
| javascript | wrong-1 | PASS | 9/9 | `acc://402c1cf8a1dc59ec3ed2ed43c5e5826bbf29b91eefb5cee8f4d299bbcda5f19f@adi-1792188408.acme/htlc-sender` | `acc://15b4ee451df4e8c79157055f65c0a08b0c5eb4e48f294ead797b1a597d3a1b7b@adi-1792188408.acme/htlc-receiver` | (rejected by the node) |
| dart | published-1 | PASS | 16/16 | `acc://05deb8d7a5be2c27058d8536143066815f131e0c66f7692a8435c33f7762e156@adi-1792188235.acme/htlc-sender` | `acc://a3cf9ee5e7e2288604c759e76ccce94ad95bf15bad2b5ddea07bb81b678f2438@adi-1792188235.acme/htlc-receiver` | `acc://9922e4557ec11ed6407044a861fd5c566a47de566e9e24228e94779585e3b8f1@adi-1792188235.acme/htlc-receiver` |
| dart | published-2 | PASS | 16/16 | `acc://e4a734ef7a5658d58efd2b678f9299663f72880257602013bf7b923d08ccc458@adi-1792188851.acme/htlc-sender` | `acc://2a71eabac2f6848190fd6e2e36ad56bdccbcc11f8934676b119d651bc8d710b7@adi-1792188851.acme/htlc-receiver` | `acc://5837af5a56a344576899262de855a783a306460ea54c7be20177ce201ef06f5b@adi-1792188851.acme/htlc-receiver` |
| dart | sha256d-1 | PASS | 16/16 | `acc://83ac36ee12b9116a2b0d3b718e000ed59a638055d9c3d882b6a7c9f68b86f3c5@adi-1792188537.acme/htlc-sender` | `acc://3b45e3bfb949e38fab90efdd073fb2fe102dc8951a3f369c1624f5344f869113@adi-1792188537.acme/htlc-receiver` | `acc://fe9fa2ba3f42c404ada19110f8b08ca225fc6469940f5620925045045293487c@adi-1792188537.acme/htlc-receiver` |
| dart | local-1 | PASS | 16/16 | `acc://8cdd31f5dea73fa22a57d6e6e3db354735760ecd6f49bc024e1d2bed22f1f2af@adi-1792188734.acme/htlc-sender` | `acc://d229fdfb53f59baba2d26df8652a38b5ad079d99ddb1a7ffd1f8630718d949c3@adi-1792188734.acme/htlc-receiver` | `acc://f95ffe83e6fa4b3a7c54eb0fec264006f7082f2b82f8f1445ffd01c2c165f911@adi-1792188734.acme/htlc-receiver` |
| dart | wrong-1 | PASS | 9/9 | `acc://22ae001b8af36f641882020fcbcc7a91d933ba539bfa7297436a489bc595e389@adi-1792188810.acme/htlc-sender` | `acc://1d1bc94b526e4afecc3e7d53c3f66cc276b2c3febd1b07766ad62e9c222f97b2@adi-1792188810.acme/htlc-receiver` | (rejected by the node) |
| rust | published-1 | PASS | 16/16 | `acc://3daa9e35ed3e3d1ab1bffd2c2c002944e1de03c34673522be6d66a8191543606@adi-1792188334.acme/htlc-sender` | `acc://61b6a9910a7efcb5ed4d998afda02447283f6d7882e6446cb9d274d509f036f2@adi-1792188334.acme/htlc-receiver` | `acc://aedc66c4a3d7b1abb1b8a4e3526d944eaefe557515b7338fc8ae4f394c3bad88@adi-1792188334.acme/htlc-receiver` |
| rust | published-2 | PASS | 16/16 | `acc://9b1c08a8b84cef8226c3acc0e5116499e0509135e99635fb1b790a74be55150a@adi-1792189189.acme/htlc-sender` | `acc://696991b0f6d5aed363bfb042541bc2209550cf0b7890384fee6c759069acd263@adi-1792189189.acme/htlc-receiver` | `acc://54b0c1ec32084547b4bf6975e33ecd67d794e8fc0802bd4fabe6ae3fa78663b7@adi-1792189189.acme/htlc-receiver` |
| rust | sha256d-1 | PASS | 16/16 | `acc://188af1f8a644a08d34c15b3a2d122a18856c549d3a922f0f7145cf90a1a909a7@adi-1792189027.acme/htlc-sender` | `acc://e3a61691c78cd78441e83ae68411630cb44df8054b3e775c81dbd08981a3431f@adi-1792189027.acme/htlc-receiver` | `acc://a8d042a57327257918e9e21d11d7173e6417de39f121ac34bbfab16ae2acfa8d@adi-1792189027.acme/htlc-receiver` |
| rust | local-1 | PASS | 16/16 | `acc://93f3753d3164e937e065428b78ba4cffa8e09175cc2cf9fc2df5090da9ed1853@adi-1792189006.acme/htlc-sender` | `acc://61997acb18a4281e5b1d39466d4ee23687cdc70bc3fac7236cc25ec55023ef6a@adi-1792189006.acme/htlc-receiver` | `acc://46f8a5763d3a5d702dadd05a3a9d79a44093c364c1a76792ce0362c18aff7fa2@adi-1792189006.acme/htlc-receiver` |
| rust | wrong-1 | PASS | 9/9 | `acc://908ecb7425cd3beca498eeb06ad9c53b5edeaf3d8a356c2efefac460a2b722e3@adi-1792188968.acme/htlc-sender` | `acc://cf56191399039326cfdd1e72ea0b14502f7a1788821dfc480db63dfdde7b0265@adi-1792188968.acme/htlc-receiver` | (rejected by the node) |
| csharp | published-1 | PASS | 16/16 | `acc://dfab76bcce01a8776f06646616eea470e3eef72d6f16c3a6be5cd76211c89672@adi-1792188202.acme/htlc-sender` | `acc://40d3a7990228e292001700354006e6c0c373f83d15247467812ff138c6bae940@adi-1792188202.acme/htlc-receiver` | `acc://e627a6823a22792c2c5fc256b164b06c1f8586071ad387d7062a594d614ea4b9@adi-1792188202.acme/htlc-receiver` |
| csharp | published-2 | PASS | 16/16 | `acc://f1cdf69d8d425db3390a4b06f730ed55674ebfceda64ad24d104431cc0b9135d@adi-1792188287.acme/htlc-sender` | `acc://e1d18a5ed0db37311d037f960989352ca0772472cb13ea9e46443307ac964222@adi-1792188287.acme/htlc-receiver` | `acc://443f4dc07eb89bcec5c057a74609db43491c0babe74f0810ec354b503a1cdecc@adi-1792188287.acme/htlc-receiver` |
| csharp | sha256d-1 | PASS | 16/16 | `acc://520e094f91ce3ac53b6c41e6ddb4a5aa9336bc28024fd9d9303d4c750148654d@adi-1792188529.acme/htlc-sender` | `acc://c10111c5914bdb8733b4d02f0a80cfa558ed4a44461e7bd85152a06fd5b1b69c@adi-1792188529.acme/htlc-receiver` | `acc://e51c11c8ab69115f3f556cc5268ff574e1db1c60503d87bc79807ef2d11888e6@adi-1792188529.acme/htlc-receiver` |
| csharp | local-1 | PASS | 16/16 | `acc://731dc5cf69b0448dff715eb7de86a5c3fe012f97409324d3f20d4527ad49ec5d@adi-1792188353.acme/htlc-sender` | `acc://9243ce6f48d239d95e913771c096e6b5a384a35ad52bb23b20bb75e82a703078@adi-1792188353.acme/htlc-receiver` | `acc://23215fe83f40e2f2fc563782838f7f27d42d532478feae33e6e38c7a27480e28@adi-1792188353.acme/htlc-receiver` |
| csharp | wrong-1 | PASS | 9/9 | `acc://c62e3bfd61f6559da99a91c7410bfe65b0e158d03269757dff4fab0d9c080447@adi-1792188524.acme/htlc-sender` | `acc://0e4410e56f17b87db8488178a544430456cb7d688b0020f0c9ffad1d2a537114@adi-1792188524.acme/htlc-receiver` | (rejected by the node) |

Other live evidence:
- In-Studio run (P6 run 2, ADI `htlc-p6-1792185332`): `evidence/p6/verify-studio-run2.json` (PASS 14/14), `studio-run2-execution-log.txt`, screenshots 01-14. Run 1 was aborted by an edit of mine (a Vite hot reload discards a run in flight) and is recorded as such.
- Action-palette e2e, 15/15: `evidence/e2e/palette-e2e-new-blocks.log`.
- P0 ground-truth probe and its wrong-preimage negative (Python, published 2.5.0): `evidence/p0-probe.json`, `evidence/p0-send-requery.json`.
- P1 reference programs (one per language, published SDKs): txids abbreviated in STATUS.md, console logs outside the repo (`C:/tmp/htlc-logs/p11-*.log`); the P7 runs above supersede them.
- P2 live regression of the 8 existing golden paths' two most delicate templates (Token Transfer and Multi-Sig) from the registries, 10 runs: `evidence/p2/<template>-<lang>.verify.txt` (every txid delivered, 0 failing); the pre-fix failures are in `evidence/p2/before-fix/`.
- Offline SDK suites (P1.2, re-run in the audit): `evidence/audit/p1-2-sdk-offline-tests.txt`.

## 6. Clean-checkout proof

A fresh clone of the committed branch, `npm ci`, then the commands below (`evidence/p9/clean-checkout-final.txt`). The first attempt (clone of 70b4c58) FAILED: root `npm run build` built `apps/*` before the `packages/*` they import, and `npm run typecheck` right after `build:types` (the order CI uses) failed the same way. Both were pre-existing on `main`, hidden by stale `dist/` folders in a working tree. Fixed in the root `package.json` (D-34): `build:libs` builds types, verification, codegen and agent-pack in dependency order, and `build` and `typecheck` call it first.

```
fresh clone of feat/htlc-golden-path at cf17206 (clone exit=0)
A. npm ci; npm run build:types; npm run build; npm run typecheck
  A-npm-ci exit=0
  A-build-types exit=0
  A-build exit=0
  A-typecheck exit=0
B. CI order from a clean tree: npm run build:types; npm run typecheck; npm run build
  B-build-types exit=0
  B-typecheck exit=0
  B-build exit=0
C. bare npm run typecheck straight after npm ci (no build:types)
  C-typecheck exit=0
tracked files changed by building (git diff --stat, line count): 0
untracked files after the last build (outside ignored output): 0
ALLDONE
```

## 7. Code review

`/code-review` at high effort on `main...HEAD`: 10 findings, 8 fixed, 2 justified (`evidence/p9/code-review.md`). `/code-review ultra` (cloud, billed, user-triggered) was not run; you may run it.

## 8. Known limits

- **No refund.** The protocol design refunds an unreleased lock on expiry; core never executes it (`expireLockedDeposit` returns early on `Delivered`, which every executed locked deposit is). Funds in an unreleased lock are stranded. No Studio, MCP, generated-doc or template text promises a refund; the Studio flow always releases. Use small amounts. Write-up: `CORE-ISSUE-refund.md`.
- **No HASH160 in Studio.** Offered: `sha256`, `sha256d` (both proven live). HASH160 exists in the protocol and some SDK helpers.
- **HTLC is SDK-only in the CLI.** CLI mode refuses a flow with an HTLC block (an SDK-only comment and `exit 1`).
- A locked send in Studio takes one recipient; testnet only (Kermit); never mainnet.
- The lock expiration is fixed when `GenerateHashLock` runs and the node checks it at submit: keep the block right before the locked send (documented in the field help, the manifests and the generated docs).
- Existing generated programs (the 8 older golden paths) can still print SUCCESS for a failed step in Dart and Rust (signature-id txid, DART-3 / RUST-3 NEW) and C# wait helpers fail open: pre-existing, not on the HTLC path, listed in section 10.

## 9. SDK branch fixes awaiting publish

SDK branch fixes awaiting publish: none (D-04a); published-SDK defects are worked around in templates (Appendix C triage table in STATUS.md). No SDK repo was modified; the five were clean after every local-SDK run.

## 10. Follow-ups, classified

| # | Follow-up | Class | Why |
|---|---|---|---|
| 1 | ADI_NAME default collides within one second (D-26) | **fixed** (D-31) | random suffix in all languages |
| 2 | Acronym slug `hash_lock_h_t_l_c_payment` | **fixed** (D-32) | `hash_lock_htlc_payment` |
| 3 | Token Transfer `fund_sender` string amount = 500M ACME in Studio | **fixed** (D-33) | number, guarded by a test over every template |
| 4 | Root `build` / `typecheck` failed on a clean checkout | **fixed** (D-34) | found by the clean-checkout proof |
| 5 | `sdk-proxy/AGENTS.md` said `>=2.1.0`, `AGENTS.md` said 61 harness tests | **fixed** | factual lines only |
| 6 | `rust-validation` silently skipped compile and mock tests | **fixed** (D-14) | runs for real |
| 7 | `gen:agent:dist` drops two non-HTLC hand-written bullets per SDK (header fields 5-7, v3 proof methods) | **fix-now, before dist** | not carried by the manifests; move them in, then run dist (human) |
| 8 | Live confirmation of the suffixed ADI name (section 3) | **fix-now if you want it** | 5 runs, about 10 minutes, faucet <= 3 each |
| 9 | Studio template copy points at the refund issue by repo path, not URL | ship-as-known-limit | the issue is not filed; add the URL when it is |
| 10 | `FLOW_VAR_DEFAULTS_*` overrides an edited flow default (e.g. LOCK_AMOUNT) in generated code | ship-as-known-limit | the D-1 design, same for every variable; a fix converts decimals in every template |
| 11 | `apps/mcp-server` imports `@accumulate-studio/verification` without declaring it | ship-as-known-limit | resolves through the workspace; declaring it changes the lockfile |
| 12 | CI runs `typecheck` before `build`; now safe because `typecheck` builds the libraries | ship-as-known-limit | no CI edit was made |
| 13 | Existing Dart/Rust templates report SUCCESS from `result.success` and a signature id (DART-3, RUST-3 NEW); existing wait templates fail open in C# (CS-new-a); Dart scripts linger ~15 s (DART-4); the JS faucet template swallows a rejected faucet | ship-as-known-limit | pre-existing, outside the HTLC path, HTLC templates are immune; worth a separate fix |
| 14 | `executeCreateDataAccount` has the passthrough-ordering defect D-21 fixed for token accounts | ship-as-known-limit | pre-existing, not on the HTLC path |
| 15 | Post-run enrichment labels a SyntheticLockedDeposit `SyntheticDepositTokens`; WaitForBalance/WaitForCredits check only "non-zero" in Studio | ship-as-known-limit | display / precision only; the exact amount is proven by the verifier |
| 16 | `tx.validate_prereqs` and `tx.estimate_credits` know nothing of hash locks | ship-as-known-limit | the lock is validated at build and submit |
| 17 | C# SDK prints `Imported Ed25519 seed (32 bytes)` per key; Cargo/NuGet harness directories still describe local SDKs; tracked harness bins differ from the generator (B-4) | ship-as-known-limit | cosmetic / pre-existing |
| 18 | The faucet is called 3 times (30 ACME) though 15 are needed | ship-as-known-limit | RUNBOOK D-1 sets `times: 3` |
| 19 | Rust SDK `generated/header.rs` was hand-edited; regenerating would drop HTLC (RUST-3, Appendix C) | ship-as-known-limit | SDK owners |

## 11. Human checkpoints (in this order)

1. **Review and push.** The branch is ahead of `origin/feat/htlc-golden-path`; `origin/main` already holds it through PR #5 (merged by you). Pushing needs your approval; `gh` is not installed, open the PR at https://github.com/opendlt/accumulate_studio/compare/main...feat/htlc-golden-path?expand=1
2. **Optional: live confirmation of D-31** (follow-up 8): one published run per language with the saved drivers in `evidence/e2e/tools/`.
3. **Optional: `/code-review ultra`.**
4. **Move the two non-HTLC bullets into the manifests, then `npm run gen:agent:dist`** (writes into the five SDK repos' tracked docs: never run unattended). Until it runs, the SDK repos still say "otherwise the tokens are refunded to the sender".
5. **File the core issue** (`CORE-ISSUE-refund.md`), then put its URL in the Studio template copy.
6. **Deploy Studio** (Vercel; the build order matters, see the root `package.json`).
7. **SDK publishes:** none pending. **Mainnet:** never targeted; HTLC is not confirmed there.
