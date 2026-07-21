# Phase 4 — Differentiation (Top-1% Moves)

> **Goal:** ship the capabilities that put Accumulate ahead of nearly every other chain for AI agents: a **GA, one-line-installable Accumulate MCP**, a **headless codegen CLI**, **hosted always-fresh `llms-full.txt`**, per-language **agent skill/rules packs**, and **self-verifying codegen**. Phases 0–3 make Accumulate *correct and ingestible*; Phase 4 makes it *preferred*.

**Exit gate:** program Definition of Done (Master Plan §9): fresh agent, clean machine, package name only → ≥ 7/8 canonical tasks first-try (K2 ≥ 90%); Accumulate MCP GA; codegen CLI GA; hosted llms-full.txt live; skill packs published; public scorecard green.

**Depends on:** P2 (manifest + MCP + llms artifacts) and P3 (typed surface + errors).

---

## P4.1 Workstream — GA the Accumulate MCP

Phase 2 published the MCP; Phase 4 makes it a first-class, safe, broadly adopted product.

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P4-ST-01** | `apps/mcp-server` | Promote to **GA**: semver 1.0, published under a stable public name, changelog, support policy. Ship one-block configs for Claude Code, Codex, and generic MCP clients. | `npm i -g accumulate-mcp` + one config block → agent drives Accumulate | M |
| **P4-ST-02** | `apps/mcp-server` | Expand tool coverage to all 8 canonical tasks + action-palette ops, each with per-tool `inputSchema` derived from the manifest; keep the 3-tier permission model (READ_ONLY default) | Every canonical task doable through tools; MCP-mode harness ≥ 90% | L |
| **P4-ST-03** | `apps/mcp-server` | **Safety hardening for autonomy:** testnet default, explicit `ACCUMULATE_NETWORK=mainnet` opt-in, SIGN_AND_SUBMIT requires explicit tier + never bundles keys, rate/spend guards, audit log of signed txs | Security review passes; safe-by-default confirmed | M |
| **P4-ST-04** | registries | Submit the MCP to public MCP directories/registries so agents discover it out-of-the-box | Listed in MCP registries; discoverable | S |

---

## P4.2 Workstream — Headless codegen CLI

Studio's `generateCodeFromManifest` is powerful but reachable only via the browser Export modal or SSR scripts. Expose it so an agent goes template → runnable integration with no browser.

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P4-ST-05** | `packages/codegen` (`bin`) | Ship a CLI: `accumulate-gen --template zero-to-hero --lang python --mode sdk --out ./app` wrapping `generateCodeFromManifest` + the `templates/*.yaml` loader | `npx accumulate-gen …` emits a runnable project for any of 8 templates × 5 langs | M |
| **P4-ST-06** | codegen CLI | `accumulate-gen list` (templates + langs) and `--from-flow <permalink|file>` (reuse the share-permalink `#flow=` format) so an agent can codegen from a shared Studio flow | CLI lists capabilities; consumes flow permalinks | S |
| **P4-ST-07** | publish | Publish the codegen engine (currently `private:true`) or a thin CLI wrapper package to npm | `npx accumulate-gen` works from a clean machine | S |
| **P4-XR-01** | harness | Add a **codegen-mode** runner: score canonical tasks where the agent calls the CLI instead of hand-writing code | Codegen-mode scorecard produced; compare vs hand-written & MCP modes | M |

---

## P4.3 Workstream — Hosted, always-fresh agent surface

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P4-ST-08** | hosting/CI | Auto-publish `llms.txt`/`llms-full.txt` for all 5 langs to well-known URLs on every manifest change; add a top-level `https://accumulate.../llms.txt` router pointing to per-lang digests + MCP + CLI | URLs always reflect latest manifest; CI-published | S |
| **P4-ST-09** | docs site | An "AI Agents" landing page: install any SDK, add the MCP, use the CLI, links to `llms-full.txt`, the scorecard, and skill packs | One page an agent (or its human) starts from | S |
| **P4-XR-02** | `.well-known` | Serve `/.well-known/llms.txt` (and per-lang) so agents can discover Accumulate's agent interface by convention | Well-known path returns the router | S |

---

## P4.4 Workstream — Agent skill / rules packs

