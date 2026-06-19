# P2-3 — UX Polish: Feedback, Native Dialogs, Click-to-Append Parity, Dead State, Editor Theme

| Field | Value |
| --- | --- |
| Priority | P2 |
| Severity | Medium |
| Effort | M |
| Risk | Low–Medium (one new shared component; touches Header, CodePanel, BlockItem, ui-store, ExecutionPanel) |
| Depends on | None |
| Blocks | P2-4 (a11y reuses the Radix-dialog pattern), P3-4 (Monaco theme sync cross-referenced here) |
| Primary files | `apps/studio/src/components/code-panel/CodePanel.tsx`, `apps/studio/src/components/layout/Header.tsx`, `apps/studio/src/components/palette/BlockItem.tsx`, `apps/studio/src/store/ui-store.ts`, `apps/studio/src/components/execution/ExecutionPanel.tsx`, `apps/studio/src/components/ui/ConfirmDialog.tsx` (new), `apps/studio/src/components/ui/index.ts` |

This is a multi-part polish doc. Each part (A–E) stands alone with its own evidence + steps and can be shipped independently. Parts A and B both consume the app's existing `ToastProvider` / new `ConfirmDialog`; do Part B's "create ConfirmDialog" step first if shipping B and the import parts together.

---

## 1. Problem & impact

1. **Silent success actions.** Copy / Download in the CodePanel and Save / Import in the Header complete with zero user feedback. The code even admits the gap with a `// Could add a toast notification here` comment. Users cannot tell whether a copy or save succeeded. A fully wired `ToastProvider` already exists and is already used for execution events, so this is pure under-utilization.
2. **Native `alert()` / `window.confirm()`.** The Header uses browser-native dialogs for import validation, "replace flow", "new flow", and "clear canvas". These are unstyled, break the Radix/Tailwind design language, are not theme-aware, block the JS thread, and cannot be unit-tested or keyboard-styled like the rest of the app's modals.
3. **Click-to-append bypasses the prerequisite assistant.** Dragging a block to the canvas runs `findBestAttachmentNode` / `getPrerequisiteRecipe` and can open the `PrerequisiteAssistantModal`. Clicking the same block in the palette just appends it raw with no prerequisite analysis — so the two documented placement methods produce different flows, and click-users silently get invalid flows (missing credits, missing ADI, etc.).
4. **Dead store state.** `ui-store` declares `executionTab` + `setExecutionTab` and `showTemplateGallery` + `setShowTemplateGallery`, but nothing consumes them: `ExecutionPanel` keeps its own local `useState('log')`. Worse, the store's union type uses `'state-diff'` while the panel's actual tab value is `'state'` — a latent mismatch that guarantees the store value could never drive the panel correctly even if wired. This is dead/incorrect code that misleads maintainers.
5. **Monaco theme hard-coded.** The editor is always `theme="vs-dark"` regardless of the app's light/dark setting, so in light mode the code panel is a jarring dark rectangle.

**Impact:** perceived unresponsiveness, broken visual consistency, divergent flow-construction behavior, and confusing dead code.

---

## 2. Evidence (current code)

**A — Silent copy/download (`CodePanel.tsx:37-44`, `:47-66`):**
```tsx
  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
```
Header `handleSaveFlow` (`Header.tsx:414-425`) and `handleFileSelected` (`Header.tsx:362-403`) likewise return with no toast on success.

**B — Native dialogs (`Header.tsx`):**
```tsx
377:          alert('Invalid flow file: missing required fields (version, nodes).');
383:          const proceed = window.confirm(
384:            `Flow has validation issues:\n${validation.errors.join('\n')}\n\nLoad anyway?`
385:          );
390:          const proceed = window.confirm('Replace current flow with imported flow?');
396:        alert('Failed to parse flow file. Please ensure it is valid JSON.');
475:            if (flow.nodes.length === 0 || window.confirm('Clear current flow and start new? This cannot be undone.')) {
489:            if (flow.nodes.length > 0 && window.confirm('Remove all blocks from the canvas?')) {
```

