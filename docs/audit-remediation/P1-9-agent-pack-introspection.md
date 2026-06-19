# P1-9 — Agent-pack SDK Introspection: Fix or Honestly Scope

| Field | Value |
|---|---|
| Priority | P1 |
| Severity | High |
| Effort | L (recommended descope path: 2–3 days; full-introspection path: 8–12 days) |
| Risk | Medium |
| Depends on | none |
| Blocks | shares unused-symbol tsc fixes with P1-8 (sequence together) |
| Primary files | `packages/agent-pack/src/sdk-mapper.ts`, `packages/agent-pack/src/generator.ts`, `packages/agent-pack/src/index.ts`, `packages/agent-pack/src/templates/AGENTS.md.ts`, root `README.md` |

---

## 1. Problem & impact

The `agent-pack` package advertises "SDK introspection" — parsing a real SDK's source to emit an accurate `sdk.map.json` + `AGENTS.md`. In reality the introspection is **fabricated**: it ignores the SDK path entirely and returns hard-coded, language-keyed templates. Worse, the hard-coded data contains **wrong package names**, so the example code it generates would not even `import` correctly against the real published SDKs. The root `README.md` describes it as "Agent Pack definitions for SDK capabilities", overselling a stub. This is a credibility/correctness risk: an AI agent (or human) handed this pack gets confidently-wrong import lines.

To be precise about what is and isn't broken:
- The `generator.ts` `// TODO: Implement ${opName}` lines (`:279,:305,:329,:353,:381`) and `// TODO: Complete the workflow` (`:437,:481,:525,:569,:619`) are **intentional user-fill-in scaffolds** in generated example files — those are *fine* and must be preserved.
- The defect is the *introspection plumbing* and the *package names baked into the imports*.

## 2. Evidence (current code)

### 2a. `generateSDKMap` ignores its `sdkPath` argument
`packages/agent-pack/src/sdk-mapper.ts:178-211`:
```ts
/**
 * Generate an SDK map from SDK source files
 * In a real implementation, this would parse actual SDK source files
 * For now, we generate a representative map based on the language
 */
export function generateSDKMap(
  sdkPath: string,                 // <-- never read (TS6133 at :184)
  language: SDKLanguage,
  options?: Partial<SDKMapperOptions>
): SDKMap {
  ...
  const entrypoints = generateLanguageEntryPoints(language);   // hard-coded per language
  const operations = generateLanguageOperations(language);     // hard-coded per language
  const errors = KNOWN_ERRORS;                                 // hard-coded constant
  return { ... };
}
```

### 2b. `introspectSDKSource` is an explicit stub
`packages/agent-pack/src/sdk-mapper.ts:467-487`:
```ts
/**
 * Introspect actual source files (stub implementation)
 * In a real implementation, this would parse the source files
 */
export async function introspectSDKSource(
  sdkPath: string,
  language: SDKLanguage
): Promise<IntrospectionResult> {
  // This is a stub - in a real implementation, we would:
  // 1. Read source files from sdkPath
  // 2. Parse them using the language patterns
  // 3. Extract classes, functions, methods, and errors
  console.log(`Introspecting ${language} SDK at ${sdkPath}`);
  return {
    entrypoints: generateLanguageEntryPoints(language),   // <-- still hard-coded
    operations: generateLanguageOperations(language),
    errors: KNOWN_ERRORS,
  };
}
```

### 2c. `LANGUAGE_PATTERNS` regex table defined but never used
`packages/agent-pack/src/sdk-mapper.ts:52-101` defines a full per-language regex table (`classPattern`, `functionPattern`, `methodPattern`, `errorPattern`, `importPattern`, `docPattern` for python/typescript/javascript/rust/dart/csharp) — and **nothing references it** (TS6133 at `:52`). It is exactly the machinery real introspection would need, written but never wired.

### 2d. Wrong package names baked into generated examples
Verified against the real SDK manifests/manifLetes:
| Language | agent-pack emits | Real install/import name | Source of truth |
|---|---|---|---|
| JavaScript/TS | `accumulate-js` | **`accumulate.js`** | `opendlt-javascript-v2v3-sdk/javascript/package.json` `"name": "accumulate.js"` |
| Python (pip) | n/a (uses import name) | install name **`accumulate-sdk-opendlt`** | `opendlt-python-v2v3-sdk/unified/pyproject.toml` `name = "accumulate-sdk-opendlt"` |
| Python (import) | `accumulate_client` | `accumulate_client` ✅ correct | matches `packages/codegen/src/templates/python/_preamble.hbs:12` `from accumulate_client import …` |
| Rust (crate) | `accumulate_client` | crate is **`accumulate-sdk`**, lib name `accumulate_client` | `opendlt-rust-v2v3-sdk/unified/Cargo.toml` `name = "accumulate-sdk"` / `[lib] name = "accumulate_client"` |
| Dart (package) | `accumulate_client` | **`opendlt_accumulate`** | `opendlt-dart-v2v3-sdk/unified/pubspec.yaml` `name: opendlt_accumulate` |

