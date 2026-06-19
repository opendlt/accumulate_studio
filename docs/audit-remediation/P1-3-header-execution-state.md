# [P1-3] — Header execution state: single source of truth, no mid-run re-confirm

| Field | Value |
| --- | --- |
| Priority | P1 |
| Severity | High |
| Effort | S (≈0.5 day) |
| Risk | Low |
| Depends on | — |
| Blocks | **P1-2** (Cmd/Ctrl+Enter run path reuses `isExecuting`) |
| Primary files | `apps/studio/src/App.tsx`, `apps/studio/src/components/layout/Header.tsx` |

---

## 1. Problem & impact

`App.tsx` renders the Header **without** `onExecute` or `isExecuting`:

```tsx
// App.tsx:298
<Header onTogglePalette={togglePalette} />
```

Consequences in `Header.tsx`:

1. `isExecuting` defaults to `false` (`Header.tsx:335`) and **never changes** → the `'Executing…'` label and `animate-pulse` state (`Header.tsx:621-625`) are **dead code**.
2. Because `onExecute` is `undefined`, `handleExecute` always falls to the confirm modal (`Header.tsx:405-412`). Clicking **Execute while a run is already in progress re-opens the confirm modal**, and confirming kicks off a second `executionEngine.executeFlow` — which throws `'Execution already in progress'` (`execution/index.ts:47-49`) and is swallowed (`ModalContainer.tsx:41-47`). So the button looks live mid-run but does nothing useful, and never shows running state.

There are now **two** execution entry points — `App.handleExecuteFlow` (`App.tsx:198-204`, used only by the ExecutionPanel) and `ModalContainer.handleExecuteConfirm` (`ModalContainer.tsx:41-47`, used by the confirm modal). The Header's button is wired to neither's running state.

Impact: no visual feedback that a flow is running from the Header; a confusing double-confirm path; the disabled-during-run guarantee is missing.

## 2. Evidence (current code)

Header prop contract — both optional, both unused by App:

```tsx
// Header.tsx:324-336
interface HeaderProps {
  onExecute?: () => void;
  onExport?: () => void;
  onTogglePalette?: () => void;
  isExecuting?: boolean;
}
export const Header: React.FC<HeaderProps> = ({
  onExecute, onExport, onTogglePalette, isExecuting = false,
}) => {
```

The fall-through that re-opens the modal:

```tsx
// Header.tsx:405-412
const handleExecute = () => {
  if (onExecute) {
    onExecute();
  } else {
    openModal('execute-confirm');   // ← always taken today
  }
};
```

Dead running-state UI:

```tsx
// Header.tsx:613-626
<Button
  variant="primary" size="sm"
  onClick={handleExecute}
  disabled={isExecuting || flow.nodes.length === 0}
  className={cn('relative', isExecuting && 'animate-pulse')}
>
  <Play className="w-4 h-4 mr-2" />
  {isExecuting ? 'Executing...' : 'Execute'}
</Button>
```

The store already tracks status; App selects it:

```tsx
// App.tsx:129
const execution = useFlowStore((state) => state.execution);
// flow-store.ts:435-461 startExecution sets status:'running'
// flow-store.ts:488-496 completeExecution sets status:'completed'|'failed'
```

`FlowExecutionState.status` values are set by the store; the engine drives them (`execution/index.ts:82,113-114,123`). The engine also exposes `getStatus()` (`execution/index.ts:289-291`) returning `'idle'|'running'|'paused'|'completed'|'failed'`.

## 3. Root cause

The Header was built to accept execution wiring, but `App.tsx` was never updated to pass it. Execution state was duplicated between the ExecutionPanel handler and the confirm-modal handler, and the Header was left orphaned from both.

## 4. Target behavior & acceptance criteria

- [ ] A single derived `isExecuting` boolean is computed in `App.tsx` from the store (`execution?.status === 'running'`) and passed to `Header`.
- [ ] `App.tsx` passes `onExecute={handleExecuteFlow}` (or a guarded wrapper) to `Header` so the button no longer falls through to the confirm modal as its only path.
- [ ] While `isExecuting` is true, the Execute button is **disabled**, shows `'Executing…'`, and pulses — and clicking it does nothing.
- [ ] Clicking Execute while idle starts a run (directly, OR via the confirm modal — see decision in Step 3). Mid-run clicks cannot start a second run.
- [ ] No path calls `executionEngine.executeFlow` twice concurrently.
- [ ] When the run finishes (completed/failed), the button returns to `'Execute'` and is enabled (assuming `flow.nodes.length > 0`).
- [ ] The value passed as `isExecuting` is the same boolean P1-2's Cmd/Ctrl+Enter handler consults.

## 5. Implementation steps

### Decision: keep the confirm modal, but route running-state through App

The product currently *wants* a confirm step (network/credit warning). Preserve it, but make the Header's `onExecute` open the modal **only when idle**, and surface `isExecuting` so the button disables. The actual `executeFlow` call stays in `ModalContainer.handleExecuteConfirm` (`ModalContainer.tsx:41-47`). This removes the duplicate path because the Header no longer independently decides; it always defers to App for both the action and the running flag.

### Step 1 — Derive `isExecuting` in `App.tsx`

`execution` is already selected (`App.tsx:129`). Add a derived flag right after it:

```tsx
// App.tsx — after line 129
const isExecuting = execution?.status === 'running';
```

