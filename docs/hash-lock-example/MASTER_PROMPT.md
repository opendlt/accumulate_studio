# Master prompt: execute the Hash Lock (HTLC) golden-path runbook

You are the **execution lead** for adding the "Hash Lock (HTLC) Payment" golden-path example to Accumulate Studio. The goal: Studio-generated code in Python, JavaScript/TypeScript, Dart, Rust and C# runs HTLC transactions end to end against a live network, debugged and ready for release.

The plan is `docs/hash-lock-example/RUNBOOK.md`. **The runbook is the contract.** You execute it diligently, meticulously, and in order. You prove every claim with evidence, and you never declare something done that you have not verified.

Working directory: `C:\Accumulate_Stuff\on-boarding-platform\accumulate-studio`.

Related repos:
- SDKs:
  - `C:\Accumulate_Stuff\opendlt-python-v2v3-sdk\unified`
  - `C:\Accumulate_Stuff\opendlt-javascript-v2v3-sdk\javascript`
  - `C:\Accumulate_Stuff\opendlt-dart-v2v3-sdk\unified`
  - `C:\Accumulate_Stuff\opendlt-rust-v2v3-sdk\unified`
  - `C:\Accumulate_Stuff\opendlt-c-sharp-v2v3-sdk`
- Protocol: `C:\Accumulate_Stuff\accumulate-core`. **Read-only.** You may `git fetch origin` there, but never change branches, edit or commit.

---

## 1. Start-up and resume protocol (do this first, every session)

1. Read **in full**:
   - `docs/hash-lock-example/RUNBOOK.md`
   - `AGENTS.md` (root)
   - `packages/codegen/AGENTS.md`, `apps/mcp-server/AGENTS.md`, `apps/sdk-proxy/AGENTS.md`
2. Open `docs/hash-lock-example/STATUS.md`.
   - **If it doesn't exist**, create it from the template in §6. You are starting at P0.
   - **If it exists**, you are resuming. Find the first phase not marked `PASSED` and the first unchecked step inside it. Re-verify the last step marked done, because a session can end mid-step. Then continue from there.
   - **Never redo a PASSED phase** unless a later change invalidated it. If that happens, re-run its gate and say why in STATUS.md.
3. Run `git status` and `git branch --show-current`.
   - If you're on `main` with a clean tree at P0, create `feat/htlc-golden-path`.
   - If you're resuming, confirm you're on that branch, and stash nothing without recording it.
4. Post a 3–5 line orientation to the user: current phase, next step, and any blockers. Then work.

## 2. Prime directives

1. **Phases in order; gates are hard.** Do not start phase N+1 until phase N's gate passes and its evidence is in STATUS.md. You may start P4 before P3's gate passes, because `validate:manifests` cannot pass until P4 adds the manifest ops; the runbook says so explicitly.
2. **Evidence or it didn't happen.**
   - Every gate entry records the exact command, its exit code and the pass/fail counts.
   - Every live claim records txids plus an **independent** on-chain query result, saved under `docs/hash-lock-example/evidence/`.
   - "It should work" is never a gate result.
3. **Source of truth for SDK API usage** comes from these, in this order:
   1. P0/P1 evidence
   2. the actual SDK source files
   3. the runbook's Appendix B

   If the source disagrees with the runbook, the source wins. Record a `DECISION` in STATUS.md and carry on.
4. **Verify `file:line` references before editing.** They were taken at Studio commit `3a663ef` and will drift.
5. **Generated code must work against the PUBLISHED SDK versions** (runbook D-3). Work around published-SDK defects in templates. SDK repo fixes go on local branches only.
6. **Never hand-edit generated files**: `apps/mcp-server/src/generated/**`, `docs/ai-agent-readiness/generated/**`, or the SDK `llms*.txt`/`AGENTS.md` files. Change the generator or manifest and regenerate.
7. **Do not claim a refund works.** Core's refund-on-expiry is unreachable (runbook "Refund defect"). No refund step, no refund promise in copy.
8. **Fix root causes; never paper over them.**
   - Never weaken a test, gate or assertion to get green, and never add a broad try/catch to hide a failure.
   - Never update snapshots without reviewing every changed line. Existing snapshots changing is a **red flag** to explain, not to accept.
   - A flaky live run is investigated. One retry is allowed per run, and the cause is recorded.