**C — Click-to-append bypasses prerequisites (`BlockItem.tsx:84-124`):**
```tsx
  // Click-to-add: append block to the end of the flow (skip if we just dragged)
  const handleClick = () => {
    if (didDrag.current) { didDrag.current = false; return; }
    const VERTICAL_GAP = 160;
    // Find tail nodes (no outgoing connections)
    const nodesWithOutgoing = new Set(flow.connections.map((c) => c.sourceNodeId));
    const tailNodes = flow.nodes.filter((n) => !nodesWithOutgoing.has(n.id));
    if (tailNodes.length > 0) {
      const lowestTail = tailNodes.reduce(/* ... */);
      const nodeId = addNode(block.type as BlockType, position);
      addConnection(lowestTail.id, 'output', nodeId, 'input');
    } /* ... */ else {
      addNode(block.type as BlockType, { x: 0, y: 0 });
    }
  };
```
Contrast with the drop path (`FlowCanvas.tsx:376-429`) which runs `findBestAttachmentNode` and opens `prerequisite-assistant` when `attachment.remainingRecipe.length > 0`.

**D — Dead store state (`ui-store.ts:35`, `:42`, `:66`, `:73`, `:140`, `:147`):**
```ts
35:  executionTab: 'log' | 'state-diff' | 'receipt' | 'synthetic';
42:  showTemplateGallery: boolean;
66:  setExecutionTab: (tab: 'log' | 'state-diff' | 'receipt' | 'synthetic') => void;
73:  setShowTemplateGallery: (show: boolean) => void;
```
The panel ignores all of it (`ExecutionPanel.tsx:28`):
```tsx
  const [activeTab, setActiveTab] = React.useState('log');
```
…and uses `value="state"` (not `'state-diff'`) at `ExecutionPanel.tsx:134`:
```tsx
          <Tabs.Trigger value="state" /* ... */>State Diff</Tabs.Trigger>
```

**E — Monaco hard-coded (`CodePanel.tsx:146`):**
```tsx
            theme="vs-dark"
```

---

## 3. Root cause

A `ToastProvider`/`useToast` hook (`apps/studio/src/components/ui/Toast.tsx`) and a Radix-`Dialog` modal convention (`components/modals/*`) both already exist, but the listed call-sites predate or skipped them. Click-to-append was implemented as a quick "append to tail" helper before the prerequisite engine existed and was never refactored to share the drop logic. The `executionTab`/`showTemplateGallery` store fields were scaffolded for a planned wiring that never landed, leaving dead members and a value-string drift. Monaco's `theme` prop was hard-coded during the initial code-panel build.

---

## 4. Target behavior & acceptance criteria

- [ ] **A.** Copy shows a success toast ("Copied to clipboard"); copy failure shows an error toast. Download shows a success toast with the filename. Save (Header) shows a success toast with the filename. Import success shows a success toast; all import failure/validation messages become error/warning toasts (Part B handles the *confirm* prompts).
- [ ] **B.** No `window.alert` or `window.confirm` remains in `Header.tsx` (`grep -n "window.confirm\|alert(" Header.tsx` returns nothing). Import "replace?", "validation issues — load anyway?", "new flow", and "clear canvas" all use a reusable `ConfirmDialog` rendered through the app's Radix dialog convention. Invalid-file and parse-error cases use error toasts (no blocking dialog needed).
- [ ] **C.** Clicking a palette block runs the *same* attachment + prerequisite path as drop: it calls `findBestAttachmentNode` / `getPrerequisiteRecipe`, opens `prerequisite-assistant` when prerequisites are missing, and opens `block-config` when the placed block is fully satisfied and has config. The drag-suppression guard (`didDrag`) is preserved.
- [ ] **D.** Either (recommended) the dead `executionTab`/`showTemplateGallery` fields + setters are deleted from `ui-store.ts`, **or** `ExecutionPanel` is wired to the store with the value-string corrected to `'state'`. This doc specs the **delete** option as primary and the **wire** option as an alternative.
- [ ] **E.** Monaco `theme` is `'vs-dark'` when the app resolves to dark and `'light'` when light, updating live when the user toggles theme.
- [ ] No new TypeScript or ESLint errors; `pnpm --filter @accumulate-studio/studio build` passes.

