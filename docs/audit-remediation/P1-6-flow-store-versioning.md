# [P1-6] — Flow store persist versioning + rehydrate validation

| Field | Value |
| --- | --- |
| Priority | P1 |
| Severity | High |
| Effort | S (≈0.5–1 day) |
| Risk | Medium |
| Depends on | — |
| Blocks | **P3-3** (share links reuse the same `migrate` + validation) |
| Primary files | `apps/studio/src/store/flow-store.ts` |

---

## 1. Problem & impact

The flow store persists `flow` with **no `version` and no `migrate`**:

```ts
// flow-store.ts:662-668
{
  name: 'accumulate-studio-flow',
  partialize: (state) => ({
    flow: state.flow,
  }),
}
```

By contrast, the UI store is versioned and migrated correctly (`ui-store.ts:152-188`, `version: 2` + a `migrate` function). The flow store is the one holding **user-authored graph data** — the highest-value, most schema-sensitive payload — yet it rehydrates blindly.

Failure mode: an older or partially-corrupt persisted flow (e.g. from a previous schema, a half-written localStorage entry, or a future `version` field mismatch) rehydrates straight into `state.flow`. Downstream code assumes shape — e.g. `flow.nodes.map(...)` (`FlowCanvas.tsx:34`), `flow.connections.map(...)` (`FlowCanvas.tsx:61`), `flow.variables` iteration (`flow-store.ts:440`), `flow.name.toLowerCase()` (`Header.tsx:420`). If any of `nodes`/`connections`/`variables` is missing or non-array, the app throws on first render and is caught by the top-level `ErrorBoundary` (`App.tsx:458`) → **white screen / error screen with no recovery**, and because the bad value is persisted, a reload reproduces it. The user is stuck.

## 2. Evidence (current code)

Unversioned persist (flow store):

```ts
// flow-store.ts:662-668
{
  name: 'accumulate-studio-flow',
  partialize: (state) => ({ flow: state.flow }),
}
```

The model to copy (UI store, already shipping):

```ts
// ui-store.ts:152-175
{
  name: 'accumulate-studio-ui',
  version: 2,
  migrate: (persisted: unknown, version: number) => {
    const state = persisted as Record<string, unknown>;
    if (version === 0) { /* … */ }
    if (version <= 1) { /* … */ }
    return state as UIState & UIActions;
  },
  partialize: (state) => ({ /* … */ }),
}
```

Validation primitives already exist:

```ts
// packages/types/src/flow.ts:233-246  createEmptyFlow(name): Flow
// packages/types/src/flow.ts:304-336  validateFlow(flow): { valid, errors }
```
Both are already imported in the flow store (`flow-store.ts:13`):
```ts
import { createEmptyFlow, generateNodeId, generateConnectionId } from '@accumulate-studio/types';
```

History stacks are in-state but already excluded from persistence (only `flow` is in `partialize`). That is correct and should stay (`flow-store.ts:44-46`, `:664-666`).

## 3. Root cause

The flow store's persist config was written before versioning conventions were established (the UI store got `version`/`migrate` retroactively in a later change). The flow store was never brought up to the same standard, and no rehydrate-time shape validation guards the most important payload.

## 4. Target behavior & acceptance criteria

- [ ] The flow-store persist config declares `version: 1`.
- [ ] A `migrate(persisted, version)` exists with a documented `v0 → v1` step (v0 = legacy unversioned payloads).
- [ ] On rehydrate, the flow is **structurally validated**; if it is malformed (missing/non-array `nodes`/`connections`/`variables`, missing `name`/`version`, fails `validateFlow`, or contains cycles), the store falls back to `createEmptyFlow('Untitled Flow')` instead of crashing.
- [ ] Persistence of history (`past`/`future`) is explicitly decided and documented: **do NOT persist** (keep current `partialize`).
- [ ] A valid existing persisted flow still rehydrates unchanged (no data loss for good data).
- [ ] No white-screen: a deliberately corrupted localStorage entry results in an empty canvas, not an ErrorBoundary.
- [ ] `version` is bumped to `1`; future schema changes add `if (version < N)` branches (the pattern P3-3 will reuse).

## 5. Implementation steps

### Step 1 — Add a sanitizer/validator helper

Add above the `useFlowStore` definition (after the imports, near `flow-store.ts:21`):

