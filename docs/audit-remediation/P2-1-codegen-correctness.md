# P2-1 — Code-generation correctness cluster

| Field | Value |
|-------|-------|
| Priority | P2 |
| Severity | Medium |
| Effort | M (2–3 days) |
| Risk | Low–Medium — changes the unified engine that the UI preview and bundle both depend on |
| Depends on | P0-2 (single engine; fixes here apply to the one path) |
| Blocks | — |
| Primary files | `packages/codegen/src/manifest-generator.ts`, `packages/codegen/src/template-engine.ts`, `packages/codegen/src/assertions-generator.ts`, `packages/codegen/src/templates/{python,rust,dart,javascript,csharp}/send_tokens.hbs`, `packages/codegen/src/templates/*/comment.hbs`, `packages/codegen/tests/action-palette-codegen.test.ts` |

Five distinct correctness bugs in engine A. Each is independently fixable; group them in one PR since they share files.

---

## BUG 1 — Multi-recipient `SendTokens` hard-quotes variable references

### 1. Problem & impact
The single-recipient path honors variable refs (it gates on `firstRecipientUrlIsRef` / `firstRecipientAmountIsRef`), but the multi-recipient `{{#each}}` branch hard-quotes `{{this.url}}` and `{{this.amount}}`. When `resolveConfigRefs` has resolved a recipient URL to a variable name (e.g. `generate_keys_2_lta` / a `format!(...)` / an `f"..."`), the template wraps it in quotes, producing a **string literal of the variable name** instead of the variable. The transaction sends to a literal like `"generate_keys_2_lta"`, which is not a valid URL.

### 2. Evidence (current code)
`computeNodeVars` `SendTokens` case computes `vars.recipients` straight from config (`manifest-generator.ts:850-883`); the recipient objects are run through `resolveConfigRefs` (`manifest-generator.ts:241`, recursing into arrays/objects at `:570-577`) so `recipient.url`/`recipient.amount` may already be resolved var expressions. But the single-recipient path is the only one with isRef flags:

```ts
        const rawFirstUrl = String(recipients[0]?.url || 'acc://recipient/ACME');
        vars.firstRecipientUrl = rawFirstUrl;
        vars.firstRecipientUrlIsRef = isVarRef(rawFirstUrl);   // :873-874
      ...
      const rawFirstAmt = String(recipients[0]?.amount || '1000000');
      vars.firstRecipientAmount = rawFirstAmt;
      vars.firstRecipientAmountIsRef = isVarRef(rawFirstAmt);  // :877-879
```

The `{{#each}}` branches hard-quote. Python `send_tokens.hbs:18-22`:
```hbs
                recipients=[
{{#each recipients}}
                    {"url": "{{this.url}}", "amount": "{{this.amount}}"},
{{/each}}
                ],
```
Rust `:16-18` → `("{{this.url}}", "{{this.amount}}")`; JS `:17-19` → `{ url: "{{this.url}}", amount: "{{this.amount}}" }`; Dart `:24-26` → `TokenRecipient(url: '{{this.url}}', amount: '{{this.amount}}')`; C# `:18-20` → `new TxRecipient("{{this.url}}", "{{this.amount}}")`. None consult an isRef flag.

### 3. Root cause
`computeNodeVars` only produced per-recipient ref metadata for index 0. The loop branch had no per-element flags, so the templates fell back to unconditional quoting.

### 4. Target behavior & acceptance criteria
- [ ] In a multi-recipient `SendTokens`, each recipient URL/amount that is a variable reference is emitted **unquoted**; literals stay quoted.
- [ ] Applies to all 5 languages.
- [ ] Existing single-recipient behavior unchanged.

### 5. Implementation steps

**5.1** In `computeNodeVars` `SendTokens` case (`manifest-generator.ts:850-883`), after `vars.recipients = recipients;`, build an annotated array:

