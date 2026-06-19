# P3-4 — Live Code Preview: Debounced Regeneration, Stale/Loading Indicator, Error Display

| Field | Value |
| --- | --- |
| Priority | P3 |
| Severity | Opportunity |
| Effort | S |
| Risk | Low (CodePanel-local; no store schema changes) |
| Depends on | P0-2 (single code-generation engine), P1-4 (per-block validation errors) |
| Blocks | None |
| Primary files | `apps/studio/src/components/code-panel/CodePanel.tsx`, `apps/studio/src/services/code-generator/index.ts` (read-only) |
| Cross-ref | P2-3 Part E (Monaco theme sync) — **do not re-implement here** |

---

## 1. Problem & impact

The CodePanel regenerates code via a `useMemo` keyed on `[flow, selectedLanguage, codeMode]` (`CodePanel.tsx:32-34`), so it *does* re-run on every flow change — but **synchronously and on every keystroke-level mutation**. For large flows or per-character config edits, calling `generateCode` (which runs the full manifest generator, `services/code-generator/index.ts:8`) on every store update can jank the canvas. There is also:
- **No "regenerating…" / stale indicator** — during a heavy regeneration the panel silently shows old code, with no signal that it is recomputing.
- **No error surface** — if a block is misconfigured and `generateCode` throws (or the manifest generator emits an error), the panel currently has no try/catch and would crash the editor or render a raw error; misconfigured blocks should show a friendly, actionable message tied to the validation system (P1-4).

The goal: make the preview update **live but debounced**, show a lightweight loading/stale badge while a regeneration is pending, and render a graceful error panel (linked to per-block validation) when generation fails.

> The language switcher already exists (`Tabs.Root` over `SDK_LANGUAGES`, `CodePanel.tsx:116-138`) and the SDK/CLI toggle (`CodePanel.tsx:87-112`); this doc does **not** add a switcher. Monaco theme sync is owned by **P2-3 Part E** — reference it, do not duplicate.

---

## 2. Evidence (current code)

**Synchronous, un-debounced regeneration (`CodePanel.tsx:29-34`):**
```tsx
  const flow = useFlowStore((state) => state.flow);

  // Generate code for current flow and language
  const generatedCode = useMemo(() => {
    return generateCode(flow, selectedLanguage, codeMode);
  }, [flow, selectedLanguage, codeMode]);
```
No try/catch, no pending state, no error path.

