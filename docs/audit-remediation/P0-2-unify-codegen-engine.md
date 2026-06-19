# P0-2 — Unify code-generation engines (delete engine B's per-block code)

| Field | Value |
|-------|-------|
| Priority | P0 |
| Severity | Critical |
| Effort | M (2–3 days) |
| Risk | Medium — bundle output changes shape; downstream consumers (ExportModal, bundle tests, agent files) must be re-validated |
| Depends on | — |
| Blocks | P0-3 (real export bundle), P2-1 (correctness fixes share engine A) |
| Primary files | `packages/codegen/src/project-scaffolds.ts`, `packages/codegen/src/bundle-generator.ts`, `packages/codegen/src/index.ts`, `packages/codegen/src/manifest-loader.ts`, new `packages/codegen/tests/project-scaffolds-unified.test.ts` |

---

## 1. Problem & impact

There are **two** code generators in the repo:

- **Engine A (complete):** `generateCodeFromManifest()` in `packages/codegen/src/manifest-generator.ts`. Manifest + Handlebars driven, covers **all 25 block types × 5 languages**, used by the UI preview through `apps/studio/src/services/code-generator/index.ts`.
- **Engine B (incomplete, 6/25):** the per-language `generate{Lang}Project()` functions in `packages/codegen/src/project-scaffolds.ts`. Each contains a hand-written `switch (node.type)` that only implements `GenerateKeys`, `Faucet`, `CreateIdentity`, `CreateTokenAccount`, `SendTokens`, `AddCredits`. **Every other block type emits a stub** and is silently wrong.

`PROJECT_GENERATORS` (engine B) is what `bundle-generator.ts` calls at line 153–155 to produce the per-language `generated/<lang>/...` source files of the export bundle. So any exported bundle that uses one of the other 19 block types (`WriteData`, `CreateToken`, `UpdateKeyPage`, `IssueTokens`, `TransferCredits`, `BurnCredits`, `LockAccount`, `UpdateAccountAuth`, `WaitForBalance`, `WaitForCredits`, `QueryAccount`, `CreateKeyBook`, `CreateKeyPage`, `CreateDataAccount`, `CreateLiteTokenAccount`, `BurnTokens`, `WriteDataTo`, `UpdateKey`, `Comment`) ships **non-functional code** containing `// TODO: Implement <type>` / `{"status": "not_implemented"}`.

Impact: the preview the developer sees in Studio (engine A) does **not** match what they download (engine B). The downloaded bundle does not compile / does not run for 19/25 blocks. This is the root defect behind P0-3 (the export feature is fake) and undermines all the engine-A correctness work tracked in MEMORY.md.

## 2. Evidence (current code)

Engine B stubs — every language has an identical `default` arm. Python (`project-scaffolds.ts:202-207`):

```ts
      default:
        lines.push(`
    # ${stepId}: ${node.type}
    # TODO: Implement ${node.type}
    results["${stepId}"] = {"status": "not_implemented"}`);
    }
```

Rust (`project-scaffolds.ts:408-412`):

```ts
      default:
        lines.push(`
    // ${stepId}: ${node.type}
    // TODO: Implement ${node.type}`);
```

Dart (`project-scaffolds.ts:624-628`), JavaScript (`project-scaffolds.ts:826-830`), C# (`project-scaffolds.ts:1035-1039`) are the same shape.

Only 6 cases are implemented per language, e.g. Python `generatePythonBlockExecution` (`project-scaffolds.ts:135-207`): `GenerateKeys`, `Faucet`, `CreateIdentity`, `CreateTokenAccount`, `SendTokens`, `AddCredits`.

The bundle wires engine B in (`bundle-generator.ts:151-166`):

```ts
  // 4. Generate code for each language
  for (const language of opts.languages) {
    const generator = PROJECT_GENERATORS[language];
    if (generator) {
      const projectFiles = generator(flow);
      for (const file of projectFiles) {
        files.push({
          path: `generated/${language}/${file.path}`,
          content: file.content,
          type: 'code',
          language,
          isEntryPoint: file.isEntryPoint,
        });
      }
    }
  }