```ts
import type { Flow } from '@accumulate-studio/types';

/**
 * Structurally validate a rehydrated flow. Returns a safe Flow:
 * the input if it's well-formed, otherwise a fresh empty flow.
 * Never throws.
 */
function sanitizeFlow(input: unknown): Flow {
  const fallback = () => createEmptyFlow('Untitled Flow');
  try {
    if (!input || typeof input !== 'object') return fallback();
    const f = input as Partial<Flow>;

    // Required top-level shape
    if (typeof f.name !== 'string') return fallback();
    if (!Array.isArray(f.nodes)) return fallback();
    if (!Array.isArray(f.connections)) return fallback();

    // Coerce optional-but-iterated collections to safe defaults
    const safe: Flow = {
      version: '1.0',
      name: f.name,
      description: typeof f.description === 'string' ? f.description : undefined,
      variables: Array.isArray(f.variables) ? f.variables : [],
      nodes: f.nodes as Flow['nodes'],
      connections: f.connections as Flow['connections'],
      assertions: Array.isArray(f.assertions) ? f.assertions : [],
      metadata: (f.metadata && typeof f.metadata === 'object'
        ? f.metadata
        : { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) as Flow['metadata'],
    };

    // Deep structural check (duplicate ids, dangling connections, cycles)
    const result = validateFlow(safe);
    if (!result.valid) {
      // Malformed graph — safer to drop than to render a broken canvas.
      console.warn('[flow-store] discarding invalid persisted flow:', result.errors);
      return fallback();
    }
    return safe;
  } catch (err) {
    console.warn('[flow-store] failed to sanitize persisted flow:', err);
    return fallback();
  }
}
```

Add `validateFlow` to the existing types import:

**Before** (`flow-store.ts:13`):
```ts
import { createEmptyFlow, generateNodeId, generateConnectionId } from '@accumulate-studio/types';
```
**After:**
```ts
import { createEmptyFlow, generateNodeId, generateConnectionId, validateFlow } from '@accumulate-studio/types';
```
(`Flow` is already imported as a type at `flow-store.ts:4-12`; if not re-importing, drop the extra `import type { Flow }` line above and rely on the existing one.)

### Step 2 — Versioned persist config with migrate + onRehydrateStorage

**Before** (`flow-store.ts:662-668`):
```ts
    {
      name: 'accumulate-studio-flow',
      partialize: (state) => ({
        flow: state.flow,
      }),
    }
```

**After:**
```ts
    {
      name: 'accumulate-studio-flow',
      version: 1,
      // History (past/future) is intentionally NOT persisted: it can be large,
      // is session-scoped, and persisting it risks rehydrating undo states that
      // reference a flow shape that no longer matches. Only `flow` is stored.
      partialize: (state) => ({
        flow: state.flow,
      }),
      migrate: (persisted: unknown, version: number): { flow: Flow } => {
        const state = (persisted ?? {}) as { flow?: unknown };
        // v0 → v1: legacy unversioned payloads. The schema is unchanged so far,
        // so migration is purely defensive sanitization. Future schema changes
        // add `if (version < N) { ... }` branches here.
        if (version < 1) {
          return { flow: sanitizeFlow(state.flow) };
        }
        return { flow: sanitizeFlow(state.flow) };
      },
      // Final guard: even for current-version payloads, validate the rehydrated
      // flow and fall back to empty on any structural problem.
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[flow-store] rehydrate error, starting empty:', error);
          if (state) state.flow = createEmptyFlow('Untitled Flow');
          return;
        }
        if (state) {
          state.flow = sanitizeFlow(state.flow);
        }
      },
    }
```

Notes:
- `migrate` runs only when the stored `version` differs from `1` (i.e. legacy/v0 or future downgrades). `onRehydrateStorage` runs on **every** load, so a current-version-but-corrupt payload is still caught — this is the belt-and-suspenders that prevents the white screen.
- Returning `{ flow }` from `migrate` matches `partialize`'s persisted shape (zustand merges it into state).
- The `immer` middleware wraps the store; mutating `state.flow = …` inside `onRehydrateStorage` is fine because the callback receives the post-merge state object (the `set` semantics of immer apply to actions, not to this lifecycle hook — direct assignment here is the documented zustand pattern).

### Step 3 — Decision record: history persistence

Keep `past`/`future` out of `partialize` (already the case). Document inline (done in Step 2 comment). Rationale captured for P3-3: share links serialize **only `flow`** and route it through `sanitizeFlow` on import, so the same validation path is reused — do not invent a second importer.

## 6. Tests

