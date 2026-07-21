# Phase 2 — Machine-Readable Interface

> **Goal:** every SDK ships a discoverable, single-shot **machine-readable interface** an agent ingests to learn the entire API at once — `llms.txt` + `llms-full.txt` + `AGENTS.md` — all **generated from the Studio manifest (SSOT)**, plus a **published, installable Accumulate MCP**. This is where Accumulate leaps ahead of nearly every other chain.

**Exit gate:** K5 = 100% (every public operation represented in each SDK's `llms-full.txt` + manifest); `llms.txt` present at each package root and served at a well-known URL; the MCP server is published and installable in one config block (K9); all artifacts regenerate from the manifest with zero hand-editing.

**Depends on:** P0 (SSOT hardening + golden-file generator tests). Can run in parallel with P1.

---

## P2.1 Architecture — one source, many targets

```
                         ┌───────────────────────────────────────────────┐
                         │  SSOT: packages/codegen/src/manifests/         │
                         │  {python,rust,dart,csharp,javascript}          │
                         │  .sdk-manifest.json  (schema-validated)        │
                         └───────────────┬───────────────────────────────┘
                                         │  generators (new + existing)
        ┌───────────────┬───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
   llms.txt        llms-full.txt     AGENTS.md      MCP tool         docs
  (index/router)  (full API digest) (agent rules)  schemas        snippets
   per SDK          per SDK          per SDK       (published)     per SDK
```

**Rule:** no agent artifact is hand-written per language. If the manifest lacks a field an artifact needs (e.g. `units`, `since`, `example`), add it to the manifest schema — never patch the output.

---

## P2.2 Task table — generation pipeline (Studio)

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P2-ST-01** | `packages/codegen/src/manifests/*.sdk-manifest.json` + `schemas/sdk-map.schema.json` | Extend the manifest schema with the fields agent artifacts need: `units` (amount scaling), `since` (per-lang version), `canonicalEntryPoint`, `example` (per op), `errorCodes`. Backfill for all 8 canonical tasks + action-palette ops. | Schema validates; drift check (P0-ST-09) green; all ops have `example`+`units` | M |
| **P2-ST-02** | `packages/codegen/src/agent/llms-txt.ts` (new) | Generator emitting `llms.txt` (concise router: what the SDK is, install, quickstart, links to full digest/examples/MCP) per language, following the llms.txt convention | `llms.txt` generated for each lang; golden-file test | M |
| **P2-ST-03** | `packages/codegen/src/agent/llms-full.ts` (new) | Generator emitting `llms-full.txt`: the **complete** API digest — every operation with signature, inputs (+units), outputs, prerequisites, one runnable example, and error codes — in the target language's idiom | Every public op present (K5=100%); golden-file test | L |
| **P2-ST-04** | `packages/agent-pack/src/generator.ts` | Wire the existing `generateAgentPack` (currently only called from its own tests) into a real script + committed output per SDK: `AGENTS.md`, `SAFETY.md`, `sdk.map.json`, prompts | `scripts/generate-agent-pack.mjs` writes `agent-pack/<lang>/` for all 5 | M |
| **P2-ST-05** | `scripts/generate-agent-artifacts.mjs` (new) | One command that regenerates `llms.txt` + `llms-full.txt` + `AGENTS.md` + MCP schemas for all langs from the manifest; used in CI | `npm run gen:agent` produces all artifacts deterministically | M |
| **P2-ST-06** | per-package READMEs (`packages/codegen`, `mcp-server`, `agent-pack`, `types`) | Add a short README to each internal package documenting its public exports (only `apps/sdk-proxy/README.md` exists today) | Each package has a README; agents can learn each surface without reading source | S |

---

## P2.3 Task table — distribute artifacts into each SDK

The generated artifacts must live **in each SDK's published package**, not only in Studio.

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P2-RS-01** | rust repo root + `Cargo.toml` (`include`) | Commit generated `llms.txt`/`llms-full.txt`/`AGENTS.md`; ensure they're packaged; add `#![doc = ...]` link | Files present in `cargo package` output; `artifact-verify` llms check green | S |
| **P2-PY-01** | python `unified/` + `pyproject.toml` (`[tool.setuptools.package-data]` / MANIFEST.in) | Commit + package `llms.txt`/`llms-full.txt`/`AGENTS.md`; also emit `Model.model_json_schema()` for every Pydantic type into `llms-full` | Files in the wheel/sdist; K5=100% | S |
| **P2-DT-01** | dart `unified/` + pubspec | Commit `llms.txt`/`llms-full.txt`/`AGENTS.md`; reference from README | Files in `dart pub publish --dry-run` output | S |
| **P2-CS-01** | csharp repo + `.csproj` (`<None Include>` pack) | Commit + pack `llms.txt`/`llms-full.txt`/`AGENTS.md` into the nupkg content | Files present in nupkg; `artifact-verify` llms check green | S |
| **P2-JS-01** | js `javascript/` + `package.json` `files` | Commit + include `llms.txt`/`llms-full.txt`/`AGENTS.md`; run `yarn doc` (TypeDoc already configured) and commit `docs/` | Files in `npm pack` output; TypeDoc digest present | S |
| **P2-XR-01** | hosting | Serve each SDK's `llms.txt`/`llms-full.txt` at a **well-known URL** (e.g. `https://accumulate.../<lang>/llms.txt`) so agents can fetch without installing | URLs return the artifacts; linked from docs | S |

---

## P2.4 Task table — publish the Accumulate MCP (K9)

| ID | Target | Change | Acceptance | Effort |
|---|---|---|---|---|
| **P2-ST-07** | `apps/mcp-server/package.json` | Flip `private: true` → publishable; set a public scoped name (e.g. `@accumulate/mcp` or `accumulate-mcp`); add `bin` | `npm i -g accumulate-mcp` works | S |
| **P2-ST-08** | `packages/codegen/src/agent-files.ts:~496-501` | Fix the generated `mcp.config.json` so it references the **published** package/command (today it emits `npx -y @accumulate-studio/mcp-server`, which is unpublished → guaranteed agent failure) | Generated config is runnable; harness MCP task passes | S |
| **P2-ST-09** | `apps/mcp-server` README + `docs/ai-agent-readiness/MCP.md` | Publish an install snippet (Claude/Codex config block: `command`/`args`/`env`) and document the 14 tools + 3 permission tiers | One-block install documented; K9 met | S |
| **P2-ST-10** | `apps/mcp-server` | Harden for standalone use: config for network (testnet default), permission tier via env, no bundled mainnet keys; smoke-test each tool | MCP smoke-test green; safe defaults | M |
| **P2-ST-11** | harness | Add an **MCP-mode** runner: score the 8 canonical tasks driven through the published MCP (not hand-written SDK code) | MCP-mode scorecard produced | M |

---

## P2.5 `llms-full.txt` content contract (what "100% coverage" means, K5)

For each SDK, `llms-full.txt` MUST contain, for **every** operation in the manifest:

- Operation name + one-line purpose.
- Canonical call signature **in that language's idiom** (not JSON).
- Every input with type **and units** (e.g. "`amount`: string, base units, 1 ACME = 1e8").
- Outputs and their types.
- Prerequisites (`requires`) — e.g. "signer must have credits", "ADI must exist".
- One **runnable** example snippet.
- The typed error(s) the op can raise + their codes.
- `since` version (per-lang), so an agent knows if the op exists in that SDK's shipped version.

Plus a header block: install command, network presets, the canonical entry point, and the amount-scaling rule. The static verifier (P0-ST-07) asserts op-count parity between manifest and `llms-full.txt`.

---

## P2.6 Verification protocol

1. `npm run gen:agent` twice → byte-identical output (deterministic generation).
2. Mutate one manifest op → regenerate → confirm `llms-full.txt`, `AGENTS.md`, and MCP schema all reflect it (SSOT wiring proven); golden-file test goes red then green.
3. `artifact-verify --all` → llms.txt/llms-full presence green in every package; op-count parity = 100% (K5).
4. Publish the MCP to a test tag; from a clean machine, add the documented config block to Claude Code/Codex and run the harness in **MCP-mode** → tasks pass through tools (K9).
5. Fetch each well-known `llms.txt` URL → 200 + correct content.
6. Update `SCORECARD.md`: K5 → 100%, K9 → met.

---

## P2.7 Rollback

- Generated artifacts are additive files in each package — remove from `files`/`include` and unpublish-forward (patch) if needed.
- MCP publish: ship under a pre-release tag first; promote to `latest` only after MCP-mode harness passes. If a bad MCP ships, deprecate + patch (never delete).
- Manifest schema changes are backward-compatible (new optional fields); the generator ignores unknown fields.

---

## P2.8 Deliverables

- SSOT-driven generators for `llms.txt` / `llms-full.txt` / `AGENTS.md` (+ per-package READMEs).
- Those artifacts committed & packaged in all 5 SDKs, and served at well-known URLs.
- A **published, installable Accumulate MCP** with documented one-block install, safe defaults, and 14 typed tools across 3 permission tiers.
- Harness MCP-mode + updated scorecard (K5=100%, K9 met).

**Next:** `04-PHASE-3-api-depth.md`.