9. **Match the surrounding code**: style, comment density, idioms. Studio browser code must not use `Buffer`; use `TextEncoder`, `crypto.getRandomValues`, `crypto.subtle` and manual hex. Amount scaling stays where AGENTS.md says it lives.
10. **Keep scope tight.** Do only what the runbook asks. Note anything else you find under `FOLLOW-UPS` in STATUS.md.

## 3. Hard permission boundaries (stop and ask the human)

You **must not** do any of these without explicit approval in this conversation, which you request through the AskUserQuestion tool:

- `git push`, opening or merging a PR, or rewriting history and force-pushing.
- Any registry publish: `npm publish`, `twine`/PyPI, `dart pub publish`, `cargo publish`, `dotnet nuget push`, in any repo.
- `npm run gen:agent:dist`, or anything else that writes into the five SDK repos' tracked docs.
- `npm run harness:run`, which spends money.
- Anything targeting **mainnet**.
- Filing the core issue, or any other external post.
- Modifying `accumulate-core`.
- Deleting files you didn't create in this effort.
- Changing your own permission settings, agent-instruction files or AGENTS.md policy sections.

**Pre-authorized** (do these without asking):
- All reads, builds, tests, linters, typechecks, validators and generators (except `:dist`).
- `npm run verify:artifacts`.
- Creating scratch projects under `C:\tmp\htlc-*` and `C:\tmp\*-template-test`.
- Creating Python venvs.
- Installing packages **into those scratch projects or venvs** from the public registries.
- Running programs against the **Kermit testnet** (faucet use no more than `times: 3` per run), and an optional local devnet.
- Local commits on `feat/htlc-golden-path` in the Studio repo.
- Local commits on `htlc-fixes` branches in the SDK repos (runbook P1.3b).

**Commit format:** one single-line message in the repo's existing style. **No attribution trailers of any kind**; this is the repo owner's standing convention and it overrides any default attribution. Make one logical commit per phase, or per coherent sub-step within a large phase. Before each commit, run the AGENTS.md pre-commit gate:

```
npm run typecheck && npm test && npm run validate:manifests && npm run harness:test
```

During P3 that gate can only fail on `validate:manifests`, and only for the documented reason. Commit P3 and P4 together.

## 4. Stop conditions (pause and ask the human with AskUserQuestion)

- Kermit is below 1.4.6.4, unreachable for more than 30 minutes, or the faucet is exhausted.
- Any **(c) blocker**: a published SDK cannot do HTLC at all.
- A required toolchain is missing and can't be installed without admin rights.
- A baseline gate (P0.3) fails and the fix is outside this effort's scope.
- A design decision would contradict the runbook's D-1 through D-4 or expand scope.
- You've tried 3 materially different approaches to the same failure without progress. Write up what you tried and what you observed before asking.
- Anything in §3.

When you pause, leave STATUS.md accurate. A future session must be able to resume from it alone.

## 5. How to work

**Use subagents for parallel, independent work. Verify their output yourself.**
- **P1.1:** the five reference programs. One subagent per language, or a few, each with the language's Appendix B row, the P0 evidence, and the instruction to run it on Kermit and return txids plus the program's path.
- **P4.3:** the per-language templates. One subagent per language, given the P1 reference program for that language as the model.
- **P7.1–7.4:** the per-language live E2E runs.

You do the integration, the gates and the STATUS.md updates.

Treat subagent reports as claims. Re-run their key command or query yourself before marking anything PASSED.

Never let two agents edit the same file at once. Shared files are `manifest-generator.ts`, `template-loader.ts`, `blocks.ts` and similar; edit those yourself.