The bad JS name appears at `sdk-mapper.ts:243` (entrypoint `path: 'accumulate-js'`) and in the generated import at `generator.ts:344` and `:547`:
```ts
// packages/agent-pack/src/generator.ts:344
import { Accumulate, TxBody, SmartSigner } from 'accumulate-js';
```
The Dart import at `generator.ts:320,:503` uses `package:accumulate_client/...` but the real Dart package is `opendlt_accumulate`.

### 2e. Compile errors (cross-ref P1-8 §2c)
```
src/index.ts(47,3): error TS2614: Module '"./sdk-mapper"' has no exported member 'KNOWN_ERRORS'.
src/index.ts(48,3): error TS2614: ... 'OPERATION_MAPPINGS'.
src/sdk-mapper.ts(52,7):  TS6133 'LANGUAGE_PATTERNS' never read
src/sdk-mapper.ts(184,3): TS6133 'sdkPath' never read
src/sdk-mapper.ts(337,48):TS6133 'language' never read
src/sdk-mapper.ts(11,3):  TS6196 'EntryPointKind' never used
src/generator.ts(397,57): TS6133 'sdkMap' never read
src/templates/AGENTS.md.ts(129,9): TS6133 'mainEntry' never read
src/templates/AGENTS.md.ts(215,60):TS6133 'sdkMap' never read
```

### 2f. README overselling
Root `README.md:23`:
```
    agent-pack/      Agent Pack definitions for SDK capabilities
```
"definitions for SDK capabilities" implies introspected capability data; it is curated templates.

## 3. Root cause

The package was scaffolded with the *shape* of an introspector (regex table, `sdkPath` params, an `introspectSDKSource` entry point) but only the hard-coded fallback was ever implemented. The fallback data was authored from memory and the JS/Dart/Rust-crate names are wrong. Because nothing consumes `LANGUAGE_PATTERNS` and `sdkPath`, `noUnusedLocals/Parameters` flags them — the compile errors are a *symptom* of the abandoned introspection, not a separate bug.

## 4. Target behavior & acceptance criteria — RECOMMENDATION: Track B (descope honestly)

