# P3-3 — Shareable Flow Permalinks

| Field | Value |
|---|---|
| Priority | P3 |
| Severity | Opportunity |
| Effort | M (3–4 days) |
| Risk | Medium (untrusted input on load — must validate; privacy of embedded URLs) |
| Depends on | **P1-6** (reuses its `sanitizeFlow` validate/migrate path) |
| Blocks | none |
| Primary files | **new** `apps/studio/src/lib/share-link.ts`, `apps/studio/src/store/flow-store.ts` (export `sanitizeFlow`, or move it to a shared module), `apps/studio/src/App.tsx` (load-on-mount), `apps/studio/src/components/layout/Header.tsx` (Share button), `apps/studio/package.json` |

---

## 1. Problem & impact

There is **no way to share a flow** except downloading a JSON file and sending it (`Header.tsx` `handleSaveFlow`, `:~430`, writes a `.flow.json` blob; `handleFileSelected`, `:~365`, re-imports it). For onboarding/collaboration/support, a copy-paste URL that reconstructs the exact flow is far more valuable ("look at this flow"). Today that is impossible.

The change is security-sensitive: a share link is **untrusted input** that rehydrates the flow store. It must pass through the same validation/migration path P1-6 builds (`sanitizeFlow`), never `loadFlow(rawDecodedJson)` directly. There is also a **privacy** dimension: flows may embed account URLs (e.g. `acc://…`) in block config; the link encodes the flow graph, so we warn the user. Critically, **keys/secrets are never in the flow** (signing keys live in env/`SmartSigner`, not in the flow model), so the link cannot leak a private key — but we still surface a non-secret-warning.

## 2. Evidence (current code)

### 2a. Persisted/loaded flow shape and actions
`flow-store.ts:53` `loadFlow: (flow: Flow) => void` — the canonical "replace current flow" action. Implementation (`flow-store.ts:165-174`):
```ts
loadFlow: (flow) => {
  set((state) => {
    state.flow = flow;
    state.selectedNodeIds = [];
    state.selectedConnectionIds = [];
    state.execution = null;
    state.past = [];
    state.future = [];
  });
},
```
`Flow` shape (persisted via `partialize`, `flow-store.ts:664-666`): `{ version, name, description?, variables[], nodes[], connections[], assertions[], metadata }` (see `sanitizeFlow` in P1-6 for the authoritative field list).

### 2b. Existing import path already validates — reuse its pattern
`Header.tsx` `handleFileSelected` (`:~365`) already does the right thing for untrusted file input:
```tsx
const flowData: Flow = parsed.flow ?? parsed;
if (!flowData.version || !flowData.nodes || !Array.isArray(flowData.nodes)) {
  alert('Invalid flow file: missing required fields (version, nodes).');
  return;
}
const validation = validateFlow(flowData);
if (!validation.valid) { /* confirm */ }
...
loadFlow(flowData);
```
Share-link decode should funnel through the **stronger** P1-6 `sanitizeFlow` (which also checks cycles/dangling connections), not re-implement this ad-hoc check.

### 2c. App init / load points
`App.tsx` has no URL parsing on mount. Network connect happens at `App.tsx:~225`:
```tsx
useEffect(() => {
  networkService.connect(selectedNetwork).catch(...);
}, [selectedNetwork]);
```
The flow store rehydrates from localStorage via zustand `persist` (after P1-6: versioned). A share link must be applied **after** rehydration so it wins over the persisted flow, with user confirmation if a non-empty flow already exists.

### 2d. P1-6 dependency — `sanitizeFlow`
P1-6 adds `sanitizeFlow(input: unknown): Flow` to `flow-store.ts` (returns a validated flow or `createEmptyFlow('Untitled Flow')`, never throws) plus `version: 1` + `migrate` + `onRehydrateStorage`. This doc **reuses** that helper for share decode — do not duplicate validation logic.

### 2e. Header has Save/Import/Export but no Share
`Header.tsx` right section: Save (`Save` icon), Import (`Upload`), Export (`Download`) — no Share. `lucide-react` is already the icon source.

## 3. Root cause

The flow model was designed for local persistence + file export/import only; no URL-serialization surface was ever added. Without P1-6's sanitize path, adding URL loading would also be unsafe, hence the dependency.

## 4. Target behavior & acceptance criteria

