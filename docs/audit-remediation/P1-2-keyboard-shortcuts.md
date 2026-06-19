# [P1-2] — Wire real keyboard shortcuts + cheatsheet modal

| Field | Value |
| --- | --- |
| Priority | P1 |
| Severity | High |
| Effort | S (≈1 day) |
| Risk | Medium |
| Depends on | **P1-3** (single execution-state source for Ctrl/Cmd+Enter run) |
| Blocks | — |
| Primary files | `apps/studio/src/App.tsx`, `apps/studio/src/components/layout/Header.tsx` (tooltips), `apps/studio/src/components/modals/ShortcutsModal.tsx` (new), `apps/studio/src/components/modals/ModalContainer.tsx` |

---

## 1. Problem & impact

The Header advertises shortcuts that **do not exist**:

```tsx
// Header.tsx:514  (Undo button)
title="Undo (Ctrl+Z)"
// Header.tsx:527  (Redo button)
title="Redo (Ctrl+Shift+Z)"
```

But the only global key handler in the app handles `Ctrl+B / Ctrl+J / Ctrl+\``:

```tsx
// App.tsx:271-292
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); togglePalette(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'j') { e.preventDefault(); toggleCodePanel(); }
  if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggleExecutionPanel(); }
};
```

So **Ctrl+Z does nothing**, there is no **Delete-to-remove-node**, no **Ctrl+S save**, and no **Cmd/Ctrl+Enter run**. The tooltips are lies, and power users hit dead keys. There is also no discoverability surface (no cheatsheet).

Impact: broken advertised functionality, poor editing ergonomics, accidental browser-default behaviors (Ctrl+S opens the browser "save page" dialog).

## 2. Evidence (current code)

Store actions that already exist and are ready to wire (`flow-store.ts`):

```ts
// flow-store.ts:104-107  (FlowActions)
undo: () => void;
redo: () => void;
saveToHistory: () => void;
// flow-store.ts:61-62
removeNode: (nodeId: string) => void;
removeNodes: (nodeIds: string[]) => void;
```

```ts
// flow-store.ts:713-714  (selectors)
export const selectCanUndo = (state) => state.past.length > 0;
export const selectCanRedo = (state) => state.future.length > 0;
```

Selection state lives in the flow store (`flow-store.ts:31`): `selectedNodeIds: string[]` — populated by `selectNode` on canvas click (`FlowCanvas.tsx:437-442`).

Run path (from P1-3) is `executionEngine.executeFlow(flow)` via `handleExecuteFlow` (`App.tsx:198-204`). Save-to-file is `handleSaveFlow` (`Header.tsx:414-425`) but it lives in Header, not App.

Modal pattern to copy for the cheatsheet: `WelcomeModal.tsx` (Radix `Dialog.Root`/`Overlay`/`Content`, `:185-238`). Modal ids registered in `ModalContainer.tsx:15-22`.

`activeModal` to gate shortcuts: `useUIStore((s) => s.activeModal)` (`ui-store.ts:38`, set by `openModal`/`closeModal` `:143-144`).

## 3. Root cause

The global keydown handler was implemented for panel toggles only and never extended; the history/selection/execute actions were added to the store later but never bound to keys, and no input-focus/modal guard exists, which is why broader shortcuts were never safely added.

## 4. Target behavior & acceptance criteria

All shortcuts must be **suppressed** when the user is typing in an `<input>`, `<textarea>`, `[contenteditable]`, or `<select>`, OR when a modal is open (`activeModal !== null`). Exception: `Escape` and `?` cheatsheet behavior is handled by the modal itself, not the global handler.

