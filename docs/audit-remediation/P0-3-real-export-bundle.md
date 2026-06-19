# P0-3 — Make "Export Bundle" real (zip the actual generated project in-browser)

| Field | Value |
|-------|-------|
| Priority | P0 |
| Severity | Critical |
| Effort | M (1.5–2 days) |
| Risk | Medium — new browser dependency; bundle generator currently has a Node-only zip path |
| Depends on | P0-2 (unified engine so the zipped files are real) |
| Blocks | — |
| Primary files | `apps/studio/src/components/modals/ExportModal.tsx`, `apps/studio/package.json`, new `apps/studio/src/services/export/bundle-to-zip.ts`, `packages/codegen/src/bundle-generator.ts` (browser-safe zip helper) |

---

## 1. Problem & impact

The Studio "Export Bundle" modal is a **placebo**. It shows a file-tree preview promising `main.<ext>`, project manifests, `flow.yaml`, `README.md`, assertions, and agent files — then downloads a single `<name>_bundle.json` containing `JSON.stringify({ flow, options })`. None of the previewed files exist in the download. The real bundle generator (`packages/codegen/src/bundle-generator.ts` `generateBundle()`), which produces all those files, is **never called** by the modal.

Impact: users believe they exported a runnable multi-language project; they got a blob of their flow JSON. Combined with P0-2, even when the bundle generator *is* wired in, 19/25 blocks emit stubs — so P0-2 must land first.

## 2. Evidence (current code)

The fake handler — `ExportModal.tsx:223-259`:

```tsx
  // Handle export
  const handleExport = async () => {
    if (options.languages.length === 0) {
      return;
    }
    setIsExporting(true);
    try {
      // In a real implementation, this would call a service to generate the bundle
      // For now, we'll simulate the export
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Create a simple zip file structure (placeholder)
      const flowName = flow.name.toLowerCase().replace(/\s+/g, '_');
      const content = JSON.stringify({
        flow,
        options,
        exportedAt: new Date().toISOString(),
      }, null, 2);

      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${flowName}_bundle.json`;     // ← JSON, not a zip
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };
```

The preview is hand-faked and does not reflect real output — `ExportModal.tsx:166-220`. It invents files that the real generator does not produce (`verify.py`, `prompt.md`, `context.json`) and omits ones it does (`flow.json`, `bundle.manifest.json`, `agent-task.md`, `agent-acceptance.md`, `agent-pack.ref.json`, `mcp.config.json`):

```tsx
  const bundleStructure = useMemo((): BundleFile[] => {
    ...
      const langFolder: BundleFile = {
        path: lang,
        type: 'folder',
        children: [
          { path: `main${SDK_FILE_EXTENSIONS[lang]}`, type: 'file' },
          { path: SDK_PROJECT_FILES[lang], type: 'file' },
        ],
      };
    ...
        children: [
          { path: 'assertions.yaml', type: 'file' },
          { path: 'verify.py', type: 'file' },     // ← not produced
        ],
    ...
        children: [
          { path: 'prompt.md', type: 'file' },     // ← not produced
          { path: 'context.json', type: 'file' },  // ← not produced
        ],
```

The real generator already produces a flat, accurate file list — `bundle-generator.ts:118-232` returns `Bundle.files: BundleFile[]`, each with `{ path, content, type, language?, isEntryPoint? }`, and a `bundle.manifest.json` (`:220-225`). Real bundle paths: `bundle.manifest.json`, `flow.yaml`, `flow.json`, `README.md`, `generated/<lang>/...`, `assertions/assertions.yaml`, `assertions/expected-state.json`, `agent/agent-task.md`, `agent/agent-acceptance.md`, `agent/agent-pack.ref.json`, `agent/mcp.config.json`.

The existing zip helper is **Node-only and unusable in the browser** — `bundle-generator.ts:446-484`:

```ts
export async function generateBundleZip(bundle: Bundle): Promise<Buffer> {
  const archiver = await import('archiver');           // Node stream lib
  const { Readable, Writable } = await import('stream'); // Node 'stream'
  ...
        chunks.push(Buffer.from(chunk));                 // Buffer crashes in browser
```

`Buffer.from()` is not available in the browser (per MEMORY.md), and `archiver`/`stream` are Node modules. So the modal cannot reuse this.

## 3. Root cause

The modal was scaffolded with a placeholder before `generateBundle()` existed, and the only zip path written was Node-targeted (for a CLI/server that was never built). The browser export was left as a `setTimeout` + JSON dump and never revisited.

## 4. Target behavior & acceptance criteria

- [ ] Clicking **Export Bundle** calls the real `generateBundle(flow, options)` and downloads a real **`.zip`** named `<flowName>_bundle.zip`.
- [ ] The zip contains exactly the files in `Bundle.files` at their `path`s (including `bundle.manifest.json`, `flow.yaml`/`flow.json`, `README.md`, `generated/<lang>/*`, and assertions/agent files when those options are on).
- [ ] The preview tree is built from a **dry-run** of the real generator (same `generateBundle` call), so what is shown equals what is downloaded.
- [ ] Zipping is done with a **browser-safe** library (`fflate`) — no `Buffer`, no Node `stream`/`archiver` in the browser bundle.
- [ ] Progress UI reflects real phases (Generating → Zipping → Downloading), not a fixed 1.5 s sleep.
- [ ] Errors surface to the user (inline error text), not just `console.error`.
- [ ] `options.languages.length === 0` is still blocked.
- [ ] `apps/studio/package.json` gains the new dependency; `pnpm install` succeeds.

## 5. Implementation steps

### Step 5.1 — Choose & add the zip library: `fflate`

Recommendation: **`fflate`** over JSZip.

- `fflate` is tree-shakeable, ~8 KB, has zero dependencies, works in the browser with `Uint8Array` (no `Buffer`), and exposes a synchronous `zipSync(files): Uint8Array` that is ideal for the small text bundles we produce.
- JSZip pulls in more weight and its older builds reference `Buffer` in some code paths; `fflate` is unambiguously browser-safe, which directly addresses the `Buffer.from()` crash noted in project memory.

**File:** `apps/studio/package.json` — add to `dependencies`:

```json
    "fflate": "^0.8.2",
```

(Place alphabetically; current deps end at `"zustand": "^4.4.7"`.) Run `pnpm install` from repo root.

### Step 5.2 — Add a browser-safe bundle→zip adapter

Create **`apps/studio/src/services/export/bundle-to-zip.ts`**:

```ts
import { zipSync, strToU8 } from 'fflate';
import type { Bundle } from '@accumulate-studio/codegen';

/**
 * Convert a generated Bundle into a zip Uint8Array, fully in-browser.
 * Uses fflate (no Node Buffer/stream — safe for the browser bundle).
 */
export function bundleToZipBytes(bundle: Bundle): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of bundle.files) {
    // strToU8 produces UTF-8 bytes without Buffer.
    entries[file.path] = strToU8(file.content);
  }
  // level 6 is a good size/speed tradeoff for text payloads.
  return zipSync(entries, { level: 6 });
}

/** Trigger a browser download of raw bytes as a named file. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/zip'): void {
  // Copy into a fresh ArrayBuffer-backed view so Blob gets a clean buffer.
  const blob = new Blob([bytes.slice()], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

> Why not reuse `generateBundleZip` from codegen? It is Node-only (`archiver` + `stream` + `Buffer`). Leave it for any future server path; the browser uses this new adapter. Optionally annotate `bundle-generator.ts:446` with a comment: `// NODE ONLY — browser callers must use apps/studio/src/services/export/bundle-to-zip.ts`.

### Step 5.3 — Map `ExportOptions` → `BundleOptions`

`ExportModal`'s `ExportOptions` (`ExportModal.tsx:25-30`) is `{ languages, includeAssertions, includeAgentFiles, network }`. `generateBundle` expects `Partial<BundleOptions>` (`bundle-generator.ts:26-39`): `{ languages, includeAssertions, includeAgentFiles, network, bundleName?, includeFlowJson? }`. They are compatible. Add a tiny mapper in the modal:

```ts
function toBundleOptions(o: ExportOptions): Partial<BundleOptions> {
  return {
    languages: o.languages,
    includeAssertions: o.includeAssertions,
    includeAgentFiles: o.includeAgentFiles,
    network: o.network,
    includeFlowJson: true,
  };
}
```

### Step 5.4 — Rewrite the export handler

**File:** `apps/studio/src/components/modals/ExportModal.tsx`.

Add imports at top (after existing imports, `:1-14`):

```tsx
import { generateBundle, type BundleOptions, type Bundle } from '@accumulate-studio/codegen';
import { bundleToZipBytes, downloadBytes } from '../../services/export/bundle-to-zip';
```

Add progress state next to `isExporting` (`:153`):

```tsx
  const [isExporting, setIsExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<'idle' | 'generating' | 'zipping' | 'done'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
```

Replace `handleExport` (`:223-259`) entirely:

```tsx
  const handleExport = async () => {
    if (options.languages.length === 0) return;

    setIsExporting(true);
    setExportError(null);
    try {
      // Phase 1: generate the real multi-file bundle (engine A via P0-2).
      setExportPhase('generating');
      const bundle: Bundle = await generateBundle(flow, toBundleOptions(options));

      // Phase 2: zip in-browser with fflate (no Buffer).
      setExportPhase('zipping');
      const zipBytes = bundleToZipBytes(bundle);

      // Phase 3: download a real .zip.
      const flowName = flow.name.toLowerCase().replace(/\s+/g, '_') || 'flow';
      downloadBytes(zipBytes, `${flowName}_bundle.zip`);

      setExportPhase('done');
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed unexpectedly.');
    } finally {
      setIsExporting(false);
      setExportPhase('idle');
    }
  };
```

### Step 5.5 — Make the preview reflect ACTUAL files

Replace the hand-faked `bundleStructure` memo (`:166-220`) with one derived from a real `generateBundle` dry run. Because `generateBundle` is async, compute it in an effect into state, and render a tree built from the real flat paths.

Add a path→tree helper near the top of the file (module scope):

```tsx
function buildTreeFromPaths(paths: string[]): BundleFile[] {
  const root: BundleFile = { path: '', type: 'folder', children: [] };
  for (const full of paths) {
    const parts = full.split('/');
    let cursor = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      cursor.children ??= [];
      let next = cursor.children.find(c => c.path === part);
      if (!next) {
        next = { path: part, type: isFile ? 'file' : 'folder', children: isFile ? undefined : [] };
        cursor.children.push(next);
      }
      cursor = next;
    });
  }
  return root.children ?? [];
}
```

Replace the `useMemo` block with effect-driven real state:

```tsx
  const [previewTree, setPreviewTree] = useState<BundleFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || options.languages.length === 0) {
      setPreviewTree([]);
      return;
    }
    // Dry run the SAME generator the download uses, so preview == download.
    generateBundle(flow, toBundleOptions(options))
      .then((bundle) => {
        if (!cancelled) setPreviewTree(buildTreeFromPaths(bundle.files.map(f => f.path)));
      })
      .catch(() => { if (!cancelled) setPreviewTree([]); });
    return () => { cancelled = true; };
  }, [isOpen, flow, options]);
```

Import `useEffect` (extend `:1`): `import React, { useState, useEffect } from 'react';` (drop `useMemo` if no longer used). Update the preview render (`:411-413`) to iterate `previewTree` instead of `bundleStructure`:

```tsx
                  {previewTree.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Select at least one language to preview the bundle.
                    </p>
                  ) : (
                    previewTree.map((item, index) => (
                      <FileTreeItem key={index} item={item} />
                    ))
                  )}
```

> `generateBundle` is debounced naturally by the effect dependency set; for large flows you may wrap it in a `setTimeout(…, 150)` inside the effect to avoid regenerating on every keystroke. Optional.

### Step 5.6 — Real progress in the footer button

Replace the button's spinner label (`:434-444`) so it shows the live phase:

```tsx
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {exportPhase === 'generating' ? 'Generating…'
                        : exportPhase === 'zipping' ? 'Zipping…'
                        : 'Exporting…'}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export Bundle
                    </>
                  )}
```

And surface `exportError` in the body (e.g. just under the language grid `:328-332` or in the footer left of the buttons):

```tsx
              {exportError && (
                <p className="mt-2 text-sm text-red-500">{exportError}</p>
              )}
```

### Step 5.7 — Verify `@accumulate-studio/codegen` is importable from the browser app

`generateBundle` (and the whole `bundle-generator`) is exported from `packages/codegen/src/index.ts`. Importing it from Studio pulls the module graph — **but** `bundle-generator.ts` also exports `generateBundleZip` which does `await import('archiver')` / `'stream'`. Those are **dynamic** imports inside a function, so Vite will not eagerly bundle them, and the function is never called in the browser. Confirm the Studio build (`pnpm --filter @accumulate-studio/studio build`) does not try to resolve `archiver`. If Vite complains, add `archiver` and `stream` to `optimizeDeps.exclude` / mark them external in `apps/studio/vite.config.ts`, or split the Node zip helper into a separate entry not re-exported from `index.ts`.

## 6. Tests

### Unit — `apps/studio/src/services/export/bundle-to-zip.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { bundleToZipBytes } from './bundle-to-zip';
import type { Bundle } from '@accumulate-studio/codegen';

const fakeBundle: Bundle = {
  manifest: {} as any,
  files: [
    { path: 'README.md', content: '# hi', type: 'readme' },
    { path: 'generated/python/main.py', content: 'print(1)', type: 'code', language: 'python' },
  ],
};

describe('bundleToZipBytes', () => {
  it('round-trips every file path and content', () => {
    const zip = bundleToZipBytes(fakeBundle);
    const out = unzipSync(zip);
    expect(Object.keys(out).sort()).toEqual(['README.md', 'generated/python/main.py']);
    expect(strFromU8(out['generated/python/main.py'])).toBe('print(1)');
  });

  it('produces non-trivial bytes', () => {
    expect(bundleToZipBytes(fakeBundle).byteLength).toBeGreaterThan(0);
  });
});
```

### Integration — preview equals download

```ts
import { generateBundle } from '@accumulate-studio/codegen';
import { bundleToZipBytes } from './bundle-to-zip';
import { unzipSync } from 'fflate';

it('zip entries equal the bundle file list (preview parity)', async () => {
  const bundle = await generateBundle(sampleFlow, { languages: ['python'], includeAssertions: true, includeAgentFiles: true, network: 'testnet' });
  const entries = Object.keys(unzipSync(bundleToZipBytes(bundle))).sort();
  expect(entries).toEqual(bundle.files.map(f => f.path).sort());
});
```

### Manual checklist

- [ ] Export a Zero-to-Hero flow, Python only → downloads `<name>_bundle.zip`; unzip and confirm `generated/python/<name>/main.py` is the real engine-A output (matches preview pane and Studio code preview).
- [ ] Toggle assertions + agent files → zip gains `assertions/*` and `agent/*`; preview tree updates live.
- [ ] Preview tree paths exactly match `unzip -l` of the downloaded zip.
- [ ] Force an error (e.g. temporarily throw in `generateBundle`) → inline red error shows, modal stays open, no uncaught console crash.
- [ ] Open the production build (`vite build && vite preview`) and export — confirm no `Buffer is not defined` and no `archiver` resolution error.

## 7. Risks, rollback, out of scope

- **Risk:** Vite eagerly bundling the Node-only `generateBundleZip` via the shared `index.ts`. Mitigation in step 5.7 (dynamic imports stay lazy; externalize if needed). Cleanest long-term fix: move `generateBundleZip`/`generateBundleAsZip` out of `index.ts` into a `bundle-generator.node.ts` not re-exported.
- **Risk:** very large flows make the synchronous `zipSync` block the UI thread briefly. Acceptable for text bundles (KBs). If it ever matters, switch to `fflate`'s async `zip()` callback API.
- **Rollback:** revert `ExportModal.tsx` and remove the new service file + dependency; the old JSON placebo returns.
- **Out of scope:** the *content correctness* of generated files (owned by P0-2) and amount/precision semantics (P2-2). This task only guarantees the right files are zipped and downloaded.