### Unit test — `apps/studio/src/store/__tests__/flow-store.persist.test.ts`

These tests target `sanitizeFlow`. Export it from the store for testability (add `export` to the function, or test via a thin re-export). Minimal approach: `export function sanitizeFlow`.

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeFlow } from '../flow-store';
import { createEmptyFlow } from '@accumulate-studio/types';

describe('sanitizeFlow', () => {
  it('returns a valid flow unchanged in shape', () => {
    const good = createEmptyFlow('My Flow');
    good.nodes = [{ id: 'a', type: 'GenerateKeys' as any, position: { x: 0, y: 0 }, config: {} as any }];
    const out = sanitizeFlow(good);
    expect(out.name).toBe('My Flow');
    expect(out.nodes).toHaveLength(1);
  });

  it('falls back to empty flow for null / non-object', () => {
    expect(sanitizeFlow(null).nodes).toEqual([]);
    expect(sanitizeFlow('garbage').nodes).toEqual([]);
  });

  it('falls back when nodes is not an array', () => {
    expect(sanitizeFlow({ name: 'x', nodes: 'nope', connections: [] }).nodes).toEqual([]);
  });

  it('falls back when name is missing', () => {
    const out = sanitizeFlow({ nodes: [], connections: [] });
    expect(out.name).toBe('Untitled Flow');
  });

  it('coerces missing variables/assertions to []', () => {
    const out = sanitizeFlow({ name: 'x', nodes: [], connections: [] });
    expect(out.variables).toEqual([]);
    expect(out.assertions).toEqual([]);
  });

  it('drops a flow with dangling connection references (validateFlow fails)', () => {
    const bad = {
      name: 'x',
      nodes: [{ id: 'a', type: 'GenerateKeys', position: { x: 0, y: 0 }, config: {} }],
      connections: [{ id: 'c1', sourceNodeId: 'a', sourcePortId: 'output', targetNodeId: 'ZZZ', targetPortId: 'input' }],
    };
    expect(sanitizeFlow(bad).nodes).toEqual([]); // discarded → empty
  });
});
```

### Migration test (optional but recommended)

Call `migrate` directly:

```ts
import { useFlowStore } from '../flow-store';
// The persist options aren't exported; if you need to unit-test migrate,
// extract it to a named function `migrateFlowPersist(persisted, version)` and export it,
// then assert: migrateFlowPersist({ flow: null }, 0).flow.nodes === [].
```

### Manual QA checklist

- [ ] Build a flow, reload → flow restored intact (no data loss).
- [ ] In DevTools, set `localStorage['accumulate-studio-flow'] = '{"state":{"flow":{"name":"x","nodes":"BROKEN"}},"version":1}'`, reload → empty canvas, no ErrorBoundary screen, console warns.
- [ ] Set `localStorage['accumulate-studio-flow']` to a payload with `version:0` (delete the `version` key) → loads via migrate, sanitized, no crash.
- [ ] Corrupt JSON (`localStorage['accumulate-studio-flow'] = '{bad'`) → zustand's parse fails, `onRehydrateStorage` error branch yields empty flow.
- [ ] Undo/redo still work within a session (history is not persisted, so a reload resets undo stack — expected).
- [ ] Valid flow with a future `version:2` → migrate's `else` path still sanitizes (does not crash).

## 7. Risks, rollback, out of scope

- **Risk — over-aggressive discard:** `validateFlow` flags cycles and dangling refs as invalid, so a flow with one bad connection is discarded **entirely**. This is intentional (safer than a half-broken canvas) but means a single corruption loses the whole flow. If the team prefers lossy repair (strip bad connections, keep nodes), enhance `sanitizeFlow` to filter dangling connections before re-validating — note this as a follow-up, not in this ticket.
- **Risk — immer + onRehydrateStorage:** confirm the assignment in `onRehydrateStorage` actually takes effect with the `persist(immer(...))` ordering used here (`flow-store.ts:133-135`). If it doesn't, fall back to validating inside `migrate` only and accept that current-version corruption is rarer. Verify with the "broken nodes, version:1" QA step.
- **Rollback:** revert the persist-config block to the original 4 lines and remove `sanitizeFlow`; behavior returns to today's (unguarded) rehydrate.
- **Out of scope:** lossy auto-repair of partially-bad flows, schema-version stamping inside the `Flow` object itself (it has `version: '1.0'`, a content version distinct from the persist `version`), and share-link import (P3-3, which will import `sanitizeFlow`).