---

## 5. Implementation steps

### Part B (do first if shipping with A): create the reusable `ConfirmDialog`

**5.B.1 — New file `apps/studio/src/components/ui/ConfirmDialog.tsx`.** Follows the existing Radix-`Dialog` + Tailwind convention used by `WelcomeModal.tsx` / `TemplateSelectModal.tsx`.

```tsx
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button uses the destructive variant. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => (
  <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
    <Dialog.Portal>
      <Dialog.Overlay
        className={cn(
          'fixed inset-0 bg-black/50 backdrop-blur-sm z-50',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
        )}
      />
      <Dialog.Content
        className={cn(
          'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
          'w-full max-w-md p-6',
          'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
          'border border-gray-200 dark:border-gray-700',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'duration-200'
        )}
        onEscapeKeyDown={onCancel}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Dialog.Title className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description asChild>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">
                  {description}
                </div>
              </Dialog.Description>
            )}
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
```
> Note: `Button` already supports the `destructive` variant (used in `ExecutionPanel.tsx:77`). If your local `Button` does not, fall back to `variant="primary"` and add `className="bg-red-600 hover:bg-red-700"`.

**5.B.2 — Export it (`apps/studio/src/components/ui/index.ts`):**

Before:
```ts
export { cn } from './cn';
export { Button } from './Button';
export { ErrorBoundary } from './ErrorBoundary';
export { ToastProvider, useToast } from './Toast';
export type { ToastType } from './Toast';
```
After:
```ts
export { cn } from './cn';
export { Button } from './Button';
export { ErrorBoundary } from './ErrorBoundary';
export { ToastProvider, useToast } from './Toast';
export type { ToastType } from './Toast';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';
```

**5.B.3 — Wire `ConfirmDialog` into `Header.tsx`.** The Header has several confirm points that are *async* (import file reader) and several sync (new/clear). Use a small local "pending confirm" state object so one dialog instance serves them all.

Add imports (`Header.tsx:19`):
```tsx
import { cn, Button, ConfirmDialog, useToast } from '../ui';
```

Inside `Header` component body, after the existing store hooks (around `Header.tsx:356`), add:
```tsx
  const { addToast } = useToast();

  // Single reusable confirm dialog driven by a pending-action descriptor.
  const [confirm, setConfirm] = useState<{
    title: string;
    description?: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const closeConfirm = useCallback(() => setConfirm(null), []);
```

**5.B.4 — Replace the import flow's native dialogs.** Because `FileReader.onload` is a callback, convert the chained `window.confirm` prompts into nested `ConfirmDialog` invocations.