```

Engine A is already complete and battle-tested — `generateCodeFromManifest(flow, language, mode, manifest)` (`manifest-generator.ts:81-309`) renders every node via Handlebars templates registered in `template-loader.ts` (all 25 ops for all 5 languages). The Studio preview already uses it (`apps/studio/src/services/code-generator/index.ts:14-16`).

Note `PROJECT_GENERATORS` also targets the wrong SDK packages (engine B Python uses `accumulate_client.convenience` import shapes that don't match engine A's `_preamble.hbs`; Rust uses `accumulate-sdk` instead of the real crate; C# uses placeholder `Acme.Net.Sdk`). Engine A's preambles are the source of truth.

## 3. Root cause

`project-scaffolds.ts` predates the manifest-driven engine. When engine A was built and tied to the UI preview, engine B was never retired — the bundle path kept calling it. The `generate{Lang}BlockExecution` switch statements are dead weight that must be deleted, not maintained.

## 4. Target behavior & acceptance criteria

- [ ] Each `generate{Lang}Project(flow)` produces its **main source file** by calling `generateCodeFromManifest(flow, lang, 'sdk', manifest)` — not by a hand-written switch.
- [ ] All five per-language `generate{Lang}BlockExecution()` functions are **deleted**.
- [ ] Scaffold functions still produce all **project-metadata files**: `pyproject.toml` + `__init__.py` + `README.md` (Python); `Cargo.toml` + `README.md` (Rust); `pubspec.yaml` + `lib/<name>.dart` library shim + `README.md` (Dart); `package.json` + `README.md` (JS); `<Name>.csproj` + `README.md` (C#).
- [ ] A flow containing **all 25 block types** produces, for every language, a main file with **zero** occurrences of `TODO: Implement`, `not_implemented`, or the `_fallback` stub body (`pass` for Python, bare comment for others).
- [ ] `generateProject()` and `PROJECT_GENERATORS` keep their existing signatures (`(flow: Flow) => GeneratedFile[]`); manifests are loaded internally so callers are unchanged.
- [ ] `bundle-generator.ts` is unchanged in shape (still iterates `PROJECT_GENERATORS`) OR updated to pass manifests — see step 5.6.
- [ ] Existing engine-A tests (`action-palette-codegen.test.ts`, baseline tests) still pass.
- [ ] New regression test `project-scaffolds-unified.test.ts` passes (step 6).

## 5. Implementation steps

### Step 5.1 — Add a manifest accessor that scaffolds can use

`project-scaffolds.ts` currently imports nothing from the manifest layer. Manifests are loaded by `manifest-loader.ts` (`loadAllManifests()`, already exported from `index.ts`). Load them **once** at module scope so per-call generation is cheap.

**File:** `packages/codegen/src/project-scaffolds.ts` — top of file.

Before:
```ts
import type { Flow, GeneratedFile, SDKLanguage } from '@accumulate-studio/types';
import { serializeFlowToYaml } from './flow-serializer';
```

After:
```ts
import type { Flow, GeneratedFile, SDKLanguage, SDKMap } from '@accumulate-studio/types';
import { serializeFlowToYaml } from './flow-serializer';
import { generateCodeFromManifest } from './manifest-generator';
import { loadAllManifests } from './manifest-loader';

// Manifests are static data bundled at build time; load once.
const MANIFESTS = loadAllManifests();

/** Resolve the manifest for a language, falling back to the JS manifest for TS. */
function manifestFor(language: SDKLanguage): SDKMap | null {
  if (MANIFESTS[language]) return MANIFESTS[language]!;
  if (language === 'typescript' && MANIFESTS['javascript']) return MANIFESTS['javascript']!;
  return null;
}