```ts
      vars.recipients = recipients;
      vars.singleRecipient = recipients.length <= 1;
      // Per-recipient ref metadata so the {{#each}} branch can quote correctly.
      vars.recipientsAnnotated = recipients.map((r) => {
        const u = String(r.url);
        const a = String(r.amount);
        return {
          url: u, urlIsRef: isVarRef(u),
          amount: a, amountIsRef: isVarRef(a),
          // For Rust, refs are passed by reference (&var); literals are bare string lits.
        };
      });
```

**5.2** Point each multi-recipient template loop at `recipientsAnnotated` with conditional quoting.

Python `send_tokens.hbs` — before:
```hbs
{{#each recipients}}
                    {"url": "{{this.url}}", "amount": "{{this.amount}}"},
{{/each}}
```
after:
```hbs
{{#each recipientsAnnotated}}
                    {"url": {{#if this.urlIsRef}}{{this.url}}{{else}}"{{this.url}}"{{/if}}, "amount": {{#if this.amountIsRef}}{{this.amount}}{{else}}"{{this.amount}}"{{/if}}},
{{/each}}
```

Rust `send_tokens.hbs:15-19` — before `("{{this.url}}", "{{this.amount}}"),` after:
```hbs
{{#each recipientsAnnotated}}
            ({{#if this.urlIsRef}}&{{this.url}}{{else}}"{{this.url}}"{{/if}}, {{#if this.amountIsRef}}&{{this.amount}}{{else}}"{{this.amount}}"{{/if}}),
{{/each}}
```
(`send_tokens_multi(&[ ... ])` takes `&str`; refs already resolve to `String` vars, so `&var` yields `&String`→`&str` via deref. Matches the single-recipient `&{{firstRecipientUrl}}` convention at Rust `:8`.)

JS `send_tokens.hbs:17-19` →
```hbs
{{#each recipientsAnnotated}}
                { url: {{#if this.urlIsRef}}{{this.url}}{{else}}"{{this.url}}"{{/if}}, amount: {{#if this.amountIsRef}}{{this.amount}}{{else}}"{{this.amount}}"{{/if}} },
{{/each}}
```

Dart `send_tokens.hbs:24-26` →
```hbs
{{#each recipientsAnnotated}}
          TokenRecipient(url: {{#if this.urlIsRef}}{{this.url}}{{else}}'{{this.url}}'{{/if}}, amount: {{#if this.amountIsRef}}{{this.amount}}{{else}}'{{this.amount}}'{{/if}}),
{{/each}}
```

C# `send_tokens.hbs:18-20` →
```hbs
{{#each recipientsAnnotated}}
                    new TxRecipient({{#if this.urlIsRef}}{{this.url}}{{else}}"{{this.url}}"{{/if}}, {{#if this.amountIsRef}}{{this.amount}}{{else}}"{{this.amount}}"{{/if}}),
{{/each}}
```

> Keep the old `recipients` var around if any other template references it; only the `send_tokens.hbs` loops need to switch to `recipientsAnnotated`.

---

## BUG 2 — Silent template-compile/fallback demotion is invisible to tests

### 1. Problem & impact
If a `.hbs` template fails to compile, `createTemplateEngine` swallows the error and the op simply isn't registered; `renderNode` then routes to `_fallback.hbs`, which emits `# TODO: Implement {{blockType}}` + `pass` (Python). The action-palette test's `detectIssues` does **not** flag `TODO: Implement`/`not_implemented`/`pass`, so a broken template ships green. This is exactly how a regression could slip past CI even after P0-2.

### 2. Evidence (current code)
`template-engine.ts:122-128`:
```ts
  for (const [name, source] of Object.entries(templates)) {
    try {
      compiled.set(name, hbs.compile(source, { noEscape: true }));
    } catch (_e) {
      // Skip templates that fail to compile
    }
  }
```
`renderNode` silently falls back (`template-engine.ts:143-147`):
```ts
    renderNode(opId: string, context: TemplateContext): string {
      const tmpl = compiled.get(opId);
      if (!tmpl) return this.renderFallback(context.node.type);
      return tmpl(context);
    },
```
`_fallback.hbs` (Python) is `# TODO: Implement {{blockType}}\n        pass`. `detectIssues` (`action-palette-codegen.test.ts:237-319`) checks for unresolved `{{ }}`, `undefined`, `[object Object]`, and a few language patterns — **no** TODO/not_implemented/pass detection.