Before (`Header.tsx:362-403`):
```tsx
  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const flowData: Flow = parsed.flow ?? parsed;
        if (!flowData.version || !flowData.nodes || !Array.isArray(flowData.nodes)) {
          alert('Invalid flow file: missing required fields (version, nodes).');
          return;
        }
        const validation = validateFlow(flowData);
        if (!validation.valid) {
          const proceed = window.confirm(
            `Flow has validation issues:\n${validation.errors.join('\n')}\n\nLoad anyway?`
          );
          if (!proceed) return;
        }
        if (flow.nodes.length > 0) {
          const proceed = window.confirm('Replace current flow with imported flow?');
          if (!proceed) return;
        }
        loadFlow(flowData);
      } catch {
        alert('Failed to parse flow file. Please ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [flow.nodes.length, loadFlow]);
```
After:
```tsx
  // Final commit step shared by the confirm chain below.
  const commitImport = useCallback((flowData: Flow) => {
    loadFlow(flowData);
    addToast({ type: 'success', title: 'Flow imported', description: flowData.name });
  }, [loadFlow, addToast]);

  // Step 2: optionally confirm replacing the current flow, then commit.
  const importWithReplaceCheck = useCallback((flowData: Flow) => {
    if (flow.nodes.length > 0) {
      setConfirm({
        title: 'Replace current flow?',
        description: 'Importing will discard the flow currently on the canvas.',
        confirmLabel: 'Replace',
        destructive: true,
        onConfirm: () => { closeConfirm(); commitImport(flowData); },
      });
    } else {
      commitImport(flowData);
    }
  }, [flow.nodes.length, commitImport, closeConfirm]);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const flowData: Flow = parsed.flow ?? parsed;

        if (!flowData.version || !flowData.nodes || !Array.isArray(flowData.nodes)) {
          addToast({
            type: 'error',
            title: 'Invalid flow file',
            description: 'Missing required fields (version, nodes).',
          });
          return;
        }

        const validation = validateFlow(flowData);
        if (!validation.valid) {
          // Step 1: surface validation issues, ask to proceed.
          setConfirm({
            title: 'Flow has validation issues',
            description: `${validation.errors.join('\n')}\n\nLoad anyway?`,
            confirmLabel: 'Load anyway',
            destructive: true,
            onConfirm: () => { closeConfirm(); importWithReplaceCheck(flowData); },
          });
          return;
        }
        importWithReplaceCheck(flowData);
      } catch {
        addToast({
          type: 'error',
          title: 'Could not parse flow file',
          description: 'Please ensure the file is valid JSON.',
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [addToast, validateFlow, importWithReplaceCheck, closeConfirm]);
```
> `validateFlow` is an imported function, not reactive — listing it in deps is harmless but optional; keep ESLint happy by leaving it out if your config flags it.

**5.B.5 — Replace New Flow / Clear Canvas native confirms.**

Before (`Header.tsx:473-503`):
```tsx
          <button
            onClick={() => {
              if (flow.nodes.length === 0 || window.confirm('Clear current flow and start new? This cannot be undone.')) {
                newFlow();
              }
            }}
            /* ... */
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (flow.nodes.length > 0 && window.confirm('Remove all blocks from the canvas?')) {
                clearCanvas();
              }
            }}
            disabled={flow.nodes.length === 0}
            /* ... */
          >
            <Trash2 className="w-4 h-4" />
          </button>
```
After:
```tsx
          <button
            onClick={() => {
              if (flow.nodes.length === 0) {
                newFlow();
              } else {
                setConfirm({
                  title: 'Start a new flow?',
                  description: 'This clears the current flow and cannot be undone.',
                  confirmLabel: 'New Flow',
                  destructive: true,
                  onConfirm: () => { closeConfirm(); newFlow(); },
                });
              }
            }}
            /* ... unchanged className/title ... */
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (flow.nodes.length > 0) {
                setConfirm({
                  title: 'Clear the canvas?',
                  description: 'This removes all blocks from the canvas.',
                  confirmLabel: 'Clear',
                  destructive: true,
                  onConfirm: () => { closeConfirm(); clearCanvas(); },
                });
              }
            }}
            disabled={flow.nodes.length === 0}
            /* ... unchanged className/title ... */
          >
            <Trash2 className="w-4 h-4" />
          </button>
```

**5.B.6 — Render the dialog once.** Inside the returned `<header>…</header>`, add the dialog as the last child right before `</header>` (`Header.tsx:628`):
```tsx
      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onConfirm={confirm.onConfirm}
          onCancel={closeConfirm}
        />
      )}
```

### Part A: success/failure toasts

**5.A.1 — CodePanel.** Add the hook + toast calls.

`CodePanel.tsx:5` import line — add `useToast`:
```tsx
import { cn, Button, useToast } from '../ui';
```
In the component body (after `CodePanel.tsx:29`):
```tsx
  const { addToast } = useToast();
```
Replace `handleCopy` (`CodePanel.tsx:37-44`):
```tsx
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      addToast({ type: 'success', title: 'Copied to clipboard' });
    } catch (err) {
      console.error('Failed to copy:', err);
      addToast({ type: 'error', title: 'Copy failed', description: 'Clipboard access was blocked.' });
    }
  };
```
At the end of `handleDownload` (after `URL.revokeObjectURL(url);`, `CodePanel.tsx:65`):
```tsx
    URL.revokeObjectURL(url);
    addToast({ type: 'success', title: 'Code downloaded', description: a.download });
```
> `a.download` is in scope at that point (set at line 61).