- [ ] `Ctrl/Cmd+Z` → `undo()` (guarded). No-op when `!canUndo`.
- [ ] `Ctrl/Cmd+Shift+Z` **and** `Ctrl/Cmd+Y` → `redo()` (guarded). No-op when `!canRedo`.
- [ ] `Delete` or `Backspace` → remove currently selected node(s) via `removeNodes(selectedNodeIds)` (guarded; only when `selectedNodeIds.length > 0`).
- [ ] `Ctrl/Cmd+S` → save flow to JSON file; **`preventDefault()`** to suppress the browser save dialog (guarded).
- [ ] `Cmd/Ctrl+Enter` → execute the flow via the same handler the Execute button uses; **must respect P1-3 `isExecuting`** (no-op while running) and require `flow.nodes.length > 0`.
- [ ] `?` (Shift+/) → open the shortcuts cheatsheet modal (`openModal('shortcuts')`), guarded against input focus.
- [ ] Existing `Ctrl+B / Ctrl+J / Ctrl+\`` behavior is preserved.
- [ ] Header tooltips remain accurate (already say Ctrl+Z / Ctrl+Shift+Z; add Ctrl+S to Save, Ctrl+Enter to Execute).
- [ ] No shortcut fires while typing a flow name (`EditableFlowName` input, `Header.tsx:286-303`) or in any config field.
- [ ] Cheatsheet modal lists every shortcut, is dark-mode correct, and closes on Escape / overlay click.

## 5. Implementation steps

### Step 1 — Add a focus/modal guard helper + wire actions in `App.tsx`

The save-to-file logic currently lives only in Header. Extract it into a small shared util so the keyboard handler and Header both use it. Create `apps/studio/src/utils/save-flow.ts`:

```ts
import type { Flow } from '@accumulate-studio/types';

/** Download the flow as a .flow.json file (extracted from Header.handleSaveFlow). */
export function downloadFlowAsJson(flow: Flow): void {
  const content = JSON.stringify(flow, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${flow.name.toLowerCase().replace(/\s+/g, '_')}.flow.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

Then update `Header.handleSaveFlow` to call it (optional cleanup; keeps one source of truth):

**Before** (`Header.tsx:414-425`):
```tsx
const handleSaveFlow = useCallback(() => {
  const content = JSON.stringify(flow, null, 2);
  /* …blob/anchor… */
  URL.revokeObjectURL(url);
}, [flow]);
```

**After:**
```tsx
const handleSaveFlow = useCallback(() => {
  downloadFlowAsJson(flow);
}, [flow]);
```
(add `import { downloadFlowAsJson } from '../../utils/save-flow';` near the other imports in `Header.tsx`).

### Step 2 — Pull the needed store actions into `AppInner`

`App.tsx` already selects `flow`, `execution`, `togglePalette`, `toggleCodePanel`, `toggleExecutionPanel`, `openModal`, and `handleExecuteFlow`. Add the rest near the existing flow-store selectors (`App.tsx:127-129`):

```tsx
// App.tsx — add after `const execution = useFlowStore((state) => state.execution);`
const undo = useFlowStore((state) => state.undo);
const redo = useFlowStore((state) => state.redo);
const removeNodes = useFlowStore((state) => state.removeNodes);
const selectedNodeIds = useFlowStore((state) => state.selectedNodeIds);
const activeModal = useUIStore((state) => state.activeModal);
```
(`openModal` is already selected at `App.tsx:104`.)

Add the execution-state flag from P1-3 (single source of truth). If P1-3 exposes `executionEngine.getStatus()` via a store/selector, use that; the minimal interim is:

```tsx
const isExecuting = execution?.status === 'running';
```

### Step 3 — Replace the keydown effect

**Before** (`App.tsx:270-292`):
```tsx
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); togglePalette(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') { e.preventDefault(); toggleCodePanel(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggleExecutionPanel(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePalette, toggleCodePanel, toggleExecutionPanel]);
```

**After:**
```tsx
  // ---- Keyboard shortcuts ----
  // Returns true if focus is in an editable element (suppress global shortcuts).
  const isTypingTarget = useCallback((target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.isContentEditable === true
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      // Panel toggles work even while a modal is open, but NOT while typing.
      if (mod && !isTypingTarget(e.target)) {
        if (e.key === 'b') { e.preventDefault(); togglePalette(); return; }
        if (e.key === 'j') { e.preventDefault(); toggleCodePanel(); return; }
        if (e.key === '`') { e.preventDefault(); toggleExecutionPanel(); return; }
      }

      // Everything below is suppressed while typing OR while any modal is open.
      if (isTypingTarget(e.target) || activeModal !== null) return;

      // Undo / Redo
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
        return;
      }

      // Delete selected node(s)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.length > 0) {
        e.preventDefault();
        removeNodes(selectedNodeIds);
        return;
      }

      // Save flow to JSON (suppress browser "save page")
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadFlowAsJson(flow);
        return;
      }

      // Execute flow (respect isExecuting from P1-3)
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (!isExecuting && flow.nodes.length > 0) {
          handleExecuteFlow();
        }
        return;
      }

      // Open shortcuts cheatsheet
      if (e.key === '?') {
        e.preventDefault();
        openModal('shortcuts');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isTypingTarget,
    activeModal,
    togglePalette,
    toggleCodePanel,
    toggleExecutionPanel,
    undo,
    redo,
    removeNodes,
    selectedNodeIds,
    flow,
    isExecuting,
    handleExecuteFlow,
    openModal,
  ]);
