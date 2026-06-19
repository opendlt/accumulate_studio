# P3-2 — Template Thumbnails: Render the Actual Flow Mini-Graph per Template

| Field | Value |
| --- | --- |
| Priority | P3 |
| Severity | Opportunity |
| Effort | M |
| Risk | Low (additive component; modal-only; no store changes) |
| Depends on | None |
| Blocks | None |
| Primary files | `apps/studio/src/components/modals/TemplateSelectModal.tsx`, `apps/studio/src/components/modals/TemplateThumbnail.tsx` (new), `apps/studio/src/data/flow-templates.ts` (read-only) |

---

## 1. Problem & impact

Every template card in the "Golden Path Templates" modal shows the **same generic category icon** as a "thumbnail placeholder." Because most templates share a category (identity/tokens/advanced), the cards are visually near-identical — the icon does nothing to distinguish "Token Transfer" from "Custom Token Issuance" from "Multi-Signature Setup." Users must read the title/description to tell them apart, defeating the purpose of a thumbnail grid. Rendering each template's **actual flow shape** (its node/edge mini-graph) gives an at-a-glance silhouette that differs per template and previews complexity (number of steps, branching).

---

## 2. Evidence (current code)

**Placeholder thumbnail — same icon for all (`TemplateSelectModal.tsx:80-85`):**
```tsx
    {/* Thumbnail placeholder */}
    <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
      <div className="text-gray-400 dark:text-gray-500">
        <CategoryIcon category={getTemplateCategory(template)} className="w-12 h-12" />
      </div>
    </div>
```
`getTemplateCategory` (`TemplateSelectModal.tsx:118-124`) collapses every template into one of five icons, so e.g. all `tokens`-tagged templates render the identical `Coins` icon.

**Real flow data is already available** on each template (`flow-templates.ts`; shape confirmed):
```ts
const liteAccountSetupFlow: Flow = {
  /* ... */
  nodes: [
    { id: 'generate_keys', type: 'GenerateKeys', /* ... */ position: pos(0) },
    { id: 'faucet',        type: 'Faucet',       /* ... */ position: pos(1) },
    { id: 'wait_for_balance', type: 'WaitForBalance', /* ... */ position: pos(2) },
  ],
  connections: [
    { id: 'conn_generate_keys_faucet', sourceNodeId: 'generate_keys', sourcePortId: 'output', targetNodeId: 'faucet', targetPortId: 'input' },
    { id: '...', sourceNodeId: 'faucet', sourcePortId: 'output', targetNodeId: 'wait_for_balance', /* ... */ },
  ],
};
```
Each `FlowTemplate.flow` already has `nodes[].position` and `connections[]` — everything a mini-graph needs.

**The app already renders a React Flow MiniMap** (`FlowCanvas.tsx:513-522`), proving the node-color-by-type pattern works:
```tsx
        <MiniMap
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          style={{ width: 140, height: 100 }}
          nodeColor={(node) => {
            const nodeData = node.data as { type: BlockType };
            const blockDef = BLOCK_CATALOG[nodeData.type];
            return blockDef?.color || '#64748b';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
```

---

## 3. Root cause

The thumbnail was stubbed as a placeholder during the initial modal build and never replaced with real rendering. The template data needed to draw a real preview (positions + edges + per-type colors via `BLOCK_CATALOG`) has been present the whole time; nothing consumed it for the card.

---

## 4. Recommendation & justification (Option A vs B)

**Recommendation: Option A — a tiny non-interactive `<ReactFlow>` with `fitView`, one per card.**