**5.A.2 — Header Save.** At the end of `handleSaveFlow` (after `URL.revokeObjectURL(url);`, `Header.tsx:424`):
```tsx
    URL.revokeObjectURL(url);
    addToast({ type: 'success', title: 'Flow saved', description: a.download });
```
> The Header `addToast` was already added in 5.B.3. If shipping Part A *without* Part B, add `const { addToast } = useToast();` and the `useToast` import (`Header.tsx:19`) independently.

The import success toast is already covered by `commitImport` in 5.B.4.

### Part C: route click-to-append through the prerequisite path

**5.C.1 — `BlockItem.tsx`.** Replace the bespoke append logic with the same calls the drop handler uses. Add the imports the canvas uses.

Add to the imports block (`BlockItem.tsx:27-30`):
```tsx
import { cn } from '../ui';
import type { BlockDefinition, BlockType } from '@accumulate-studio/types';
import { BLOCK_CATALOG, PREREQUISITE_GRAPH } from '@accumulate-studio/types';
import { useFlowStore, useUIStore } from '../../store';
import { getPrerequisiteRecipe, findBestAttachmentNode } from '../../services/prerequisite-engine';
```
Add the modal opener to the hooks (`BlockItem.tsx:63-66`):
```tsx
  const setDragging = useFlowStore((state) => state.setDragging);
  const addNode = useFlowStore((state) => state.addNode);
  const addConnection = useFlowStore((state) => state.addConnection);
  const flow = useFlowStore((state) => state.flow);
  const openModal = useUIStore((state) => state.openModal);
```
Replace `handleClick` (`BlockItem.tsx:84-124`) entirely:
```tsx
  // Click-to-add: mirror the drag-drop attachment + prerequisite logic so both
  // placement paths produce identical flows. (skip if we just dragged)
  const handleClick = () => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    const blockType = block.type as BlockType;
    const VERTICAL_GAP = 160;

    // ---- Smart attachment to tail nodes (mirrors FlowCanvas onDrop Priority 2) ----
    const attachment = findBestAttachmentNode(blockType, flow);

    if (attachment.score > 0 && attachment.attachToNodeId) {
      const attachNode = flow.nodes.find((n) => n.id === attachment.attachToNodeId);
      const attachPosition = attachNode?.position ?? { x: 0, y: 0 };
      const targetPosition = {
        x: attachPosition.x,
        y: attachPosition.y + (attachment.remainingRecipe.length + 1) * VERTICAL_GAP,
      };
      const nodeId = addNode(blockType, targetPosition);

      if (attachment.remainingRecipe.length === 0) {
        addConnection(attachment.attachToNodeId, 'output', nodeId, 'input');
        const blockDef = BLOCK_CATALOG[blockType];
        if (blockDef && Object.keys(blockDef.configSchema.properties || {}).length > 0) {
          openModal('block-config', { nodeId, blockType });
        }
      } else {
        openModal('prerequisite-assistant', {
          targetNodeId: nodeId,
          targetBlockType: blockType,
          recipe: attachment.remainingRecipe,
          targetPosition,
          attachToNodeId: attachment.attachToNodeId,
          attachmentPosition: attachPosition,
        });
      }
      return;
    }

    // ---- No attachment found — fall back (mirrors FlowCanvas onDrop else branch) ----
    const recipe = getPrerequisiteRecipe(blockType, flow);

    // Append below the lowest existing node (or origin for an empty flow).
    const basePosition =
      flow.nodes.length > 0
        ? flow.nodes.reduce((lowest, n) => (n.position.y > lowest.position.y ? n : lowest), flow.nodes[0]).position
        : { x: 0, y: 0 };
    const targetPosition =
      flow.nodes.length > 0
        ? { x: basePosition.x, y: basePosition.y + VERTICAL_GAP }
        : { x: 0, y: 0 };

    const nodeId = addNode(blockType, targetPosition);

    if (recipe.length > 0) {
      openModal('prerequisite-assistant', {
        targetNodeId: nodeId,
        targetBlockType: blockType,
        recipe,
        targetPosition,
        attachToNodeId: null,
        attachmentPosition: null,
      });
    } else {
      const blockDef = BLOCK_CATALOG[blockType];
      if (blockDef && Object.keys(blockDef.configSchema.properties || {}).length > 0) {
        openModal('block-config', { nodeId, blockType });
      }
    }
  };
```
> The `prereqRule` / `requiresCount` badge logic (`BlockItem.tsx:68-69`) is unchanged. `PREREQUISITE_GRAPH` is still imported.