### 3. Root cause
Compile is best-effort by design (so a single bad template doesn't kill the whole engine), but there is no signal channel: failures are neither thrown nor collected, and the fallback is indistinguishable from real output to the test harness.

### 4. Target behavior & acceptance criteria
- [ ] Template compile failures are surfaced (collected on the engine and/or thrown), not silently swallowed.
- [ ] `detectIssues` flags `TODO: Implement`, `not_implemented`, and a bare `pass`-only fallback body as **severity `error`**.
- [ ] The existing 25-block × 5-lang suite fails if any block renders a fallback.

### 5. Implementation steps

**5.1** Collect compile errors on the engine. `template-engine.ts`:

Before:
```ts
  const compiled = new Map<string, Handlebars.TemplateDelegate>();

  for (const [name, source] of Object.entries(templates)) {
    try {
      compiled.set(name, hbs.compile(source, { noEscape: true }));
    } catch (_e) {
      // Skip templates that fail to compile
    }
  }
```
After:
```ts
  const compiled = new Map<string, Handlebars.TemplateDelegate>();
  const compileErrors: Array<{ template: string; error: string }> = [];

  for (const [name, source] of Object.entries(templates)) {
    try {
      compiled.set(name, hbs.compile(source, { noEscape: true }));
    } catch (e) {
      compileErrors.push({ template: name, error: e instanceof Error ? e.message : String(e) });
    }
  }
```

Expose them on the returned engine (extend the `TemplateEngine` interface `:57-62`):
```ts
export interface TemplateEngine {
  renderPreamble(context: TemplateContext): string;
  renderEpilogue(context: TemplateContext): string;
  renderNode(opId: string, context: TemplateContext): string;
  renderFallback(blockType: string): string;
  compileErrors: Array<{ template: string; error: string }>;
}
```
Add `compileErrors,` to the returned object literal (`:130`).

**5.2** Make `generateCodeFromManifest` fail loud when a template that is *required for a node in this flow* failed to compile. In `manifest-generator.ts` after `const engine = createTemplateEngine(language, templates);` (`:93`):
```ts
  if (engine.compileErrors.length > 0) {
    const needed = new Set(sortedNodes.map((n) => blockTypeToOp(n.type as BlockType)));
    const relevant = engine.compileErrors.filter((e) => needed.has(e.template));
    if (relevant.length > 0) {
      throw new Error(
        `Template compile failure(s) for ${language}: ` +
        relevant.map((e) => `${e.template}: ${e.error}`).join('; ')
      );
    }
  }
```
(Throwing only for templates actually used keeps unrelated broken templates from blocking a flow, while guaranteeing the test catches it since the suite renders every block.)

**5.3** Add fallback/stub detection to `detectIssues` (`action-palette-codegen.test.ts:237-271`), inside the per-line loop:
```ts
    // Fallback / unimplemented stubs — engine A must never emit these.
    if (/TODO:\s*Implement/.test(line) || /not_implemented/.test(line)) {
      issues.push({
        severity: 'error',
        message: `Unimplemented stub in generated code: ${line.trim()}`,
        line: i + 1,
      });
    }
```
Add a whole-output check after the loop (a Python fallback is exactly `# TODO: Implement X` + `pass`; the line check above already catches the TODO, so a bare `pass` alone is acceptable in real code — do **not** flag lone `pass`, only the TODO/not_implemented markers, to avoid false positives on legitimate empty Python branches).

---

## BUG 3 — `Comment` block breaks on multiline text

### 1. Problem & impact
`comment.hbs` is a single prefixed line `# {{commentText}}`. `computeNodeVars` passes `config.text` through unmodified, so a comment containing a newline yields a second, **unprefixed** line — invalid syntax in Python/Rust/Dart/C#/JS. The CLI path already splits correctly, proving the intended behavior.

### 2. Evidence (current code)
`computeNodeVars` `Comment` case (`manifest-generator.ts:956-959`):
```ts
    case 'Comment': {
      vars.commentText = (config.text as string) || 'Comment';
      break;
    }
```
Python `comment.hbs`:
```hbs
        # {{label}}
        # {{commentText}}
```
A `commentText` of `"line1\nline2"` renders:
```
        # line1
line2
```
The CLI path does it right (`manifest-generator.ts:1703-1710`):
```ts
      case 'Comment': {
        const text = (config.text as string) || '';
        for (const line of text.split('\n')) {
          lines.push(`# ${line}`);
        }
        break;
      }