- [ ] A "Share" button in the Header encodes the current flow into a compact, URL-safe string and copies a full link (`<origin><path>#flow=<payload>`) to the clipboard, with a success toast.
- [ ] On app load, if the URL contains `#flow=<payload>` (or `?flow=`), the flow is decoded **through `sanitizeFlow`** and loaded; the URL param is then cleared (so a reload doesn't re-prompt).
- [ ] If a non-empty flow already exists when a link is opened, the user is asked to confirm replacement.
- [ ] Oversized payloads are handled: encoding warns/blocks past a size threshold; decoding of an over-limit or malformed payload fails gracefully with a toast (never a white screen).
- [ ] Invalid/garbage payloads never crash; they fall back to the current/empty flow with an error toast.
- [ ] The Share action shows a one-time privacy note that the link embeds the flow (which may contain account URLs) and that it never contains private keys.
- [ ] No secrets are embedded (verified: the `Flow` model carries no key material).

## 5. Implementation steps

### Step 0 — Choose encoding: `lz-string` `compressToEncodedURIComponent`
Recommendation: **`lz-string`** (`compressToEncodedURIComponent` / `decompressFromEncodedURIComponent`). Justification:
- Flow JSON is verbose and repetitive (block types, field names) → LZ compresses it 60–80%, keeping links short.
- `compressToEncodedURIComponent` outputs an **already URL-safe** string (no extra `encodeURIComponent` needed, no `+`/`/`/`=`).
- Plain `base64url(JSON)` is rejected as the default because flows with several blocks routinely exceed comfortable URL lengths (browsers/proxies get unhappy past ~2 KB in the hash; servers past ~8 KB). base64 *grows* the payload by ~33%; lz-string shrinks it. We keep a base64url fallback path only conceptually — not implemented.

Size limit: cap the **encoded** payload at **8 KB** (`MAX_ENCODED_LENGTH = 8192`). Above that, refuse to create a link and tell the user to use file export instead. Use the URL **hash** (`#flow=`) not the query (`?flow=`) so the payload is never sent to any server in request logs (privacy + it doesn't count against server URL limits). Support reading `?flow=` too for resilience, but always *write* `#flow=`.

Install: `npm i lz-string --workspace=apps/studio` (and `npm i -D @types/lz-string --workspace=apps/studio` if types aren't bundled — verify; recent `lz-string` ships its own types).

### Step 1 — Make `sanitizeFlow` reusable
P1-6 puts `sanitizeFlow` inside `flow-store.ts` as a module-local function. To reuse it from the share lib without a circular import, **export it**. In `apps/studio/src/store/flow-store.ts` change:
```ts
function sanitizeFlow(input: unknown): Flow {
```
→
```ts
export function sanitizeFlow(input: unknown): Flow {
```
(Optionally extract `sanitizeFlow` into `apps/studio/src/lib/flow-validation.ts` and have both `flow-store.ts` and `share-link.ts` import it — cleaner, avoids the store importing nothing back. Either is acceptable; exporting in place is the minimal change.)

### Step 2 — Encode/decode utilities
New file `apps/studio/src/lib/share-link.ts`:
```ts
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Flow } from '@accumulate-studio/types';
import { sanitizeFlow } from '../store/flow-store';

export const MAX_ENCODED_LENGTH = 8192;
const PARAM = 'flow';

export interface EncodeResult {
  ok: boolean;
  payload?: string;     // url-safe, ready to put after #flow=
  length?: number;
  error?: string;
}

/** Serialize a flow to a compact, URL-safe payload string. */
export function encodeFlowToPayload(flow: Flow): EncodeResult {
  try {
    // Encode only the persisted shape (drop transient/runtime fields).
    const minimal = {
      version: flow.version,
      name: flow.name,
      description: flow.description,
      variables: flow.variables,
      nodes: flow.nodes,
      connections: flow.connections,
      assertions: flow.assertions,
      metadata: flow.metadata,
    };
    const json = JSON.stringify(minimal);
    const payload = compressToEncodedURIComponent(json);
    if (payload.length > MAX_ENCODED_LENGTH) {
      return { ok: false, error: 'too-large', length: payload.length };
    }
    return { ok: true, payload, length: payload.length };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Build a full shareable URL using the location hash. */
export function buildShareUrl(flow: Flow, origin = window.location.origin, pathname = window.location.pathname): EncodeResult & { url?: string } {
  const res = encodeFlowToPayload(flow);
  if (!res.ok || !res.payload) return res;
  return { ...res, url: `${origin}${pathname}#${PARAM}=${res.payload}` };
}

/**
 * Decode a payload back into a SAFE flow (validated + migrated via sanitizeFlow).
 * Returns null if the payload is missing, oversized, or undecodable.
 * sanitizeFlow guarantees the returned Flow is structurally valid (or it threw → null).
 */
export function decodeFlowFromPayload(payload: string | null | undefined): Flow | null {
  if (!payload) return null;
  if (payload.length > MAX_ENCODED_LENGTH) return null;
  let json: string | null = null;
  try {
    json = decompressFromEncodedURIComponent(payload);
  } catch {
    return null;
  }
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  // CRITICAL: never trust the decoded object — run it through the same
  // validate/migrate path the persist layer uses (P1-6).
  const safe = sanitizeFlow(parsed);
  return safe;
}

/** Read a flow payload from the current URL (hash preferred, query fallback). */
export function readPayloadFromLocation(loc = window.location): string | null {
  // hash form: #flow=XXXX
  const hash = loc.hash.startsWith('#') ? loc.hash.slice(1) : loc.hash;
  const hashParams = new URLSearchParams(hash);
  const fromHash = hashParams.get(PARAM);
  if (fromHash) return fromHash;
  // query fallback: ?flow=XXXX
  const queryParams = new URLSearchParams(loc.search);
  return queryParams.get(PARAM);
}

/** Remove the flow payload from the URL without reloading (so refresh won't re-prompt). */
export function clearPayloadFromLocation(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  // strip hash param too
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  hashParams.delete(PARAM);
  const newHash = hashParams.toString();
  url.hash = newHash ? `#${newHash}` : '';
  window.history.replaceState(null, '', url.toString());
}
```
Note on the `decodeFlowFromPayload` contract: `sanitizeFlow` (P1-6) returns a valid flow or `createEmptyFlow(...)` and never throws. So a *garbage* payload that decodes to JSON but fails structural validation yields an **empty** flow, not a crash. The caller (App) distinguishes "no link" (`readPayloadFromLocation` → null) from "link present but invalid" (decode returns an empty flow whose `nodes.length === 0` while the payload was non-trivial) to show the right toast — see Step 3.

### Step 3 — Load-on-mount in `App.tsx`
Add an effect in `AppInner` that runs once after the stores are ready. Because zustand `persist` rehydrates synchronously by default for localStorage, running this in a mount `useEffect` is after rehydration. Add near the onboarding effects (`App.tsx:~106`):
```tsx
import { readPayloadFromLocation, decodeFlowFromPayload, clearPayloadFromLocation } from './lib/share-link';
// ...
const loadFlow = useFlowStore((state) => state.loadFlow);
// addToast already available from useToast()
const sharedLinkHandled = useRef(false);

useEffect(() => {
  if (sharedLinkHandled.current) return;
  sharedLinkHandled.current = true;

  const payload = readPayloadFromLocation();
  if (!payload) return;                  // no share link

  const incoming = decodeFlowFromPayload(payload);
  // Undecodable or oversized → decode returns null.
  if (!incoming) {
    addToast({ type: 'error', title: 'Could not open link', description: 'The shared flow link is invalid or too large.' });
    clearPayloadFromLocation();
    return;
  }
  // Decoded but sanitizeFlow rejected the graph (empty fallback) while payload was non-trivial.
  if (incoming.nodes.length === 0 && payload.length > 32) {
    addToast({ type: 'warning', title: 'Shared flow was invalid', description: 'The link decoded but failed validation; starting empty.' });
    clearPayloadFromLocation();
    return;
  }

  const current = useFlowStore.getState().flow;
  const replace =
    current.nodes.length === 0 ||
    window.confirm('Open the shared flow? This replaces your current canvas.');
  if (replace) {
    loadFlow(incoming);
    addToast({ type: 'success', title: 'Shared flow loaded', description: `"${incoming.name}" opened from link.` });
  }
  clearPayloadFromLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);   // run once on mount
```
> Run-once via `sharedLinkHandled` ref + empty deps; we read `useFlowStore.getState()` imperatively to avoid re-running on flow changes.

### Step 4 — Header "Share" button
`apps/studio/src/components/layout/Header.tsx`. Add `Share2` to the lucide import (`:2-18`):
```tsx
import { Play, Download, Upload, Save, Sun, Moon, Monitor, ChevronDown, Check, Pencil, Undo, Redo, Menu, FilePlus, Trash2, Share2 } from 'lucide-react';
```
Header is rendered without an `addToast` prop today; the simplest path is to surface the toast from `AppInner` via a callback prop, OR call `useToast()` inside Header (Header is inside `ToastProvider`). Use the hook directly:
```tsx
import { useToast } from '../ui';   // verify export path; ui barrel exports ToastProvider/useToast
// inside Header component body:
const { addToast } = useToast();
const flow = useFlowStore((state) => state.flow);   // already present
```
Add the handler (near `handleSaveFlow`, `:~430`):
```tsx
const handleShare = useCallback(async () => {
  const res = buildShareUrl(flow);
  if (!res.ok || !res.url) {
    addToast({
      type: 'error',
      title: 'Cannot create link',
      description: res.error === 'too-large'
        ? 'This flow is too large to share via URL. Use Export instead.'
        : 'Failed to encode the flow.',
    });
    return;
  }
  try {
    await navigator.clipboard.writeText(res.url);
    addToast({
      type: 'success',
      title: 'Share link copied',
      description: 'Anyone with this link can open this flow. It contains the flow (incl. any account URLs) but never private keys.',
      duration: 7000,
    });
  } catch {
    // Clipboard blocked (insecure context / permissions) — fall back to prompt.
    window.prompt('Copy this share link:', res.url);
  }
}, [flow, addToast]);
```
Import the util at top of `Header.tsx`:
```tsx
import { buildShareUrl } from '../../lib/share-link';
```
Render the button in the right-section cluster, next to Save/Import/Export:
```tsx
<button
  onClick={handleShare}
  disabled={flow.nodes.length === 0}
  className={cn(
    'hidden sm:flex p-2 rounded-lg transition-colors',
    flow.nodes.length > 0
      ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
  )}
  title="Share Flow (copy link)"
>
  <Share2 className="w-4 h-4" />
</button>
```
> `useCallback`, `cn`, `useFlowStore` are already imported in Header. Confirm `useToast` is exported from `../ui` (it is used in `App.tsx` via `import { ..., useToast } from './components/ui'`).

## 6. Tests / verification
```bash
npm i lz-string --workspace=apps/studio
npm run typecheck --workspace=apps/studio   # expect clean (cross-ref P1-8)
npm test --workspace=apps/studio
npm run dev --workspace=apps/studio
```
Unit tests (new `apps/studio/src/lib/share-link.test.ts`, vitest):
```ts
import { describe, it, expect } from 'vitest';
import { encodeFlowToPayload, decodeFlowFromPayload, buildShareUrl, MAX_ENCODED_LENGTH } from './share-link';
import { createEmptyFlow } from '@accumulate-studio/types';

describe('share-link round trip', () => {
  it('encodes and decodes a flow', () => {
    const flow = createEmptyFlow('My Flow');
    const enc = encodeFlowToPayload(flow);
    expect(enc.ok).toBe(true);
    const dec = decodeFlowFromPayload(enc.payload!);
    expect(dec).not.toBeNull();
    expect(dec!.name).toBe('My Flow');
  });
  it('rejects garbage payloads safely (no throw, returns empty flow)', () => {
    const dec = decodeFlowFromPayload('!!!not-valid-lz!!!');
    // decompress fails -> null OR sanitize -> empty; either is non-crashing
    expect(dec === null || dec!.nodes.length === 0).toBe(true);
  });
  it('refuses oversized encodes', () => {
    const flow = createEmptyFlow('Big');
    // @ts-expect-error inject bulk to exceed threshold
    flow.nodes = Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}`, type: 'Comment', position: { x: i, y: i }, config: {} }));
    const enc = encodeFlowToPayload(flow);
    if (enc.ok) expect(enc.length!).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);
    else expect(enc.error).toBe('too-large');
  });
});
```
Manual checklist:
- [ ] Build a small flow → click Share → toast "Share link copied"; clipboard holds `…/#flow=…`.
- [ ] Paste the link in a new tab/incognito → flow loads; toast "Shared flow loaded"; URL hash is cleared after load (refresh does not re-prompt).
- [ ] Open a link while a non-empty flow exists → confirm dialog appears; declining keeps the current flow.
- [ ] Tamper with the `#flow=` payload (delete chars) → error/warning toast, no crash, canvas stays usable.
- [ ] Build a very large flow → Share refuses with "too large, use Export" toast.
- [ ] Confirm the encoded payload contains no key material (it can't — `Flow` has none).

## 7. Risks, rollback, out of scope

**Risks**
- **Untrusted input**: the entire safety of this feature rests on `decodeFlowFromPayload` routing through P1-6 `sanitizeFlow`. Do not add any code path that `loadFlow`s decoded JSON directly. Hard dependency on P1-6 — do not ship P3-3 before P1-6.
- **Privacy**: flows may contain account URLs in block config; the link embeds them. The Share toast explicitly states this. Do not extend the model to hold secrets.
- **URL length**: hash-based + lz-string keeps most flows well under limits; the 8 KB cap + "use Export" message handles outliers.
- **Clipboard API** requires a secure context (https/localhost); the `window.prompt` fallback covers blocked clipboard.

**Rollback**: remove the Header Share button + handler, the App load-on-mount effect, and `share-link.ts`; uninstall `lz-string`. Exporting `sanitizeFlow` is harmless to leave.

**Out of scope**: server-side short links / persistence, sharing execution results or receipts, embedding the selected network/language in the link (could be a follow-up param), and collaborative/real-time editing.