/** Single source of truth for the main source body. */
function mainSource(flow: Flow, language: SDKLanguage): string {
  return generateCodeFromManifest(flow, language, 'sdk', manifestFor(language));
}
```

> `flow-serializer` import stays (used elsewhere). `serializeFlowToYaml` is currently imported but the only YAML use lives in `bundle-generator.ts`; if it is genuinely unused after this change, delete the import to satisfy `noUnusedLocals`. Verify with `grep -n serializeFlowToYaml project-scaffolds.ts`.

### Step 5.2 — Python: call engine A, delete the switch

**File:** `packages/codegen/src/project-scaffolds.ts`.

Replace the body of `generatePythonMain` (`:80-126`) so it delegates. Engine A's `_preamble.hbs` already emits imports, env-var loading, client init, `tx_ids` bookkeeping and the success print — so `generatePythonMain` becomes a thin wrapper.

Before (`:53-58`, inside `generatePythonProject`):
```ts
  // Main Python file
  files.push({
    path: `${safeName}/main.py`,
    content: generatePythonMain(flow),
    isEntryPoint: true,
  });
```

After — keep the push, but `generatePythonMain` now delegates:
```ts
  // Main Python file (generated by the unified manifest engine)
  files.push({
    path: `${safeName}/main.py`,
    content: mainSource(flow, 'python'),
    isEntryPoint: true,
  });
```

Then **delete** these now-dead functions entirely:
- `generatePythonMain` (`:80-126`)
- `generatePythonBlockExecution` (`:128-211`)

Keep `generatePythonProject` (`:20-78`) minus the two deleted calls, and keep `generatePythonReadme` (`:213-247`). The `pyproject.toml` (`:24-51`) and `__init__.py` (`:60-69`) blocks are unchanged metadata. The `__init__.py` re-exports `run_flow`; engine A's `_preamble`/`_epilogue` defines `run_flow` — confirm the symbol name matches by inspecting `templates/python/_preamble.hbs` and `_epilogue.hbs`; if engine A names the entry differently, update `__init__.py` to match.

### Step 5.3 — Rust: call engine A, delete the switch

Before (`:278-284`, inside `generateRustProject`):
```ts
  // Main Rust file
  files.push({
    path: 'src/main.rs',
    content: generateRustMain(flow),
    isEntryPoint: true,
  });
```

After:
```ts
  // Main Rust file (generated by the unified manifest engine)
  files.push({
    path: 'src/main.rs',
    content: mainSource(flow, 'rust'),
    isEntryPoint: true,
  });