```

### 3. Root cause
The single-line template assumes single-line text; no per-line prefixing.

### 4. Target behavior & acceptance criteria
- [ ] Multiline comment text produces one correctly-prefixed comment line per source line, in all 5 languages.
- [ ] Single-line comments are unchanged.
- [ ] Indentation matches each language's template (8 spaces Python/C#, 4 spaces Rust/JS, 2 spaces Dart).

### 5. Implementation steps (chosen approach: pre-split with a Handlebars helper)

**5.1** Pre-split into prefixed lines in `computeNodeVars`. Replace the `Comment` case:
```ts
    case 'Comment': {
      const raw = (config.text as string) || 'Comment';
      // Split into individual lines; the template prefixes each with the comment marker.
      vars.commentLines = raw.split('\n');
      vars.commentText = raw; // keep for backward compat / single-line label use
      break;
    }
```

**5.2** Update each `comment.hbs` to loop. The `commentPrefix` helper already exists (`template-engine.ts:97-108`) but Python needs `#` while others need `//`; `commentPrefix` returns the right marker per language, so use it.

Python `templates/python/comment.hbs`:
```hbs
        # {{label}}
{{#each commentLines}}
        # {{this}}
{{/each}}
```
Rust `templates/rust/comment.hbs`:
```hbs
    // {{label}}
{{#each commentLines}}
    // {{this}}
{{/each}}
```
Dart `templates/dart/comment.hbs`:
```hbs
  // {{label}}
{{#each commentLines}}
  // {{this}}
{{/each}}
```
JS `templates/javascript/comment.hbs`:
```hbs
    // {{label}}
{{#each commentLines}}
    // {{this}}
{{/each}}
```
C# `templates/csharp/comment.hbs`:
```hbs
        // {{label}}
{{#each commentLines}}
        // {{this}}
{{/each}}
```
(`Comment` is excluded from the action-palette suite at `:37`, so add a dedicated test in 6.)

---

## BUG 4 — `isVarRef` heuristic is brittle; block-ID ref regex rejects hyphens

### 1. Problem & impact
Block IDs can contain hyphens (node IDs are user/flow-defined). `resolveRef`'s reference regexes use `\w+`, which excludes `-`, so a `{{my-block.adiUrl}}` reference is **not resolved** and leaks as literal `{{my-block.adiUrl}}` into generated code (caught only by the unresolved-Handlebars check, i.e. it breaks). Separately, `isVarRef` is a pile of per-language string-prefix heuristics that misclassify edge cases (e.g. a literal URL beginning with a lowercase scheme matches `/^[a-z_]\w*$/i` partially; an all-uppercase symbol is special-cased). The fix: broaden the ref regexes to allow `-`, and move toward **tagged ref metadata** so quoting decisions stop relying on string-shape guessing.

### 2. Evidence (current code)
Full-ref and partial-ref regexes use `\w` (no hyphen) — `manifest-generator.ts:450, 481, 489-490`:
```ts
  const fullRefMatch = value.match(/^\{\{(\w+)\.(\w+)\}\}$/);     // :450
  ...
  const hasDottedRefs = /\{\{\w+\.\w+\}\}/.test(value);           // :481
  ...
  resolved = resolved.replace(
    /\{\{(\w+)\.(\w+)\}\}/g,                                      // :489-490
```
`blockIdToVarName` already normalizes hyphens to `_` (`:440-444`), so once matched the name resolves fine — the **match** is what fails on hyphenated IDs.