Ship ready-made agent configuration so a coder drops Accumulate expertise straight into their agent.

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P4-XR-03** | new `accumulate-agent-skills/` | Per-agent packs generated from the manifest: a Claude Code **skill** + `CLAUDE.md` rules, a Codex/`AGENTS.md` pack, and a generic system-prompt pack — each encoding the canonical path, amount rules, error handling, and MCP usage | Packs installable; agent with pack scores higher than without on the harness | M |
| **P4-XR-04** | skill packs | Include the golden-path templates as few-shot exemplars and the error-code table as recovery rules | Harness shows fewer human interventions (K4↓) with pack installed | S |
| **P4-ST-10** | Studio | Add "Copy agent skill for this flow" alongside the existing export — an agent-pack scoped to the user's current flow | One-click agent pack from any Studio flow | S |

---

## P4.5 Workstream — Self-verifying codegen

Close the loop: generated code proves itself on-chain before the agent trusts it. The pieces exist in `packages/verification` and the per-flow `agent-acceptance.md` artifacts.

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P4-ST-11** | `packages/verification` + codegen CLI | `accumulate-gen … --verify` runs the generated integration against testnet and checks the flow's acceptance assertions (reusing `agent-acceptance.md` criteria) | CLI returns pass/fail + on-chain evidence; agent gets a trustworthy signal | M |
| **P4-ST-12** | export bundle | Emit a `verify.sh`/`verify.ts` in every export bundle that an agent can run to self-check | Every generated project ships a runnable verifier | S |
| **P4-XR-05** | harness | Treat self-verify pass as a first-class task outcome; surface it in the scorecard | Scorecard distinguishes "code compiles" from "verified on-chain" | S |

---

## P4.6 Verification protocol (also the program's Definition of Done)

1. **Cold-start test, per lang, per mode.** Clean machine, agent given only the package name. Run all 8 canonical tasks in three modes: hand-written SDK, MCP-driven, CLI-driven. Record K2 (≥ 90% first-try), K3 (≤ 6 turns), K4 (≤ 0.2 interventions).
2. **MCP install test.** From scratch, add the documented one-block config to Claude Code and Codex → agent completes tasks through tools; safety defaults confirmed (testnet, READ_ONLY unless opted in).
3. **CLI test.** `npx accumulate-gen --template zero-to-hero --lang <each> --verify` → runnable, self-verified integration on testnet.
4. **Discovery test.** Fetch `/.well-known/llms.txt` and per-lang URLs → agent can find the whole interface without prior knowledge.
5. **Skill-pack lift.** Run the harness with and without the agent skill pack → pack measurably improves K2/K4.
6. **Final scorecard.** K1=5/5, K2≥90%, K3≤6, K4≤0.2, K5=100%, K6=100%, K7≥95%, K8=1 line, K9 met, K10 CI-green. Publish as `SCORECARD.md` and tag `agent-readiness-ga`.

---

## P4.7 Rollback / safety

- MCP GA and CLI ship under pre-release tags first; promote to `latest` only after MCP-mode/CLI-mode harness passes and a security review of the sign/submit path.
- Hosted artifacts are regenerated from the manifest; a bad publish is fixed forward by re-running the pipeline.
- Self-verify runs on **testnet only** with ephemeral keys; never mainnet in CI.

---

## P4.8 Deliverables

- **Accumulate MCP GA** — installable in one block, all canonical tasks as typed tools, safe-by-default, listed in MCP registries.
- **`accumulate-gen` CLI GA** — template/flow → runnable, optionally self-verified integration, no browser.
- **Hosted `llms.txt`/`llms-full.txt`** at well-known + `.well-known` URLs, auto-fresh from the manifest.
- **Agent skill/rules packs** per agent platform, generated from the SSOT.
- **Self-verifying codegen** — every generated project can prove itself on-chain.
- **Final public scorecard** meeting the program Definition of Done → Accumulate is demonstrably top-1% AI-agent-preferred.

---

## Appendix — Cross-phase task index

| Phase | Focus | KPIs moved | Key deliverable |
|---|---|---|---|
| P0 | Verification & harness | K1–K4 instrumented | Agent Usability Harness + baseline scorecard |
| P1 | Front-door correctness | K1→5/5, K8, K10 | Verbatim quickstarts; fixed packaging; XML docs |
| P2 | Machine-readable interface | K5→100%, K9 | `llms.txt`/`llms-full.txt`/`AGENTS.md` (SSOT) + published MCP |
| P3 | API depth & ergonomics | K6→100%, K7≥95%, K2↑ | Typed bodies/queries, unified errors, `Amount`, one entry point |
| P4 | Differentiation | K2≥90%, K3, K4 | MCP GA, codegen CLI, hosted llms, skill packs, self-verify |