Justification:
- **Reuse, not reinvention.** The app already depends on `@xyflow/react` and already colors nodes by `BLOCK_CATALOG[type].color` in the MiniMap. Option A reuses the exact same data path and color logic. Option B (precomputed static SVG) means writing and maintaining a bespoke layout+SVG renderer that must stay in sync with the canvas look.
- **Perf is a non-issue at this scale.** There are exactly **8 golden-path templates**, each 3–8 nodes. Eight tiny ReactFlow instances mounted only while the modal is open (the modal is conditionally rendered via Radix `Dialog` — `TemplateSelectModal.tsx:167`) is trivial. ReactFlow instances are cheap when `nodesDraggable`/`panOnDrag`/`zoomOnScroll` are disabled and there are no interactions. We render them once per modal-open, filtered to the active category (usually ≤8), so worst case ~8 mounts.
- **Correctness for free.** `fitView` auto-frames whatever positions the template defines, so we don't reimplement layout. Branching templates (multisig/key-rotation) render correctly without special-casing.
- **Each instance must be wrapped in its own `ReactFlowProvider`** (the app's outer provider is in `App.tsx:295`, but each isolated mini-graph needs its own context so they don't share zoom/viewport state). This is cheap.

Option B (static SVG) would only win if we needed thumbnails outside React (e.g., server-rendered marketing) or for hundreds of templates — neither applies. Reject B.

---

## 5. Implementation steps

### Step 1 — new component `apps/studio/src/components/modals/TemplateThumbnail.tsx`

```tsx
import React, { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BLOCK_CATALOG, type BlockType, type Flow } from '@accumulate-studio/types';

interface TemplateThumbnailProps {
  flow: Flow;
}

/**
 * Minimal, non-interactive node renderer for thumbnails. Each node is a small
 * rounded rectangle colored by its block type — no labels, no handles.
 */
const ThumbNode: React.FC<{ data: { color: string } }> = ({ data }) => (
  <div
    style={{ backgroundColor: data.color }}
    className="w-10 h-5 rounded-sm border border-black/10 shadow-sm"
  />
);

const thumbNodeTypes = { thumb: ThumbNode };

const TemplateThumbnailInner: React.FC<TemplateThumbnailProps> = ({ flow }) => {
  const nodes: Node[] = useMemo(
    () =>
      flow.nodes.map((n) => {
        const color = BLOCK_CATALOG[n.type as BlockType]?.color ?? '#64748b';
        return {
          id: n.id,
          type: 'thumb',
          position: n.position,
          data: { color },
          draggable: false,
          selectable: false,
          connectable: false,
        };
      }),
    [flow.nodes]
  );

  const edges: Edge[] = useMemo(
    () =>
      flow.connections.map((c) => ({
        id: c.id,
        source: c.sourceNodeId,
        target: c.targetNodeId,
        style: { stroke: '#9ca3af', strokeWidth: 1.5 },
      })),
    [flow.connections]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={thumbNodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      className="pointer-events-none"
    >
      <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#e5e7eb" className="dark:opacity-20" />
    </ReactFlow>
  );
};

export const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ flow }) => (
  <ReactFlowProvider>
    <TemplateThumbnailInner flow={flow} />
  </ReactFlowProvider>
);
```
> `BLOCK_CATALOG[type].color` is the same source the canvas MiniMap uses (`FlowCanvas.tsx:519`), so thumbnail colors match the real nodes. `pointer-events-none` plus all the disabled interactions make the mini-graph purely decorative — clicks fall through to the card's `onSelect`.

### Step 2 — integrate into the card (`TemplateSelectModal.tsx`)

Add the import (`TemplateSelectModal.tsx:1-8` block):
```tsx
import { TemplateThumbnail } from './TemplateThumbnail';
```
Replace the placeholder block (`TemplateSelectModal.tsx:80-85`):