`isVarRef` heuristic (`manifest-generator.ts:629-638`):
```ts
  const isVarRef = (val: string) => {
    if (/^[A-Z][A-Z0-9]*$/.test(val)) return false;
    if (language === 'python') return val.startsWith('str(') || val.startsWith('f"') || val.startsWith("f'") || /^[a-z_][a-z0-9_]*$/.test(val);
    if (isCSharp) return val.startsWith('$"') || val.endsWith('.String()') || /^[a-z_]\w*$/i.test(val);
    if (isDart) return val.endsWith('.toString()') || val.includes('${') || /^[a-z_]\w*$/i.test(val);
    if (isRust) return val.startsWith('format!(') || /^[a-z_]\w*$/i.test(val);
    if (isJs) return val.startsWith('`') || /^[a-z_]\w*$/i.test(val);
    return /^[a-z_]\w*$/i.test(val);
  };
```

### 3. Root cause
`\w` was chosen for block-ID matching without accounting for hyphenated IDs. `isVarRef` infers "is this a variable expression?" from the *rendered string shape* because the resolver discards the literal-vs-ref distinction during `resolveConfigRefs` — there is no tag carried alongside the value.

### 4. Target behavior & acceptance criteria
- [ ] `{{block-with-hyphens.adiUrl}}` resolves correctly (no leaked `{{ }}`).
- [ ] Hyphenated block IDs flow through `SendTokens`/principal/signer references and generate valid code in all 5 languages.
- [ ] A typed `ResolvedValue = { kind: 'ref' | 'literal'; expr: string }` representation is introduced for at least the new code paths, and `isVarRef` is consulted only as a fallback for legacy string-shaped values.
- [ ] No regression in the 25-block suite.

### 5. Implementation steps

**5.1 (immediate, low-risk) — broaden the ref regexes to allow `-`.** Replace `\w` with `[\w-]` for the **block-id** capture group only (output names remain `\w`).

`manifest-generator.ts:450`:
```ts
  const fullRefMatch = value.match(/^\{\{([\w-]+)\.(\w+)\}\}$/);
```
`:481`:
```ts
  const hasDottedRefs = /\{\{[\w-]+\.\w+\}\}/.test(value);