```

**Delete** `generateRustMain` (`:294-336`) and `generateRustBlockExecution` (`:338-416`). Keep `generateRustProject` (`:253-292`) minus the deleted call and `generateRustReadme` (`:418-443`).

`Cargo.toml` currently pins `accumulate-sdk = "2.0"` (`:267`). Engine A's Rust preamble imports `accumulate_client::...`. **Align the crate name** in `Cargo.toml` with whatever crate the Rust templates `use` — inspect `templates/rust/_preamble.hbs` and copy its crate/version. If the template uses a path/git dependency, mirror that. This is the one place metadata must track engine A.

### Step 5.4 — Dart / JavaScript / C# (same pattern)

For each, replace the main-file push with `mainSource(flow, '<lang>')` and delete the two per-language functions:

| Language | Replace push at | Delete functions | Keep metadata |
|----------|-----------------|------------------|---------------|
| Dart | `:472-477` (`bin/main.dart`) → `content: mainSource(flow, 'dart')`. **Also** the library file `lib/src/flow.dart` (`:490-494`) currently holds `generateDartFlow(flow)`; point it at engine A too: keep `bin/main.dart` as the thin entry shim it already is (`:505-513`) and set `lib/src/flow.dart` content to `mainSource(flow, 'dart')`. | `generateDartFlow` (`:516-549`), `generateDartBlockExecution` (`:551-633`). Keep `generateDartMain` (`:505-513`) — it is a metadata shim, not block codegen. | `pubspec.yaml` (`:454-470`), `lib/<name>.dart` export (`:480-488`), `README` (`:635-660`) |
| JavaScript | `:695-700` (`src/index.js`) → `content: mainSource(flow, 'javascript')` | `generateJavaScriptMain` (`:711-751`), `generateJavaScriptBlockExecution` (`:753-835`) | `package.json` (`:671-693`), `README` (`:837-862`) |
| C# | `:894-899` (`Program.cs`) → `content: mainSource(flow, 'csharp')` | `generateCSharpMain` (`:910-963`), `generateCSharpBlockExecution` (`:965-1044`) | `.csproj` (`:872-892`), `README` (`:1046-1071`) |

Notes:
- **Dart entry shim:** `generateDartMain` (`:505-513`) imports `package:<name>/src/flow.dart` and calls `runFlow()`. Engine A's Dart `_preamble`/`_epilogue` must expose a top-level `runFlow()` in `lib/src/flow.dart`. Verify by reading `templates/dart/_preamble.hbs`; if the engine emits a `main()` instead, either (a) keep engine A output in `bin/main.dart` directly and drop the `lib/src/flow.dart` split, or (b) wrap. Prefer (a) for simplicity: set `bin/main.dart` = `mainSource(flow,'dart')`, delete the `lib/src/flow.dart` and `lib/<name>.dart` files, and drop the library export — Dart console apps run `bin/main.dart` directly via `dart run`.
- **`.csproj` SDK package:** like Rust, `Acme.Net.Sdk` (`:886`) is a placeholder. Replace `<PackageReference Include="Acme.Net.Sdk" ... />` with the package the C# templates `using` (inspect `templates/csharp/_preamble.hbs`).
- **package.json dependency:** engine A's JS preamble imports from a specific package (inspect `templates/javascript/_preamble.hbs`); align `dependencies` in `:684-687`.

### Step 5.5 — Keep the registry & `generateProject` unchanged

`PROJECT_GENERATORS` (`:1117-1124`) and `generateProject` (`:1129-1135`) keep their `(flow) => GeneratedFile[]` shape. No caller change required because manifests are resolved inside `mainSource`.

### Step 5.6 — bundle-generator: no change required, but harden

`bundle-generator.ts:151-166` still works as-is. Optionally add a post-generation guard so a regressed scaffold fails loudly instead of shipping a stub:

After the inner `for (const file of projectFiles)` loop (`:165`), add:
```ts
      // Guard: the unified engine must never emit stub markers.
      for (const file of projectFiles) {
        if (file.isEntryPoint && /TODO: Implement|not_implemented/.test(file.content)) {
          throw new Error(
            `Bundle generation produced a stub in generated/${language}/${file.path}. ` +
            `A block type is unhandled by the manifest engine.`
          );
        }
      }
```
(Place this guard inside the `if (generator)` block, iterating `projectFiles` once more after they're pushed, or fold the check into the existing loop.)

## 6. Tests

### Unit / integration — new file `packages/codegen/tests/project-scaffolds-unified.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import type { Flow, FlowNode, BlockType } from '@accumulate-studio/types';
import { PROJECT_GENERATORS } from '../src/project-scaffolds';

const ALL_BLOCK_TYPES: BlockType[] = [
  'GenerateKeys', 'Faucet', 'WaitForBalance', 'WaitForCredits', 'QueryAccount',
  'CreateLiteTokenAccount', 'AddCredits', 'TransferCredits', 'BurnCredits',
  'CreateIdentity', 'CreateKeyBook', 'CreateKeyPage', 'CreateTokenAccount',
  'CreateDataAccount', 'CreateToken', 'SendTokens', 'IssueTokens', 'BurnTokens',
  'WriteData', 'WriteDataTo', 'UpdateKeyPage', 'UpdateKey', 'LockAccount',
  'UpdateAccountAuth', 'Comment',
];