Before:
```tsx
    {/* Thumbnail placeholder */}
    <div className="aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
      <div className="text-gray-400 dark:text-gray-500">
        <CategoryIcon category={getTemplateCategory(template)} className="w-12 h-12" />
      </div>
    </div>
```
After:
```tsx
    {/* Mini-graph thumbnail of the actual flow */}
    <div className="aspect-video bg-gray-50 dark:bg-gray-900 rounded-lg mb-3 overflow-hidden relative">
      {template.flow.nodes.length > 0 ? (
        <TemplateThumbnail flow={template.flow} />
      ) : (
        // Fallback for an (unexpected) empty template
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500">
          <CategoryIcon category={getTemplateCategory(template)} className="w-12 h-12" />
        </div>
      )}
    </div>
```
> Keep `CategoryIcon` / `getTemplateCategory` in the file — they are still used by the category sidebar tabs (`TemplateSelectModal.tsx:234`) and as the empty fallback. No other change to the card body, badges, or step count is needed.

### Step 3 — ensure the card click target still works

The card is a `<button onClick={onSelect}>` (`TemplateSelectModal.tsx:70`). The thumbnail is `pointer-events-none`, so a click on the graph still triggers the button's `onSelect`. No change required — verify in QA.

### Step 4 (optional polish) — guard sizing

ReactFlow needs a sized parent. The `aspect-video` wrapper already gives intrinsic height; ReactFlow fills `100%`/`100%` of it by default. If you observe a zero-height flash on first paint, add an explicit min height to the wrapper:
```tsx
    <div className="aspect-video min-h-[88px] bg-gray-50 dark:bg-gray-900 rounded-lg mb-3 overflow-hidden relative">
```

---

## 6. Tests

**Component tests (Vitest + RTL):**
1. `TemplateThumbnail.test.tsx`: render with a 3-node template flow → assert it mounts without throwing and that the container has the ReactFlow root (`.react-flow` class present). Assert nodes count rendered equals `flow.nodes.length` (query `.react-flow__node`). Mock `ResizeObserver` if jsdom lacks it (ReactFlow needs it — add a `ResizeObserver` polyfill in the test setup if not already present).
2. `TemplateSelectModal.test.tsx`: open the modal → assert each visible card contains a `.react-flow` element (one thumbnail per card), not the old single `CategoryIcon` placeholder. Click a card → `onSelect`/selection still toggles (the thumbnail does not swallow the click).

> jsdom note: ReactFlow measures with `ResizeObserver` and `getBoundingClientRect`, both stubbed/zero in jsdom. The thumbnails will mount but `fitView` may not compute real positions in tests — assert on presence/structure, not pixel layout. Add to `vitest.setup.ts` if missing:
```ts
global.ResizeObserver = global.ResizeObserver || class { observe(){} unobserve(){} disconnect(){} };
```

**Manual QA checklist:**
- [ ] Open Golden Path Templates → each card shows a distinct mini-graph (Lite Account = 3-node line; Multi-Sig = branched; Zero to Hero = longer chain).
- [ ] Node colors in the thumbnail match the colors those block types have on the canvas.
- [ ] Light and dark mode both render the thumbnail with appropriate background/dots.
- [ ] Clicking anywhere on a card (including on the graph) selects it; the details sidebar populates.
- [ ] Switching category tabs re-renders the correct subset of thumbnails with no console errors.
- [ ] No noticeable lag opening the modal (8 thumbnails).

---

## 7. Risks, rollback, out of scope

- **Risk — many ReactFlow instances.** Bounded to ≤8 (filtered templates). If the template count grows large later, switch to Option B (static SVG) or lazy-render thumbnails on card hover/intersection. Not needed now.
- **Risk — sizing flash.** Covered by Step 4's optional `min-h`. If `fitView` mis-frames, pass explicit `fitViewOptions={{ padding: 0.15, minZoom: 0.1, maxZoom: 1.5 }}`.
- **Risk — test env.** ReactFlow + jsdom requires the `ResizeObserver` stub; document it in the PR so CI does not break.
- **Rollback:** delete the `TemplateThumbnail` import + usage in the card and restore the placeholder block; remove `TemplateThumbnail.tsx`. Self-contained.
- **Out of scope:** animated/interactive thumbnails, hover-to-zoom previews, rendering block labels inside thumbnails, and precomputed SVG export of templates.
