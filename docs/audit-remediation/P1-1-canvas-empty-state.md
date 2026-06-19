# [P1-1] — Canvas empty-state overlay ("Start from Scratch" dead-end)

| Field | Value |
| --- | --- |
| Priority | P1 |
| Severity | High |
| Effort | S (≈0.5 day) |
| Risk | Low |
| Depends on | — |
| Blocks | — |
| Primary files | `apps/studio/src/components/flow-builder/FlowCanvas.tsx` |

---

## 1. Problem & impact

When a new user chooses **"Start from Scratch"** in `WelcomeModal` (`apps/studio/src/components/modals/WelcomeModal.tsx:171-174`), the modal closes and the user is dropped onto a completely blank React Flow canvas with **zero affordances**. The only on-canvas guidance lives in the palette footer ("Click to append or drag onto an edge to insert", `ActionPalette.tsx:155-156`) which is easy to miss and, on small screens where the palette is collapsed, invisible.

`FlowCanvas.tsx` has **no empty-state branch**. The render path (`FlowCanvas.tsx:458-534`) always mounts `<ReactFlow>` with whatever `nodes` exist; when `flow.nodes.length === 0` the canvas is just a dot grid. There is no headline, no call to action, and no link to the Golden Path templates — the single highest-value starting point in the product.

Impact: first-run drop-off. Users who pick "Scratch" (the lower-commitment option) get the worst onboarding.

## 2. Evidence (current code)

The canvas renders unconditionally — there is no `flow.nodes.length === 0` overlay anywhere:

```tsx
// FlowCanvas.tsx:458-462
return (
  <div
    ref={reactFlowWrapper}
    className="flex-1 h-full bg-gray-100 dark:bg-gray-950"
  >
```

The only "drop zone" hint is gated on an in-progress drag, so it never shows at rest:

```tsx
// FlowCanvas.tsx:525-532
{/* Drop zone indicator */}
{isDragging && draggedBlockType && (
  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
    <div className="bg-accumulate-500/10 border-2 border-dashed border-accumulate-500 rounded-xl p-8 text-accumulate-600 dark:text-accumulate-400 font-medium">
      Drop to add {BLOCK_CATALOG[draggedBlockType]?.name}
    </div>
  </div>
)}
```

`openModal` is already wired into this component and used by the drop handler, so we can reuse it for the CTA:

```tsx
// FlowCanvas.tsx:180
const openModal = useUIStore((state) => state.openModal);
```

The template modal id is `'template-select'` (confirmed in `ModalContainer.tsx:18` → `TEMPLATE_SELECT: 'template-select'` and used by `ActionPalette.tsx:66` `openModal('template-select')`).

## 3. Root cause

`FlowCanvas` was written to render the graph but never got an "empty graph" UI state. The Welcome flow funnels users here expecting guidance that does not exist.

## 4. Target behavior & acceptance criteria

- [ ] When `flow.nodes.length === 0`, a centered ghost-card overlay is visible over the canvas.
- [ ] The overlay shows a headline ("Start building your flow") and a sub-line ("Drag a block from the left, or load a Golden Path template").
- [ ] A **primary** button "Browse Templates" calls `openModal('template-select')`.
- [ ] A secondary hint references the palette (e.g. "or drag a block from the Action Palette").
- [ ] The overlay container is `pointer-events-none` so canvas pan/zoom/drop still works; only the button is interactive (`pointer-events-auto`).
- [ ] The overlay disappears the instant the first node is added (driven purely by `flow.nodes.length`).
- [ ] Correct in dark mode (uses the same `dark:` token palette as neighboring components).
- [ ] Does not render during an active drag is acceptable but NOT required — it may stay; the drop-zone indicator (`isDragging`) layers on top.
- [ ] No regression: existing nodes render exactly as before when `length > 0`.

## 5. Implementation steps

### Step 1 — Add the icon import

`FlowCanvas.tsx` already imports `LayoutGrid` from lucide-react (line 20). Add `Sparkles` and `MousePointerClick` alongside it.

**Before** (`FlowCanvas.tsx:20`):
```tsx
import { LayoutGrid } from 'lucide-react';
```

**After:**
```tsx
import { LayoutGrid, Sparkles, MousePointerClick } from 'lucide-react';
```

### Step 2 — Add the empty-state overlay JSX

Insert the overlay as a sibling of the existing drop-zone indicator, inside the outer `<div ref={reactFlowWrapper}>` but **after** `</ReactFlow>` so it paints on top of the canvas. Place it immediately before the existing `{/* Drop zone indicator */}` block.

**Before** (`FlowCanvas.tsx:524-532`):
```tsx
      </ReactFlow>

      {/* Drop zone indicator */}
      {isDragging && draggedBlockType && (
```