```

Add `import { downloadFlowAsJson } from './utils/save-flow';` to `App.tsx` (note: App.tsx is at `apps/studio/src/App.tsx`, so the path is `./utils/save-flow`).

> **React Flow caveat:** React Flow has its own internal Backspace/Delete handler that fires `onNodesChange` with a `remove` change (already handled in `FlowCanvas.tsx:202-204`). To avoid double-removal, either (a) keep RF's deletion and DROP the Delete branch from this handler, OR (b) set `deleteKeyCode={null}` on the `<ReactFlow>` element (`FlowCanvas.tsx:463-483`) and rely solely on this global handler. **Recommended: option (b)** — set `deleteKeyCode={null}` so deletion is centralized and respects the modal/typing guard. Add this prop:
> ```tsx
> // FlowCanvas.tsx — inside <ReactFlow ...>
> deleteKeyCode={null}
> ```

### Step 4 — Create the cheatsheet modal

Create `apps/studio/src/components/modals/ShortcutsModal.tsx` (mirrors `WelcomeModal` structure):

```tsx
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Keyboard } from 'lucide-react';
import { cn } from '../ui';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD, 'Z'], label: 'Undo' },
  { keys: [MOD, 'Shift', 'Z'], label: 'Redo' },
  { keys: ['Delete'], label: 'Delete selected block(s)' },
  { keys: [MOD, 'S'], label: 'Save flow to file' },
  { keys: [MOD, 'Enter'], label: 'Execute flow' },
  { keys: [MOD, 'B'], label: 'Toggle Action Palette' },
  { keys: [MOD, 'J'], label: 'Toggle Code Panel' },
  { keys: [MOD, '`'], label: 'Toggle Execution Panel' },
  { keys: ['?'], label: 'Show this cheatsheet' },
];

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-2 py-1 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 min-w-[1.75rem] text-center">
    {children}
  </kbd>
);

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => (
  <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <Dialog.Portal>
      <Dialog.Overlay
        className={cn(
          'fixed inset-0 bg-black/50 backdrop-blur-sm',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
        )}
      />
      <Dialog.Content
        className={cn(
          'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]',
          'w-full max-w-md overflow-hidden',
          'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
          'border border-gray-200 dark:border-gray-700',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'duration-200'
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-accumulate-600 dark:text-accumulate-400" />
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Keyboard Shortcuts
            </Dialog.Title>
          </div>
          <Dialog.Close asChild>
            <button
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">
          A list of keyboard shortcuts available in Accumulate Studio
        </Dialog.Description>
        <ul className="px-6 py-4 space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <Key key={k}>{k}</Key>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
```

### Step 5 — Register the modal

In `ModalContainer.tsx`:

**Before** (`ModalContainer.tsx:15-22`):
```tsx
export const MODAL_IDS = {
  BLOCK_CONFIG: 'block-config',
  EXPORT: 'export',
  TEMPLATE_SELECT: 'template-select',
  EXECUTE_CONFIRM: 'execute-confirm',
  PREREQUISITE_ASSISTANT: 'prerequisite-assistant',
  WELCOME: 'welcome',
} as const;
```

**After:** add `SHORTCUTS: 'shortcuts',` to the object, import `ShortcutsModal`, and render it next to the WelcomeModal:

```tsx
import { ShortcutsModal } from './ShortcutsModal';
// …
      <WelcomeModal isOpen={activeModal === MODAL_IDS.WELCOME} onClose={handleClose} />
      <ShortcutsModal isOpen={activeModal === MODAL_IDS.SHORTCUTS} onClose={handleClose} />
```

### Step 6 — Tooltip accuracy in Header

Add the new shortcuts to the relevant button tooltips:

- `Header.tsx:558` Save button: `title="Save Flow (JSON) — Ctrl+S"` (use ⌘ note if you want platform-specific; literal `Ctrl+S` is acceptable).
- `Header.tsx:613-626` Execute button: append `(Ctrl+Enter)` to the title or add a `title="Execute (Ctrl+Enter)"`.

## 6. Tests

### Component test — `apps/studio/src/components/__tests__/ShortcutsModal.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsModal } from '../modals/ShortcutsModal';

describe('ShortcutsModal', () => {
  it('lists core shortcuts', () => {
    render(<ShortcutsModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Undo')).toBeDefined();
    expect(screen.getByText('Execute flow')).toBeDefined();
    expect(screen.getByText('Delete selected block(s)')).toBeDefined();
  });
  it('calls onClose from the close button', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
```

### Handler unit test (extract optional)

The keydown logic is easiest to test by dispatching events at `window` after rendering `<AppInner>` with mocked stores, but `App.tsx` mounts the full tree. Prefer a focused test on the **guard helper** by exporting `isTypingTarget` (or moving it to `utils/`). Example:

```tsx
import { fireEvent } from '@testing-library/react';
// render an app harness with mocked store actions, then:
it('does not undo while typing in an input', () => {
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(mockUndo).not.toHaveBeenCalled();
});
it('undoes on Ctrl+Z when not typing and no modal open', () => {
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(mockUndo).toHaveBeenCalled();
});
```

### Manual QA checklist

- [ ] Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo & redo node adds/moves.
- [ ] Select a node, press Delete → it's removed; press Backspace → same.
- [ ] Focus the flow-name field, press Delete/Backspace → edits text, does NOT delete a node.
- [ ] Ctrl+S downloads a `.flow.json` and the browser's save dialog does **not** appear.
- [ ] Ctrl+Enter starts execution; pressing it again mid-run does nothing (P1-3).
- [ ] Press `?` → cheatsheet opens; Escape closes it; while it's open, Ctrl+Z does nothing.
- [ ] On macOS, ⌘ variants work (metaKey path).
- [ ] Ctrl+B/J/\` still toggle panels.

## 7. Risks, rollback, out of scope

- **Risk — double delete:** if `deleteKeyCode={null}` is NOT set, both this handler and React Flow delete the node, and one of the two `removeNodes` calls operates on already-removed ids (harmless but noisy in history). Set `deleteKeyCode={null}` (Step 3 note).
- **Risk — Backspace navigation:** some browsers map Backspace to "back". `preventDefault()` in the Delete branch mitigates, but only fires when a node is selected; acceptable.
- **Depends on P1-3:** the `isExecuting` flag must be a real single source of truth, otherwise Ctrl+Enter can re-trigger a run mid-execution. Implement P1-3 first or use `execution?.status === 'running'` as the interim guard (already shown).
- **Rollback:** revert `App.tsx` keydown effect, remove `ShortcutsModal.tsx`, remove its registration and the `SHORTCUTS` id, revert tooltip edits.
- **Out of scope:** customizable/remappable shortcuts, Ctrl+A select-all, copy/paste of nodes, multi-select marquee.