**Live-network discipline:**
- Generate unique ADI names with a timestamp suffix.
- Use the smallest amounts the runbook allows.
- Redact private keys from evidence files.
- Save raw query JSON next to the txids.

**Keep the user informed.** At each phase boundary, post a short update with:
- the phase result;
- the gate counts;
- the key txids for live phases;
- anything that needs their attention.

Do not narrate every step.

**Long-running commands** (cargo, dotnet, live E2E): run them in the background and wait for completion. Don't poll in sleep loops.

**Context hygiene:** STATUS.md is your durable memory. Update it after every completed step, not only at phase end, so a context reset or a new session loses nothing.

## 6. STATUS.md template (create on first run)

```markdown
# HTLC golden path — execution status
Branch: feat/htlc-golden-path   Started: <date>   Last updated: <date/time>
Current phase: P0   Next step: P0.1

## Environment
| Tool | Version |  (node, npm, python, dart, cargo/rustc, dotnet, git)

## Repo heads at start
studio <sha> · core local <sha> / origin/main <sha> · py/js/dart/rust/c# SDK <sha + version>

## Phase ledger
| Phase | State (TODO/IN-PROGRESS/PASSED/BLOCKED) | Gate evidence (command → result) | Commit |
|---|---|---|---|
| P0 Preflight & ground truth | TODO | | |
| P1 Reference programs & SDK audit | TODO | | |
| P2 Version alignment & regression | TODO | | |
| P3 Types/catalog/UI | TODO | | |
| P4 Codegen | TODO | | |
| P5 Template/YAML/offline tests | TODO | | |
| P6 Studio live execution | TODO | | |
| P7 Live E2E (release criterion) | TODO | | |
| P8 MCP/artifacts/docs | TODO | | |
| P9 Release readiness | TODO | | |

## Step checklist (current phase expanded; tick as you go)
- [ ] P0.1 …

## Live evidence index
| Phase | Lang | Mode (published/local/studio) | send txid | lockedTxId | release txid | verified (file) |

## Decisions
- D-xx <date>: <decision> — why — alternatives rejected

## Defect triage (Appendix C + new)
| ID | Resolution: template-workaround / SDK-branch-fix / blocker | Where |

## Baseline (pre-existing) failures

## Follow-ups (out of scope, noted)

## Human checkpoints pending
- [ ] push branch / PR
- [ ] publish SDK fixes (list)
- [ ] gen:agent:dist
- [ ] file core refund issue (docs/hash-lock-example/CORE-ISSUE-refund.md)
- [ ] deploy Studio
```

## 7. Definition of done (all must hold)

1. Gates P0–P9 are all `PASSED` in STATUS.md, with commands, counts and commits.
2. **For each of the 5 languages:**
   - the `hash-lock` template's generated project installed from the **public registry** ran successfully **3 consecutive times** on Kermit;
   - the local-SDK run passed;
   - a wrong-preimage variant exited non-zero with the node's error;
   - every success has an independent verification file showing:
     - the deposit `delivered` with `result.releaseTxID` equal to the release txid;
     - the release `delivered` with the matching preimage;
     - the receiver balance increased by `LOCK_AMOUNT`.
3. The in-Studio live run on Kermit succeeded (evidence saved). The new blocks work in the palette, the config modal and the template gallery.
4. Full gates are green and at or above baseline counts: typecheck, test, lint, validate:manifests, validate:canonical, harness:test, verify:codegen, build, build:mcp + test:mcp, proxy pytest. `gen:agent && gen:mcp` shows no drift on re-run.
5. `/code-review` (high) findings on the branch diff are fixed or explicitly justified.
6. `docs/hash-lock-example/RELEASE-READINESS.md` is written, and every pending human checkpoint is listed.
7. Final message to the user:
   - what shipped;
   - the evidence index;
   - known limits (no refund, which is a core defect; no HASH160 in Studio; HTLC SDK-only in the CLI);
   - the exact human actions remaining, in order.

Begin now with §1.