### Part D: remove dead store state (recommended) OR wire the panel

**5.D.1 (recommended — DELETE).** In `ui-store.ts`, remove the four dead members.

- Delete the `executionTab` field (`ui-store.ts:34-35`):
```ts
  // Execution panel tab
  executionTab: 'log' | 'state-diff' | 'receipt' | 'synthetic';
```
- Delete the `showTemplateGallery` field (`ui-store.ts:41-42`):
```ts
  // Template gallery
  showTemplateGallery: boolean;
```
- Delete `setExecutionTab` from the actions interface (`ui-store.ts:65-66`):
```ts
  // Execution panel
  setExecutionTab: (tab: 'log' | 'state-diff' | 'receipt' | 'synthetic') => void;
```
- Delete `setShowTemplateGallery` from the actions interface (`ui-store.ts:72-73`):
```ts
  // Template gallery
  setShowTemplateGallery: (show: boolean) => void;
```
- Delete the two from `initialState` (`ui-store.ts:96`, `:99`):
```ts
  executionTab: 'log',
  /* ... */
  showTemplateGallery: false,
```
- Delete the two action implementations (`ui-store.ts:139-140`, `:146-147`):
```ts
      // Execution panel
      setExecutionTab: (tab) => set({ executionTab: tab }),
      /* ... */
      // Template gallery
      setShowTemplateGallery: (show) => set({ showTemplateGallery: show }),
```
Neither field is in `partialize` (`ui-store.ts:176-187`), so persistence is unaffected and **no migration bump is needed**. After deletion, run `grep -rn "executionTab\|showTemplateGallery\|setExecutionTab\|setShowTemplateGallery" apps/studio/src` to confirm zero remaining references.

**5.D.2 (alternative — WIRE).** If the team prefers a persisted tab instead, keep the fields but fix the value drift and connect the panel:
- In `ui-store.ts` change every `'state-diff'` to `'state'` (`:35` and `:66`) so the union matches the panel's actual `value="state"`.
- In `ExecutionPanel.tsx:28`, replace local state:
```tsx
  const activeTab = useUIStore((s) => s.executionTab);
  const setActiveTab = useUIStore((s) => s.setExecutionTab);
```
and add `import { useUIStore } from '../../store';` plus typing the union to `ExecutionPanel`'s tab ids. (Do **not** do both 5.D.1 and 5.D.2.) Recommendation: **5.D.1 (delete)** — the tab is ephemeral UI and not worth persisting; deleting removes the bug surface entirely.

### Part E: sync Monaco theme

**5.E.1 — `CodePanel.tsx`.** Resolve the app theme and pass it to the editor. The app stores `theme: 'light' | 'dark' | 'system'` and toggles `document.documentElement.classList` on `'dark'` (see `App.tsx:216-235`).