> Rationale for store-derived over `executionEngine.getStatus()`: the store status is reactive (drives re-render); `getStatus()` is a plain field read and would not re-render the Header. The engine sets the store status at `startExecution()`/`completeExecution()`, so they stay in lockstep.

### Step 2 — Provide a guarded execute handler

`handleExecuteFlow` (`App.tsx:198-204`) calls `executeFlow` directly. For the Header we want the **confirm-modal** path while idle and a no-op while running. Add:

```tsx
// App.tsx — near handleExecuteFlow
const openModal = useUIStore((s) => s.openModal); // already selected at line 104
const handleHeaderExecute = useCallback(() => {
  if (isExecuting) return;            // guard: never start a second run
  openModal('execute-confirm');       // existing confirm path owns executeFlow
}, [isExecuting, openModal]);
```

(If the team prefers skipping the confirm modal from the Header and running directly, use `handleExecuteFlow` guarded by `isExecuting` instead — but keep ONE of the two, not both.)

### Step 3 — Pass props to Header

**Before** (`App.tsx:298`):
```tsx
<Header onTogglePalette={togglePalette} />
```

**After:**
```tsx
<Header
  onTogglePalette={togglePalette}
  onExecute={handleHeaderExecute}
  isExecuting={isExecuting}
/>
```

### Step 4 — Tighten Header's button guard (defensive)

`handleExecute` (`Header.tsx:405-412`) now receives a real `onExecute`, so the fall-through branch is no longer reached in normal operation. Harden it so a missing handler can't silently re-open the modal mid-run, and so the button is unmistakably inert while running:

**Before** (`Header.tsx:405-412`):
```tsx
const handleExecute = () => {
  if (onExecute) {
    onExecute();
  } else {
    openModal('execute-confirm');
  }
};
```

**After:**
```tsx
const handleExecute = () => {
  if (isExecuting) return; // never trigger anything while a run is in flight
  if (onExecute) {
    onExecute();
  } else {
    openModal('execute-confirm');
  }
};
```

The existing `disabled={isExecuting || flow.nodes.length === 0}` and label/pulse logic (`Header.tsx:618-625`) now light up correctly because `isExecuting` is a live prop — no JSX change needed there.

### Step 5 — Confirm modal cannot double-fire

`ModalContainer.handleExecuteConfirm` (`ModalContainer.tsx:41-47`) already `try/catch`es the `'Execution already in progress'` throw. With the Header guarded (Steps 2 & 4) the modal can't be opened mid-run, so this is now just belt-and-suspenders. No change required, but verify the catch logs rather than crashes.

## 6. Tests

### Component test — extend `apps/studio/src/components/__tests__/Header.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../layout/Header';
// (reuse the existing store mocks in Header.test.tsx; ensure flow.nodes has ≥1 node)

describe('Header execution state', () => {
  it('shows "Executing..." and disables the button when isExecuting', () => {
    render(<Header isExecuting onExecute={vi.fn()} />);
    const btn = screen.getByText('Executing...').closest('button')!;
    expect(btn).toBeDefined();
    expect(btn.disabled).toBe(true);
  });

  it('shows "Execute" and is enabled when idle (with nodes)', () => {
    render(<Header isExecuting={false} onExecute={vi.fn()} />);
    const btn = screen.getByText('Execute').closest('button')!;
    expect(btn.disabled).toBe(false);
  });

  it('does not call onExecute while executing', () => {
    const onExecute = vi.fn();
    render(<Header isExecuting onExecute={onExecute} />);
    fireEvent.click(screen.getByText('Executing...').closest('button')!);
    expect(onExecute).not.toHaveBeenCalled();
  });

  it('calls onExecute when idle', () => {
    const onExecute = vi.fn();
    render(<Header isExecuting={false} onExecute={onExecute} />);
    fireEvent.click(screen.getByText('Execute').closest('button')!);
    expect(onExecute).toHaveBeenCalledTimes(1);
  });
});
```

> The existing `Header.test.tsx` mocks `useFlowStore`/`useUIStore`; make sure the mocked `flow.nodes` array is non-empty for the "enabled" cases, otherwise `flow.nodes.length === 0` keeps the button disabled.

### Manual QA checklist

- [ ] Build a flow with ≥1 node; click Execute → confirm modal opens.
- [ ] Confirm → run starts; the Header button immediately reads "Executing…", pulses, and is disabled.
- [ ] Click the Header Execute button repeatedly mid-run → nothing happens (no second modal, no console error).
- [ ] Run completes → button returns to "Execute", enabled.
- [ ] Trigger a failing flow → on failure the button re-enables (status `failed`).
- [ ] Empty canvas → button stays disabled.

## 7. Risks, rollback, out of scope

- **Risk:** If a future code path calls `executeFlow` without going through `startExecution()` (which sets store status), `isExecuting` would stay false. Mitigation: the engine calls `store.startExecution()` first thing (`execution/index.ts:82`), so this holds today; add a comment near `handleHeaderExecute` noting the invariant.
- **Risk:** Choosing the "run directly, no confirm" variant removes the mainnet warning gate. Keep the confirm modal unless product explicitly approves removal.
- **Rollback:** revert the `<Header />` props in `App.tsx` and the `handleExecute` guard in `Header.tsx`; the component reverts to today's behavior.
- **Out of scope:** progress/percentage UI, a Stop button in the Header (Stop already exists in the ExecutionPanel, `App.tsx:411-413`), per-node running indicators (already handled by `BlockNode` StatusIcon).