**`generateCode` runs the full manifest generator (`services/code-generator/index.ts:8-24`):**
```ts
export function generateCode(flow: Flow, language: SDKLanguage, mode: CodeMode): string {
  if (flow.nodes.length === 0) {
    return getEmptyFlowMessage(language);
  }
  if (manifests[language]) {
    return generateCodeFromManifest(flow, language, mode, manifests[language]!);
  }
  if (language === 'typescript' && manifests['javascript']) {
    return generateCodeFromManifest(flow, 'javascript', mode, manifests['javascript']!);
  }
  return `// Code generation for ${language} not yet implemented`;
}
```
This is a pure function returning a `string` — no built-in error reporting; a malformed config currently relies on the generator not throwing.

**The store already debounces validation (`flow-store.ts:677-686`)** — the same `setTimeout(…, 300)` pattern we mirror here:
```ts
useFlowStore.subscribe((state) => {
  if (state.flow !== lastFlowRef) {
    lastFlowRef = state.flow;
    if (validationTimer) clearTimeout(validationTimer);
    validationTimer = setTimeout(() => {
      const result = analyzeFlow(state.flow);
      useFlowStore.setState({ validationResult: result });
    }, 300);
  }
});
```

**Per-block validation exists** (`selectFlowValidationSeverity` is consumed in `Header.tsx:347`; the flow store holds `validationResult` from `analyzeFlow`). P1-4 formalizes per-node errors we can surface here.

---

## 3. Root cause

The CodePanel was built with a straightforward `useMemo` that recomputes on identity change of `flow`. Because `flow` is a fresh object on every store mutation, every config keystroke triggers a full regeneration on the render path, with no debounce, no pending UI, and no failure handling. The infrastructure to do better (a debounce pattern, a validation result on the store) already exists but was not applied to code generation.

---

## 4. Target behavior & acceptance criteria

- [ ] Code regeneration is **debounced** (~250–300 ms) off flow changes; language/mode switches regenerate **immediately** (no debounce — they are explicit user intent).
- [ ] While a debounced regeneration is pending (flow changed but new code not yet computed), the panel shows a subtle **"Updating…"** badge near the header; the previously generated code remains visible (no flicker to empty).
- [ ] If `generateCode` throws, the editor area is replaced by a **friendly error panel** ("Couldn't generate code") that lists the offending block(s) from the validation result (P1-4) and a hint to open block config; the last good code is **not** shown as if valid.
- [ ] If the flow has **validation errors but generation still succeeds**, show a non-blocking warning banner above the editor ("N block(s) need attention") sourced from the store's `validationResult` / per-block errors.
- [ ] No regression to the language tabs, SDK/CLI toggle, copy/download, or footer stats.
- [ ] Monaco theme continues to follow app theme (delivered by P2-3 Part E; this doc must not touch the `theme` prop).
- [ ] `pnpm --filter @accumulate-studio/studio build` passes.

---

## 5. Implementation steps

All changes are in `CodePanel.tsx`. We replace the single synchronous `useMemo` with: (a) an immediate-vs-debounced trigger, (b) `try/catch` around generation into `{ code, error }` state, and (c) a derived "stale/pending" flag.

### Step 1 — read the validation result and add generation state

Add to the existing store reads (`CodePanel.tsx:25-29`):
```tsx
  const selectedLanguage = useUIStore((state) => state.selectedLanguage);
  const setSelectedLanguage = useUIStore((state) => state.setSelectedLanguage);
  const codeMode = useUIStore((state) => state.codeMode);
  const setCodeMode = useUIStore((state) => state.setCodeMode);
  const flow = useFlowStore((state) => state.flow);
  // P1-4 per-block validation; used to explain generation failures.
  const validationResult = useFlowStore((state) => state.validationResult);
```
> `validationResult` is already on the flow store (set by the debounced `analyzeFlow` subscription, `flow-store.ts:683`). If P1-4 renames/extends it, adjust the selector accordingly.

Add local generation state (after the store reads):
```tsx
  // Result of the last code generation attempt.
  const [genResult, setGenResult] = React.useState<{ code: string; error: string | null }>(
    { code: '', error: null }
  );
  // True while a debounced regeneration is queued but not yet applied.
  const [isStale, setIsStale] = React.useState(false);
```
> Add `useState` (and `useEffect`, `useRef`) to the React import at `CodePanel.tsx:1`:
> ```tsx
> import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
> ```

### Step 2 — a safe generate helper

Add a memoized generator that never throws to the render path:
```tsx
  const runGeneration = useCallback(() => {
    try {
      const code = generateCode(flow, selectedLanguage, codeMode);
      setGenResult({ code, error: null });
    } catch (err) {
      console.error('Code generation failed:', err);
      setGenResult((prev) => ({
        code: prev.code, // keep last good code out of the editor; error panel takes over
        error: err instanceof Error ? err.message : 'Unknown code generation error',
      }));
    } finally {
      setIsStale(false);
    }
  }, [flow, selectedLanguage, codeMode]);