function flowWithAllBlocks(): Flow {
  const nodes: FlowNode[] = ALL_BLOCK_TYPES.map((type, i) => ({
    id: `${type.toLowerCase()}_${i}`,
    type,
    label: type,
    config: {},
    position: { x: 0, y: i * 100 },
  }));
  const connections = nodes.slice(1).map((n, i) => ({
    id: `c${i}`, sourceNodeId: nodes[i].id, sourcePortId: 'output',
    targetNodeId: n.id, targetPortId: 'input',
  }));
  return { version: '1.0', name: 'All Blocks', description: 'every block type',
           network: 'devnet', nodes, connections, variables: [], assertions: [] };
}

const STUB_RE = /TODO:\s*Implement|not_implemented/;

describe('unified project scaffolds', () => {
  const flow = flowWithAllBlocks();

  for (const lang of ['python', 'rust', 'dart', 'javascript', 'csharp'] as const) {
    describe(lang, () => {
      const files = PROJECT_GENERATORS[lang](flow);
      const entry = files.find(f => f.isEntryPoint)!;

      it('emits an entry-point file', () => {
        expect(entry).toBeDefined();
        expect(entry.content.length).toBeGreaterThan(100);
      });

      it('main file has NO stub markers for any of the 25 block types', () => {
        expect(STUB_RE.test(entry.content)).toBe(false);
      });

      it('still emits project metadata (README + manifest file)', () => {
        const paths = files.map(f => f.path);
        expect(paths).toContain('README.md');
        // language-specific manifest must be present
        const manifestFile = {
          python: 'pyproject.toml', rust: 'Cargo.toml', dart: 'pubspec.yaml',
          javascript: 'package.json', csharp: undefined, // .csproj name varies
        }[lang];
        if (manifestFile) expect(paths).toContain(manifestFile);
      });
    });
  }

  it('main file equals the unified engine output (no divergent path)', () => {
    // Sanity: scaffold main must be a prefix-stable copy of engine A.
    const py = PROJECT_GENERATORS.python(flow).find(f => f.isEntryPoint)!;
    expect(py.content).toContain('def run_flow'); // engine-A preamble symbol
  });
});
```

Adjust the `run_flow` assertion to whatever symbol the Python `_preamble.hbs` actually emits.

### Manual checklist

- [ ] `pnpm --filter @accumulate-studio/codegen test` green (existing + new).
- [ ] Build a real Zero-to-Hero flow in Studio; export Python; the `generated/python/<name>/main.py` matches the preview pane verbatim.
- [ ] `grep -rn "TODO: Implement" packages/codegen/src/project-scaffolds.ts` returns **nothing** (proves the switches are gone).
- [ ] `cd` into a generated Python project and `python -m py_compile <name>/main.py` succeeds (or run baseline harness).

## 7. Risks, rollback, out of scope

- **Risk:** generated metadata (`Cargo.toml`, `.csproj`, `package.json`) may still reference placeholder SDK packages. This task aligns them with engine-A template imports but does **not** verify the packages publish/build — covered by the language baseline harnesses (`tests/*-baseline.test.ts`).
- **Risk:** the Dart library-split change (`lib/src/flow.dart` vs `bin/main.dart`) could break the `import` shim. Mitigated by preferring the "single `bin/main.dart`" layout (step 5.4 note (a)).
- **Rollback:** revert `project-scaffolds.ts`; `bundle-generator.ts` is unchanged so engine B reappears intact.
- **Out of scope:** the CLI mode (`generateCLI` in `manifest-generator.ts:1467`) — its own `default` arm at `:1712-1713` also emits a TODO but is not part of the bundle main-file path. Track separately if CLI export is exposed.
- **Out of scope:** P0-3's in-browser zip/download wiring — this task only fixes the *content* of the generated files.