Add a `theme` selector to the existing UI-store reads (`CodePanel.tsx:25-28`):
```tsx
  const selectedLanguage = useUIStore((state) => state.selectedLanguage);
  const setSelectedLanguage = useUIStore((state) => state.setSelectedLanguage);
  const codeMode = useUIStore((state) => state.codeMode);
  const setCodeMode = useUIStore((state) => state.setCodeMode);
  const theme = useUIStore((state) => state.theme);
```
Compute the resolved Monaco theme (after the `generatedCode` memo, ~`CodePanel.tsx:34`):
```tsx
  // Resolve 'system' against the OS preference; mirrors App.tsx applyTheme().
  const monacoTheme = useMemo(() => {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    return isDark ? 'vs-dark' : 'light';
  }, [theme]);
```
Replace the hard-coded prop (`CodePanel.tsx:146`):
```tsx
            theme={monacoTheme}
```
> Cross-reference: P3-4 also references this Monaco theme sync — implement it **here** in P2-3; P3-4 must not duplicate the change.

---

## 6. Tests

**Component / unit tests** (`apps/studio/src/components/**/__tests__`, Vitest + React Testing Library):

1. `ConfirmDialog.test.tsx`: renders title/description when `open`; clicking the confirm button calls `onConfirm`; clicking cancel and pressing Escape call `onCancel`; `destructive` renders the warning icon and a destructive-styled confirm button.
2. `CodePanel.test.tsx`: mock `navigator.clipboard.writeText` to resolve → assert `addToast` called with `type: 'success'`; mock it to reject → assert `type: 'error'`. Wrap render in `<ToastProvider>` (or mock `useToast`).
3. `Header.test.tsx`: simulate New Flow click with a non-empty flow → assert `ConfirmDialog` appears and `newFlow` is NOT called until confirm is clicked. Simulate import of a JSON with missing `version` → assert an error toast and that `loadFlow` is not called.
4. `BlockItem.test.tsx`: render with a store flow that lacks prerequisites for a block requiring them → click → assert `openModal` called with `'prerequisite-assistant'`. Render with prerequisites satisfied + a configurable block → click → assert `openModal('block-config', …)`. Assert `addNode` is called exactly once per click.
5. `ui-store.test.ts` (delete path): assert `useUIStore.getState()` has no `executionTab`/`showTemplateGallery` keys (TS compile is the real guard).

**Manual QA checklist:**
- [ ] Copy in CodePanel → green "Copied to clipboard" toast; paste verifies content.
- [ ] Download → file downloads + toast names the file.
- [ ] Save (Header) → `.flow.json` downloads + toast.
- [ ] Import a valid flow over a non-empty canvas → "Replace current flow?" Radix dialog, not browser confirm; Cancel keeps current flow; Replace loads + success toast.
- [ ] Import a malformed JSON → error toast, no dialog, canvas unchanged.
- [ ] New Flow / Clear Canvas with blocks present → styled confirm dialog; Escape and Cancel both abort.
- [ ] Click "Add Credits" (which requires a credit source) in the palette on an empty canvas → prerequisite-assistant opens (same as dragging it).
- [ ] Toggle theme light/dark → code editor background switches immediately.
- [ ] `grep -n "window.confirm\|alert(" Header.tsx` → no matches.

---

## 7. Risks, rollback, out of scope

- **Risk — async confirm chain (import).** The import nests two confirm steps via state. Verify the "validation issues → replace?" double-prompt sequences correctly (confirm 1 closes, then confirm 2 opens). The `closeConfirm()` inside each `onConfirm` before the next `setConfirm` prevents a flash of stale content.
- **Risk — click vs. drag regression.** Keep the `didDrag` guard; a drag that ends as a click must still no-op. Test rapid drag-then-click.
- **Risk — Monaco `system` theme.** Resolving `'system'` reads `matchMedia` once on render; it updates when `theme` changes but not on a live OS switch while `theme==='system'`. Acceptable (matches the app's own non-listener behavior in CodePanel); a `matchMedia` listener is **out of scope** here.
- **Rollback:** each part is isolated. Revert any single part's diff without affecting the others; `ConfirmDialog.tsx` can remain unused if Part B is reverted.
- **Out of scope:** replacing the `NetworkStatusIndicator`/`NetworkSelector` custom dropdowns (P2-4), live code regeneration (P3-4), template thumbnails (P3-2), and adding a global OS-theme `matchMedia` listener to Monaco.