```
`:489-490`:
```ts
  resolved = resolved.replace(
    /\{\{([\w-]+)\.(\w+)\}\}/g,
```
(`blockIdToVarName` at `:440-444` already maps `-`→`_`, so downstream is unaffected.)

**5.2 (structural) — introduce tagged ref metadata.** Add to `manifest-generator.ts`:
```ts
/** A resolved config value carries whether it is a code expression (ref) or a literal string. */
export interface ResolvedValue {
  kind: 'ref' | 'literal';
  /** For 'ref': a language-native expression. For 'literal': the raw string (unquoted). */
  expr: string;
}
```
Have `resolveRef` return `ResolvedValue` (ref when it produced an `f"..."`/`format!()`/`` `...` ``/`$"..."`/`.toString()`/bare-var expression; literal when it returned the input unchanged). Provide a back-compat wrapper `resolveRefString(...)` that returns `expr` so existing call sites compile, and migrate `computeNodeVars`'s quoting decisions to consult `.kind` instead of calling `isVarRef` on the rendered string. This removes the all-uppercase special-case (Bug noted at `:631`) because literals are tagged at resolution time.

Scope guard: do the full `ResolvedValue` migration **incrementally** — start with `SendTokens` (shares Bug 1's `recipientsAnnotated`) and the principal/signer helpers; leave other block types on the string heuristic until covered by tests. Keep `isVarRef` as the documented fallback for any value not yet carrying a tag.

**5.3** Keep `isVarRef`'s all-uppercase guard (`:631`) until 5.2 fully lands; it prevents symbols like `ACME`/`MYT` from being treated as vars.

---

## BUG 5 — `balance.delta` validator returns `passed: true` ("not implemented")

### 1. Problem & impact
`validateAssertion` for `balance.delta` returns `passed: true` with `actual: 'validation not implemented'`. A generated assertion that was never actually checked reports **success**, giving false confidence that a balance change occurred. It must not silently pass.

### 2. Evidence (current code)
`assertions-generator.ts:452-459`:
```ts
      case 'balance.delta': {
        // Would need before/after state comparison
        return {
          assertion,
          passed: true, // Placeholder
          actual: 'validation not implemented',
        };
      }
```

### 3. Root cause
Placeholder left as `passed: true`. Without before/after network state, the delta cannot be computed, but defaulting to pass is the wrong failure mode.

### 4. Target behavior & acceptance criteria
- [ ] `balance.delta` no longer returns `passed: true` when it did not validate.
- [ ] It returns a non-passing, clearly-labeled "skipped/unsupported" result (`passed: false` with an explicit `error`), OR a distinct `skipped` flag if the result consumers support it.
- [ ] Callers that count passes do not count this as a pass.

### 5. Implementation steps

**5.1** Inspect `AssertionResult` (`assertions-generator.ts:416-421`): `{ assertion, passed, actual?, error? }`. There is no `skipped` field. Minimal correct fix is `passed: false` with an explicit error. Replace the case:
```ts
      case 'balance.delta': {
        // Requires before/after state comparison, which is not available here.
        // Do NOT report a pass for an unvalidated assertion.
        return {
          assertion,
          passed: false,
          actual: undefined,
          error: 'balance.delta validation requires before/after state comparison (not available in this context)',
        };
      }
```

**5.2 (optional, preferred if consumers can adapt)** Add `skipped?: boolean` to `AssertionResult` and set `{ passed: false, skipped: true, error: '...' }`, then update any aggregation (search `grep -rn "validateAssertions\|\.passed" apps packages`) to treat `skipped` separately from genuine failures so it doesn't appear as a hard fail in summaries. If no consumer aggregates yet, ship 5.1 and defer 5.2.

---

## 6. Tests (whole-doc)

### Unit additions
- **Bug 1:** new test in `tests/` builds a `SendTokens` flow with **two** recipients where one URL is a `{{block.liteTokenAccount}}` ref and one is a literal; assert generated code contains the resolved var **unquoted** and the literal **quoted**, for all 5 langs. Assert no `"generate_keys` quoted-var-name appears.
- **Bug 2:** unit test that compiles an engine with one deliberately-broken template source (e.g. `'{{#if'`) and asserts `engine.compileErrors` is non-empty; and that `generateCodeFromManifest` throws when a needed template is broken. Plus: feed `detectIssues` a string containing `# TODO: Implement Foo` and assert it returns a severity-`error` issue.
- **Bug 3:** new `Comment` test — `config.text = 'a\nb\nc'`; assert each of `a`,`b`,`c` is on its own correctly-prefixed line for all 5 langs (no unprefixed line).
- **Bug 4:** flow with a node `id: 'my-adi-1'` referenced as `{{my-adi-1.adiUrl}}` in a downstream principal; assert no `{{` survives in output and the resolved var (`my_adi_1_url` / `myAdi1Url`) appears.
- **Bug 5:** `validateAssertion({type:'balance.delta',...}, {}, {})` returns `passed === false` and a non-empty `error`.

### Integration
- Re-run the full `action-palette-codegen.test.ts` (now with the Bug-2 stub detection) across all 25 blocks × 5 langs — must stay green and would now fail on any fallback.

### Manual checklist
- [ ] In Studio, build a multi-recipient SendTokens where recipients reference earlier blocks; preview shows unquoted vars.
- [ ] Rename a node to include a hyphen; downstream references still resolve in the preview.
- [ ] Add a multi-line Comment block; preview shows each line commented.

## 7. Risks, rollback, out of scope
- **Risk (Bug 2):** throwing on compile errors could surface latent broken templates that were previously masked — that's the point, but it may turn CI red on first run; triage by fixing the offending template.
- **Risk (Bug 4 structural):** the `ResolvedValue` migration touches many quoting sites; keep it incremental and gated behind tests. The regex widening (5.1) is safe and can ship alone.
- **Rollback:** each bug is an isolated diff; revert per-bug.
- **Out of scope:** amount scaling (P2-2), engine unification (P0-2), and full removal of `isVarRef` (tracked as the tail of Bug 4's structural work).