**Recommendation: Track B.** Justification: real introspection across 5 heterogeneous languages (Python/Rust/Dart/JS/C#) with regexes is high-effort, brittle, and *low marginal value* — the project already maintains hand-curated, drift-checked SDK manifests in `packages/codegen/src/manifests/*.sdk-manifest.json` (the authoritative capability source, guarded by `scripts/check-manifest-drift.ts`). Duplicating that via fragile regex parsing buys little and adds a maintenance burden. The honest, correct, cheap move is: keep agent-pack as *representative templates*, fix the package names so generated examples actually import, remove the stub plumbing, and tell the truth in the README.

- [ ] `generateSDKMap` and the AGENTS.md generator no longer claim/imply source introspection in their doc comments.
- [ ] `introspectSDKSource` is **removed** (and its re-export dropped from `index.ts`), OR explicitly marked `@deprecated` and gated — removal preferred.
- [ ] Every package/import name emitted by `generator.ts` and `sdk-mapper.ts` entrypoints matches the real SDK names in the table (§2d).
- [ ] A single `SDK_PACKAGE_NAMES` map is the one source for these names (no scattered string literals).
- [ ] All agent-pack tsc errors from §2e are gone (`npm run build:agent-pack` exits 0).
- [ ] Root `README.md:23` is reworded to say "representative templates", not "definitions".
- [ ] `LANGUAGE_PATTERNS` and the `sdkPath` params are removed (no dead code, no suppression hacks).
- [ ] The intentional `// TODO: Implement` / `// TODO: Complete the workflow` scaffolds in generated examples are **preserved unchanged**.

## 5. Implementation steps (Track B)

### Step 1 — Introduce one canonical package-name map
Add near the top of `packages/agent-pack/src/sdk-mapper.ts` (after imports), replacing scattered literals:
```ts
/**
 * Real published SDK package / import identifiers, verified against:
 *  - opendlt-javascript-v2v3-sdk/javascript/package.json  → "accumulate.js"
 *  - opendlt-python-v2v3-sdk/unified/pyproject.toml        → pip "accumulate-sdk-opendlt", import "accumulate_client"
 *  - opendlt-rust-v2v3-sdk/unified/Cargo.toml              → crate "accumulate-sdk", lib "accumulate_client"
 *  - opendlt-dart-v2v3-sdk/unified/pubspec.yaml            → "opendlt_accumulate"
 *  - opendlt-c-sharp-v2v3-sdk                              → namespace "Accumulate.Client"
 */
export const SDK_PACKAGE_NAMES: Record<SDKLanguage, {
  /** how you install it (pip/npm/cargo/pub/nuget) */
  install: string;
  /** how you import/use it in code */
  importName: string;
}> = {
  python:     { install: 'accumulate-sdk-opendlt', importName: 'accumulate_client' },
  rust:       { install: 'accumulate-sdk',         importName: 'accumulate_client' },
  dart:       { install: 'opendlt_accumulate',     importName: 'opendlt_accumulate' },
  javascript: { install: 'accumulate.js',          importName: 'accumulate.js' },
  typescript: { install: 'accumulate.js',          importName: 'accumulate.js' },
  csharp:     { install: 'Accumulate.Client',      importName: 'Accumulate.Client' },
};
```
> Verify each value against the live SDK repos before merging; the table above was read from those files during this audit but SDKs evolve.

### Step 2 — Fix the JS entrypoint name in `sdk-mapper.ts`
`packages/agent-pack/src/sdk-mapper.ts:243-247` (inside `generateLanguageEntryPoints`, the `javascript`/`typescript` case):
Before:
```ts
    case 'javascript':
    case 'typescript':
      return [
        { symbol: 'Accumulate', path: 'accumulate-js', kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: 'accumulate-js', kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: 'accumulate-js', kind: 'class', doc: 'Automatic key resolution signer' },
      ];
```
After (drive from the map):
```ts
    case 'javascript':
    case 'typescript': {
      const pkg = SDK_PACKAGE_NAMES.javascript.importName;   // 'accumulate.js'
      return [
        { symbol: 'Accumulate', path: pkg, kind: 'class', doc: 'Main facade for Accumulate SDK' },
        { symbol: 'TxBody', path: pkg, kind: 'class', doc: 'Transaction body builder' },
        { symbol: 'SmartSigner', path: pkg, kind: 'class', doc: 'Automatic key resolution signer' },
      ];
    }
```
Do the equivalent for the Dart case (`:255-261` region) so `path` uses `package:opendlt_accumulate/opendlt_accumulate.dart` instead of `package:accumulate_client/...`. Leave the Python case (`accumulate_client` is correct) and adjust C#/Rust only if their entrypoint `path`s diverge from the map.

### Step 3 — Fix generated import lines in `generator.ts`
JavaScript (`packages/agent-pack/src/generator.ts:344` and `:547`):
Before:
```ts
import { Accumulate, TxBody, SmartSigner } from 'accumulate-js';
```
After:
```ts
import { Accumulate, TxBody, SmartSigner } from 'accumulate.js';
```
Dart (`generator.ts:320` and `:503`):
Before:
```ts
import 'package:accumulate_client/accumulate_client.dart';
```
After:
```ts
import 'package:opendlt_accumulate/opendlt_accumulate.dart';
```
Python (`generator.ts:269-270,:415-416`): **leave unchanged** — `accumulate_client` is the correct import module; only the *install* name differs and is not shown in the import line. If the generated file has a comment/README mentioning `pip install`, update it to `accumulate-sdk-opendlt`.
Rust (`generator.ts:293-294,:458-459`): `use accumulate_client::...` is the correct **lib** path; leave the `use` lines. If a `Cargo.toml` snippet or comment names the crate, set it to `accumulate-sdk`.
> Best practice for maintainability: since `generator.ts` builds these strings, interpolate `SDK_PACKAGE_NAMES[language].importName` rather than re-hardcoding — but a direct literal fix is acceptable if interpolation is awkward inside the template strings. **Do not touch any `// TODO: Implement`/`// TODO: Complete the workflow` lines.**

### Step 4 — Remove the introspection stub plumbing (resolves the tsc errors honestly)
(a) Delete `LANGUAGE_PATTERNS` (`sdk-mapper.ts:43-101`, the `interface LanguagePatterns` + the const) — unused.
(b) Delete `introspectSDKSource` (`sdk-mapper.ts:463-487`) and the `IntrospectionResult` type if now unused.
(c) `generateSDKMap`: drop the unused `sdkPath` param. New signature:
```ts
export function generateSDKMap(
  language: SDKLanguage,
  options?: Partial<SDKMapperOptions>
): SDKMap {
```
Update every caller (grep `generateSDKMap(` across `packages/agent-pack/src` and `scripts/`) to drop the first arg. Reword the doc comment to: `/** Build a representative SDK map from curated, per-language templates. NOT introspected from source. */`.
(d) `sdk-mapper.ts:11` remove `EntryPointKind` from the import; `:337` rename the unused `language` param to `_language` or remove if the function no longer needs it.
(e) `index.ts:43-51` re-export block: drop `introspectSDKSource` and `IntrospectionResult`; keep `generateSDKMap`, `KNOWN_ERRORS`, `OPERATION_MAPPINGS` (now `export const`, see P1-8 §5 step 2a):
```ts
export {
  generateSDKMap,
  KNOWN_ERRORS,
  OPERATION_MAPPINGS,
  SDK_PACKAGE_NAMES,
  type SDKMapperOptions,
} from './sdk-mapper';
```
(f) `generator.ts:397` `sdkMap` and `templates/AGENTS.md.ts:129 mainEntry`/`:215 sdkMap`: remove the genuinely-unused params/locals (or `_`-prefix if a signature must stay stable for an interface).

### Step 5 — De-oversell the README and doc comments
Root `README.md:23`:
Before:
```
    agent-pack/      Agent Pack definitions for SDK capabilities
```
After:
```
    agent-pack/      Representative AGENTS.md/sdk.map templates for the SDKs (curated, not introspected from source)
```
Also scan `README.md` for any "introspect"/"parses the SDK" sentence in an agent-pack section and reword to "curated representative templates". (Audit found no other `introspect` mention in tracked `.md` outside this package, so this single line is the primary edit.)

### Step 6 — (If product still wants real introspection later) Track A skeleton
Out of scope for this remediation, but record the design so the regex table isn't re-invented: a real `introspectSDKSource(sdkPath, language)` would `fs.readdir` the SDK src dir, read each source file, run `LANGUAGE_PATTERNS[language].classPattern/functionPattern/...` to extract symbols, map them through `OPERATION_MAPPINGS`, and emit `SDKEntryPoint[]`. Effort 8–12 days for 5 languages + golden-file tests; recommend revisiting only if the curated manifests prove insufficient. **Not built now.**

## 6. Tests / verification
```bash
npm run build:agent-pack          # expect exit 0, no "error TS"
grep -rn "accumulate-js" packages/agent-pack/src     # expect: NO matches
grep -rn "package:accumulate_client" packages/agent-pack/src   # expect: NO matches (Dart fixed)
grep -rn "accumulate.js" packages/agent-pack/src     # expect: matches in JS entrypoint + generated import
grep -rn "TODO: Implement\|TODO: Complete the workflow" packages/agent-pack/src/generator.ts | wc -l   # expect: 10 (unchanged)
grep -rn "introspectSDKSource\|LANGUAGE_PATTERNS" packages/agent-pack/src   # expect: NO matches (removed)
```
If the package has a vitest suite, add a unit test asserting `generateSDKMap('javascript').entrypoints.every(e => e.path === 'accumulate.js')` and `generateSDKMap('dart').entrypoints[0].path.includes('opendlt_accumulate')`.

Manual checklist:
- [ ] Generate an agent pack for JS and confirm the example's first import is `from 'accumulate.js'`.
- [ ] Generate for Dart and confirm `package:opendlt_accumulate/...`.
- [ ] Confirm generated Python/Rust example files still contain the untouched `# TODO`/`// TODO` scaffolds.
- [ ] `README.md:23` reads "representative … not introspected".

## 7. Risks, rollback, out of scope

**Risks**
- A wrong package name in the new map would propagate everywhere — verify each against the live SDK repo files cited in §2d before merge.
- Removing `introspectSDKSource` is a public API change; grep all consumers (`scripts/`, `apps/`) first. Audit found it is only self-referenced + re-exported, so impact is low.

**Rollback**: revert the agent-pack commit; the package returns to its prior (broken-but-building-blocked) state. The README edit is independently revertable.

**Out of scope**: Track A real introspection (Step 6 is documentation only); changing the curated operation/error data; the shared tsc-cleanup mechanics already specced in P1-8 (this doc removes the dead code that *causes* those specific errors, which is the cleaner resolution).