```

### Step 3 — immediate regeneration on language/mode change

Language and SDK/CLI are explicit, infrequent user actions — regenerate synchronously so the switch feels instant:
```tsx
  // Immediate regen when language/mode (or first mount) changes.
  useEffect(() => {
    runGeneration();
    // Intentionally NOT depending on `flow` here — flow is debounced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, codeMode]);
```

### Step 4 — debounced regeneration on flow change

Mirror the store's 300 ms validation debounce:
```tsx
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstFlowRun = useRef(true);

  useEffect(() => {
    // Skip the very first flow effect — Step 3's mount effect already generated.
    if (firstFlowRun.current) {
      firstFlowRun.current = false;
      return;
    }
    setIsStale(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runGeneration();
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flow, runGeneration]);
```
> `runGeneration` closes over the current `flow`, so by the time the 250 ms timer fires it reads the latest flow. Because `runGeneration`'s identity changes with `flow`, the cleanup clears any superseded timer — this is the standard debounce-with-latest-value pattern and matches the store's intent.

### Step 5 — remove the old synchronous memo

Delete (`CodePanel.tsx:32-34`):
```tsx
  const generatedCode = useMemo(() => {
    return generateCode(flow, selectedLanguage, codeMode);
  }, [flow, selectedLanguage, codeMode]);
```
Throughout the component, references to `generatedCode` now come from `genResult.code`. Update the three consumers:
- `handleCopy` (`CodePanel.tsx:39`): `await navigator.clipboard.writeText(genResult.code);`
- `handleDownload` (`CodePanel.tsx:57`): `const blob = new Blob([genResult.code], …);`
- Footer line count (`CodePanel.tsx:167`): `{genResult.code.split('\n').length} lines`
- Editor `value` (`CodePanel.tsx:145`): `value={genResult.code}`

### Step 6 — stale/updating badge in the header

In the header row next to the "Generated Code" title (`CodePanel.tsx:72-83`), add the badge:

Before:
```tsx
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Generated Code
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy to clipboard">
```
After:
```tsx
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Generated Code
            </h2>
            {isStale && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-accumulate-500 animate-pulse" />
                Updating…
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy to clipboard">
```

### Step 7 — error / warning surfaces above the editor

Wrap the editor container (`CodePanel.tsx:140-160`). Compute a friendly list of offending blocks from `validationResult` (shape per P1-4; defensive access below).

Add just above the `{/* Code editor */}` block, derive the error block list:
```tsx
  // Blocks flagged by validation (P1-4). Defensive: shape may evolve.
  const problemBlocks: string[] = React.useMemo(() => {
    const nodes = (validationResult as { nodeResults?: Record<string, { severity?: string }> } | null)
      ?.nodeResults;
    if (!nodes) return [];
    return Object.entries(nodes)
      .filter(([, r]) => r?.severity === 'error')
      .map(([nodeId]) => {
        const node = flow.nodes.find((n) => n.id === nodeId);
        return node?.label ?? nodeId;
      });
  }, [validationResult, flow.nodes]);
```
> Adjust `nodeResults`/`severity` field names to the exact shape P1-4 lands. The selector pattern (`analyzeFlow` → `validationResult`) is already established in the store.

Replace the editor wrapper (`CodePanel.tsx:140-160`):

Before:
```tsx
        {/* Code editor */}
        <div className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            language={MONACO_LANGUAGES[selectedLanguage]}
            value={generatedCode}
            theme="vs-dark"
            options={{ /* ... */ }}
          />
        </div>
```
After:
```tsx
        {/* Code editor (or error panel) */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {genResult.error ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Couldn&apos;t generate code
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                {problemBlocks.length > 0
                  ? `Check the configuration of: ${problemBlocks.join(', ')}.`
                  : 'One or more blocks are misconfigured. Open a block to fix its settings.'}
              </p>
              <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 font-mono break-all max-w-xs">
                {genResult.error}
              </p>
            </div>
          ) : (
            <>
              {problemBlocks.length > 0 && (
                <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 text-xs bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-b border-yellow-200 dark:border-yellow-900/40">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {problemBlocks.length} block{problemBlocks.length !== 1 ? 's' : ''} need attention — generated code may be incomplete.
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  language={MONACO_LANGUAGES[selectedLanguage]}
                  value={genResult.code}
                  theme={monacoTheme /* from P2-3 Part E; if P2-3 not merged, keep "vs-dark" */}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    padding: { top: 16, bottom: 16 },
                    renderLineHighlight: 'none',
                    folding: true,
                  }}
                />
              </div>
            </>
          )}
        </div>
```
Add `AlertCircle` to the lucide import (`CodePanel.tsx:4`):
```tsx
import { Copy, Download, Terminal, Code2, AlertCircle } from 'lucide-react';
```
> **Theme:** the `theme={monacoTheme}` reference above assumes P2-3 Part E has introduced the `monacoTheme` memo. If P3-4 ships first, temporarily keep `theme="vs-dark"` and let P2-3 swap it — do not implement the theme memo in this PR (it belongs to P2-3 to avoid a merge conflict).

### Step 8 — footer stats use the new code

Footer (`CodePanel.tsx:164-168`):
```tsx
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{flow.nodes.length} blocks</span>
          <span>{genResult.code.split('\n').length} lines</span>
        </div>
```

---

## 6. Tests

**Component tests (Vitest + RTL, fake timers):**
1. `CodePanel.live.test.tsx`:
   - Mock `generateCode` to return a marker string. Mount; assert it ran once on mount.
   - `vi.useFakeTimers()`; update the store flow → assert "Updating…" badge appears and `generateCode` has NOT yet re-run; advance timers by 250 ms → badge disappears and `generateCode` re-ran exactly once (debounce coalesces rapid edits: fire 5 flow updates within 250 ms → exactly one regeneration).
   - Switch language via the tab → `generateCode` re-runs **immediately** (no timer advance needed).
2. `CodePanel.error.test.tsx`: make `generateCode` throw → assert the error panel ("Couldn't generate code") renders, the Monaco `Editor` is **not** rendered, and the offending block label appears when `validationResult.nodeResults` flags it.
3. `CodePanel.warn.test.tsx`: `generateCode` succeeds but `validationResult` has an `error`-severity node → assert the yellow warning banner renders above the editor and the editor still shows code.

**Manual QA checklist:**
- [ ] Type rapidly into a block's config (via BlockConfigModal) → the code panel shows "Updating…" then settles ~250 ms after you stop; it does not regenerate on every keystroke.
- [ ] Switch language tab → code updates instantly, no "Updating…" flicker.
- [ ] Toggle SDK/CLI → updates instantly.
- [ ] Deliberately misconfigure a block so generation fails → friendly error panel names the block; fixing it restores the editor.
- [ ] A flow with a validation error that still generates → yellow "N blocks need attention" banner above otherwise-valid code.
- [ ] Copy/Download/line-count all use the currently displayed code.
- [ ] Toggle theme (after P2-3 Part E) → editor theme follows; this doc didn't regress it.

---

## 7. Risks, rollback, out of scope

- **Dependency — P0-2 (single engine):** this doc assumes `generateCode` is *the* generation path. If two engines still exist when this lands, the debounced trigger must wrap whichever single entry point P0-2 settles on; do not wire two.
- **Dependency — P1-4 (validation errors):** the error/warning panels read `validationResult` per-block shape. The defensive accessors above won't crash if the shape differs, but the block-name list will be empty until P1-4's shape is final — adjust the `nodeResults`/`severity` field access to match.
- **Risk — debounce vs. validation race:** code regen (250 ms) and the store's validation (300 ms) run on independent timers, so the warning banner may briefly lag the code by ~50 ms. Acceptable; if it looks off, align both to 300 ms.
- **Risk — stale flag stuck:** ensure `setIsStale(false)` runs in `runGeneration`'s `finally` (Step 2) so a thrown generation still clears the badge.
- **Rollback:** revert `CodePanel.tsx` to the single `useMemo`; no store or other-file changes to undo.
- **Out of scope:** Monaco theme sync (P2-3 Part E), editable/round-trip code (editor stays `readOnly`), web-worker offloading of generation, syntax-error squiggles inside Monaco, and adding/altering the language switcher (already present).