**After:**
```tsx
      </ReactFlow>

      {/* Empty-state overlay — only when the flow has no nodes */}
      {flow.nodes.length === 0 && !isDragging && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
          <div
            className={cn(
              'pointer-events-auto max-w-md w-full text-center',
              'rounded-2xl border-2 border-dashed',
              'border-gray-300 dark:border-gray-700',
              'bg-white/70 dark:bg-gray-900/60 backdrop-blur-sm',
              'shadow-sm px-8 py-10'
            )}
          >
            <div className="mx-auto mb-4 w-12 h-12 rounded-xl flex items-center justify-center bg-accumulate-100 dark:bg-accumulate-900/30">
              <MousePointerClick className="w-6 h-6 text-accumulate-600 dark:text-accumulate-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
              Start building your flow
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
              Drag a block from the left, or load a Golden Path template to learn
              the basics.
            </p>
            <button
              onClick={() => openModal('template-select')}
              className={cn(
                'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
                'bg-gradient-to-r from-accumulate-600 to-accumulate-500',
                'text-white font-medium text-sm',
                'hover:from-accumulate-700 hover:to-accumulate-600',
                'transition-all duration-150'
              )}
            >
              <Sparkles className="w-4 h-4" />
              Browse Templates
            </button>
            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              or drag a block from the Action Palette on the left
            </p>
          </div>
        </div>
      )}

      {/* Drop zone indicator */}
      {isDragging && draggedBlockType && (
```

Notes:
- `cn` and `openModal` are already imported/selected in this file (`FlowCanvas.tsx:25`, `:180`) — no new store wiring needed.
- The gradient button classes are copied verbatim from `ActionPalette.tsx:67-73` for visual consistency with the existing "Golden Path Templates" button.
- `!isDragging` keeps the empty-state and the drop-zone indicator from stacking; the drop-zone indicator already owns the drag state.

## 6. Tests

### Component test (vitest + testing-library)

Create `apps/studio/src/components/__tests__/FlowCanvas.emptyState.test.tsx`. React Flow needs a wrapping `ReactFlowProvider` and `ResizeObserver`; mock the store the same way `BlockConfigModal.test.tsx` does.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

const mockOpenModal = vi.fn();
let mockNodes: unknown[] = [];

vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) =>
    selector({
      flow: { nodes: mockNodes, connections: [] },
      addNode: vi.fn(), updateNode: vi.fn(), removeNodes: vi.fn(),
      addConnection: vi.fn(), removeConnections: vi.fn(),
      selectNode: vi.fn(), clearSelection: vi.fn(),
      isDragging: false, draggedBlockType: null, setDragging: vi.fn(),
    })
  ),
  useUIStore: vi.fn((selector: (s: any) => any) => selector({ openModal: mockOpenModal })),
}));

vi.mock('@accumulate-studio/types', () => ({ BLOCK_CATALOG: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mockNodes = [];
  // ReactFlow requires ResizeObserver in jsdom
  (global as any).ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
});

import { FlowCanvas } from '../flow-builder/FlowCanvas';

const renderCanvas = () =>
  render(<ReactFlowProvider><FlowCanvas /></ReactFlowProvider>);

describe('FlowCanvas empty state', () => {
  it('shows the empty-state CTA when there are no nodes', () => {
    renderCanvas();
    expect(screen.getByText('Start building your flow')).toBeDefined();
    expect(screen.getByText('Browse Templates')).toBeDefined();
  });

  it('opens the template modal when Browse Templates is clicked', () => {
    renderCanvas();
    fireEvent.click(screen.getByText('Browse Templates'));
    expect(mockOpenModal).toHaveBeenCalledWith('template-select');
  });

  it('hides the empty state once a node exists', () => {
    mockNodes = [{ id: 'n1', type: 'CreateIdentity', position: { x: 0, y: 0 }, config: {} }];
    renderCanvas();
    expect(screen.queryByText('Start building your flow')).toBeNull();
  });
});
```

If `prerequisite-engine` / `services` imports cause jsdom failures, add `vi.mock('../../services/prerequisite-engine', () => ({ getPrerequisiteRecipe: () => [], findBestAttachmentNode: () => ({ score: 0 }) }))`.

### Manual QA checklist

- [ ] Fresh load (clear `localStorage` key `accumulate-studio-flow`) → empty state visible.
- [ ] Click "Browse Templates" → template modal opens.
- [ ] Drag a block onto the canvas → empty state disappears mid-drag (drop-zone indicator shows instead).
- [ ] Drop the block → node appears, empty state stays gone.
- [ ] Delete the last node → empty state returns.
- [ ] Toggle dark mode → card, text, and button all legible.
- [ ] Pan/zoom by dragging the canvas area *behind* the card → still works (pointer-events pass through).

## 7. Risks, rollback, out of scope

- **Risk:** Overlapping the React Flow `Controls`/`MiniMap` (bottom-left / bottom-right). The card is centered and `max-w-md`, so it should not collide, but verify on a short viewport.
- **Rollback:** Delete the single JSX block added in Step 2 and revert the icon import — fully self-contained, no store/schema changes.
- **Out of scope:** Animated illustrations, dismiss-and-remember behavior, a "recent flows" list, or per-template previews in the overlay.
