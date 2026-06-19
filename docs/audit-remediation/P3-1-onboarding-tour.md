# P3-1 — Interactive First-Run Product Tour + Replayable Help

| Field | Value |
|---|---|
| Priority | P3 |
| Severity | Opportunity |
| Effort | M (3–4 days) |
| Risk | Low |
| Depends on | none |
| Blocks | none |
| Primary files | `apps/studio/src/components/modals/WelcomeModal.tsx`, **new** `apps/studio/src/components/onboarding/ProductTour.tsx`, **new** `apps/studio/src/components/onboarding/tour-steps.ts`, `apps/studio/src/App.tsx`, `apps/studio/src/components/layout/Header.tsx`, `apps/studio/src/store/ui-store.ts`, `apps/studio/package.json` |

---

## 1. Problem & impact

The Welcome experience is a 3-step **informational** modal (`WelcomeModal.tsx`) shown once. After dismissal it can **never be reopened** — there is no Help/"?" affordance anywhere in the app. Verified: `Header.tsx` imports `Play, Download, Upload, Save, Sun, Moon, Monitor, ChevronDown, Check, Pencil, Undo, Redo, Menu, FilePlus, Trash2` — **no Help/HelpCircle icon, no help button**. The modal never points at the *actual* UI (it shows generic cards), so a new user reads about "Action Palette / Flow Canvas / Code Panel" but is never shown where they physically are. Impact: weak activation, no way to re-learn, support friction.

## 2. Evidence (current code)

### 2a. Welcome is informational-only, dismissal sets a one-way flag
`WelcomeModal.tsx:166-176`:
```tsx
const handleTemplate = () => {
  useUIStore.setState({ hasCompletedOnboarding: true });
  onClose();
  useUIStore.getState().openModal('template-select');
};
const handleScratch = () => {
  useUIStore.setState({ hasCompletedOnboarding: true });
  onClose();
};
```
The "Quick Tour" step (`WelcomeModal.tsx:37-83`) renders three static cards (`Action Palette`, `Flow Canvas`, `Code Panel`) — it does **not** spotlight real regions.

### 2b. Welcome opens once, gated by `hasCompletedOnboarding`
`App.tsx:106-110`:
```tsx
useEffect(() => {
  if (!hasCompletedOnboarding) {
    openModal('welcome');
  }
}, [hasCompletedOnboarding, openModal]);
```

### 2c. Persistence of the dismissal flag
`ui-store.ts:46` (`hasCompletedOnboarding: boolean`), default `false` (`:98`), persisted via `partialize` (`:189-199` includes `hasCompletedOnboarding`), and migrated so existing users skip it (`ui-store.ts:165-168`):
```ts
if (version <= 1) {
  // existing users who already have persisted state should skip onboarding
  state.hasCompletedOnboarding = true;
}
```
There is no field for "tour completed" and no `completeOnboarding`-equivalent for a tour.

### 2d. No Help button in the Header
`Header.tsx:400-560` (right section) renders NetworkSelector, ThemeToggle, Save, Import, Export, validation dot, Execute. No Help control. The Welcome modal is registered (`ModalContainer.tsx:20` `WELCOME: 'welcome'`) but only ever opened from `App.tsx:108`.

### 2e. Real DOM regions to spotlight (current wrappers, no tour anchors yet)
`App.tsx` renders, in order:
- Header — `<Header onTogglePalette={togglePalette} />` (`App.tsx:298`)
- Palette wrapper — `App.tsx:305-309`: `<div className="flex-shrink-0 overflow-hidden" style={{ width: paletteWidth }}><ActionPalette /></div>`
- Canvas wrapper — `App.tsx:~355`: `<div className="flex-1 relative min-h-0"><FlowCanvas /></div>`
- Code panel wrapper — `App.tsx:~470`: `<div className="flex-shrink-0 overflow-hidden" style={{ width: codePanelWidth }}><CodePanel /></div>`
- Execute button — `Header.tsx:~540` `<Button ... onClick={handleExecute}>… Execute</Button>`
- Network selector — `Header.tsx:~460` `<NetworkSelector value={selectedNetwork} ... />`

None carry a stable test/tour anchor today.

## 3. Root cause

Onboarding was built as a single dismiss-once modal with a boolean gate, never as a re-entrant, UI-anchored tour. No persistent help entry point was added, and no DOM anchors exist for spotlighting.

## 4. Target behavior & acceptance criteria

- [ ] First-run (when `hasCompletedTour` is false) shows a spotlight tour over the **real** UI regions: Action Palette, Flow Canvas, Code Panel, Network Selector, Execute button.
- [ ] The Welcome modal still appears first; finishing it ("Start from Scratch"/"Start with a Template") launches the tour (template path can launch the tour after the template modal closes, or skip — see step 5).
- [ ] A persistent Help ("?") button lives in the Header at all times and offers: **Replay tour** and **Show welcome** (reopen `WelcomeModal`).
- [ ] Tour can be skipped at any step; skipping or finishing sets `hasCompletedTour = true` (persisted). Power users are never blocked — the tour is dismissible with Esc, a Skip button, and an overlay that does not trap interaction beyond the spotlight.
- [ ] `hasCompletedTour` persists across reloads and migrates so existing users do not get the tour unexpectedly.
- [ ] Tour anchors are stable `data-tour="…"` attributes on real elements (not brittle CSS selectors).

## 5. Implementation steps

### Library choice — recommend `react-joyride`
Justification: `react-joyride` (MIT, ~widely used) gives spotlight/overlay/beacon, step controls, scroll-into-view, and a callback lifecycle for free — building robust spotlight math + focus management by hand is the bulk of the effort and error-prone. The app already pulls in heavier deps (`@xyflow/react`, Radix, Monaco), so one more focused UI dep is proportionate. A "lightweight custom approach" is rejected because correct spotlight positioning across resizable panels (`App.tsx` ResizeHandles) and scroll containers is exactly what joyride solves.

Install: `npm i react-joyride --workspace=apps/studio`.

### Step 1 — Add `data-tour` anchors to real elements
`apps/studio/src/App.tsx`, palette wrapper (`:305-309`):
```tsx
<div className="flex-shrink-0 overflow-hidden" style={{ width: paletteWidth }}>
  <ActionPalette />
</div>
```
→
```tsx
<div data-tour="palette" className="flex-shrink-0 overflow-hidden" style={{ width: paletteWidth }}>
  <ActionPalette />
</div>
```
Canvas wrapper:
```tsx
<div className="flex-1 relative min-h-0">
  <FlowCanvas />
```
→
```tsx
<div data-tour="canvas" className="flex-1 relative min-h-0">
  <FlowCanvas />
```
Code panel wrapper:
```tsx
<div className="flex-shrink-0 overflow-hidden" style={{ width: codePanelWidth }}>
  <CodePanel />
</div>
```
→
```tsx
<div data-tour="code-panel" className="flex-shrink-0 overflow-hidden" style={{ width: codePanelWidth }}>
  <CodePanel />
</div>
```
`apps/studio/src/components/layout/Header.tsx` — NetworkSelector usage (right section):
```tsx
<NetworkSelector value={selectedNetwork} onChange={setSelectedNetwork} />
```
→ wrap it:
```tsx
<span data-tour="network-selector">
  <NetworkSelector value={selectedNetwork} onChange={setSelectedNetwork} />
</span>
```
Execute button (`Header.tsx`, end of right section):
```tsx
<Button variant="primary" size="sm" onClick={handleExecute} disabled={isExecuting || flow.nodes.length === 0} ...>
  <Play className="w-4 h-4 mr-2" />
  {isExecuting ? 'Executing...' : 'Execute'}
</Button>
```
→ add the attribute to the Button (Button forwards DOM props; if it does not, wrap in a `<span data-tour="execute">`):
```tsx
<Button data-tour="execute" variant="primary" size="sm" onClick={handleExecute} disabled={isExecuting || flow.nodes.length === 0} ...>
```
> If `Button` (in `components/ui`) does not spread `...rest` onto the underlying element, use the `<span data-tour="execute">` wrapper instead — verify before choosing.

### Step 2 — Tour step definitions
New file `apps/studio/src/components/onboarding/tour-steps.ts`:
```ts
import type { Step } from 'react-joyride';

export const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="palette"]',
    title: 'Action Palette',
    content: 'Browse Accumulate operations and drag them onto the canvas to build a flow.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '[data-tour="canvas"]',
    title: 'Flow Canvas',
    content: 'Arrange and connect blocks here. Connections define the order your transactions run in.',
    placement: 'top',
  },
  {
    target: '[data-tour="code-panel"]',
    title: 'Generated Code',
    content: 'Your flow is compiled live into Python, Rust, Dart, JavaScript and C# SDK code.',
    placement: 'left',
  },
  {
    target: '[data-tour="network-selector"]',
    title: 'Network',
    content: 'Pick the network you target. Kermit is the safe default; Mainnet uses real ACME tokens.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="execute"]',
    title: 'Execute',
    content: 'When your flow is valid, run it end-to-end on the selected network and watch results stream in.',
    placement: 'bottom',
  },
];
```

### Step 3 — Tour component
New file `apps/studio/src/components/onboarding/ProductTour.tsx`:
```tsx
import React, { useCallback } from 'react';
import Joyride, { CallBackProps, STATUS, EVENTS } from 'react-joyride';
import { TOUR_STEPS } from './tour-steps';
import { useUIStore } from '../../store';

export const ProductTour: React.FC = () => {
  const tourRunning = useUIStore((s) => s.tourRunning);
  const stopTour = useUIStore((s) => s.stopTour);
  const completeTour = useUIStore((s) => s.completeTour);

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, type } = data;
    if (status === STATUS.FINISHED) {
      completeTour();            // sets hasCompletedTour=true AND tourRunning=false
    } else if (status === STATUS.SKIPPED || type === EVENTS.TOUR_END) {
      stopTour();                // tourRunning=false; also mark completed so it doesn't auto-replay
      completeTour();
    }
  }, [completeTour, stopTour]);

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={tourRunning}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose          // Esc + Skip close it; clicking outside the spotlight does not accidentally end it
      scrollToFirstStep
      callback={handleCallback}
      styles={{ options: { zIndex: 10000, primaryColor: '#3b82f6' } }}
      locale={{ last: 'Done', skip: 'Skip tour' }}
    />
  );
};
```
> Power-user guarantee: `showSkipButton` + Esc dismiss; the overlay only spotlights, it does not block the rest of the app once dismissed. Do **not** set `disableOverlay` to false-trap.

### Step 4 — UI-store: tour state + persistence + migration
`apps/studio/src/store/ui-store.ts`. Add to `UIState` (near `hasCompletedOnboarding`, `:46`):
```ts
  hasCompletedTour: boolean;
  tourRunning: boolean;          // transient — NOT persisted
```
Add to `UIActions`:
```ts
  startTour: () => void;
  stopTour: () => void;
  completeTour: () => void;
```
`initialState` (`:78-99`) add:
```ts
  hasCompletedTour: false,
  tourRunning: false,
```
Action implementations (inside the `create(...)` body):
```ts
  startTour: () => set({ tourRunning: true }),
  stopTour: () => set({ tourRunning: false }),
  completeTour: () => set({ hasCompletedTour: true, tourRunning: false }),
```
Persist: add `hasCompletedTour` (NOT `tourRunning`) to `partialize` (`:189-199`):
```ts
      partialize: (state) => ({
        theme: state.theme,
        showPalette: state.showPalette,
        showCodePanel: state.showCodePanel,
        showExecutionPanel: state.showExecutionPanel,
        panelSizes: state.panelSizes,
        selectedLanguage: state.selectedLanguage,
        codeMode: state.codeMode,
        selectedNetwork: state.selectedNetwork,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasCompletedTour: state.hasCompletedTour,
      }),
```
Bump persist `version: 2` → `version: 3` and extend `migrate` (`:152-172`) so existing users are not surprised by the tour:
```ts
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        // ... existing v0 / v1 blocks unchanged ...
        if (version <= 2) {
          // Existing users have already learned the app — don't auto-run the tour.
          state.hasCompletedTour = true;
        }
        return state as UIState & UIActions;
      },
```

### Step 5 — Wire first-run launch + render the tour
`apps/studio/src/App.tsx`. Import and add selectors near the existing onboarding block (`:104-110`):
```tsx
import { ProductTour } from './components/onboarding/ProductTour';
// ...
const hasCompletedTour = useUIStore((s) => s.hasCompletedTour);
const startTour = useUIStore((s) => s.startTour);
const activeModal = useUIStore((s) => s.activeModal);
```
Replace the onboarding effect (`:106-110`) so the tour starts after the Welcome modal closes (first run only):
```tsx
useEffect(() => {
  if (!hasCompletedOnboarding) {
    openModal('welcome');
  }
}, [hasCompletedOnboarding, openModal]);

// Launch the tour the first time, once Welcome has been dismissed
useEffect(() => {
  if (hasCompletedOnboarding && !hasCompletedTour && activeModal === null) {
    startTour();
  }
}, [hasCompletedOnboarding, hasCompletedTour, activeModal, startTour]);
```
Render `<ProductTour />` once inside `AppInner`'s returned tree (e.g. just before `<ModalContainer />` near the end of the JSX):
```tsx
        <ProductTour />
        <ModalContainer />
```

### Step 6 — Header Help ("?") button
`apps/studio/src/components/layout/Header.tsx`. Add `HelpCircle` to the lucide import (`:2-18`):
```tsx
import { Play, Download, Upload, Save, Sun, Moon, Monitor, ChevronDown, Check, Pencil, Undo, Redo, Menu, FilePlus, Trash2, HelpCircle } from 'lucide-react';
```
Pull the actions from the store (the Header already calls `useUIStore`, add near `openModal` selector ~`:340`):
```tsx
const startTour = useUIStore((state) => state.startTour);
```
Add a small dropdown Help button modeled on the existing `ThemeToggle` pattern (`Header.tsx:160-243`). Minimal version (no dropdown — two clicks would be a popover; here a single button that replays the tour, plus a secondary action via a tiny menu). Drop this into the right section, before the ThemeToggle:
```tsx
const HelpMenu: React.FC<{ onReplayTour: () => void; onShowWelcome: () => void }> = ({ onReplayTour, onShowWelcome }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn('p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors')}
        title="Help"
        aria-label="Help"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
      {open && (
        <div className={cn('absolute top-full right-0 mt-1 w-48 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50')}>
          <button className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => { setOpen(false); onReplayTour(); }}>
            Replay product tour
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={() => { setOpen(false); onShowWelcome(); }}>
            Show welcome screen
          </button>
        </div>
      )}
    </div>
  );
};
```
Render it in the right-section cluster (just before `<ThemeToggle ... />`):
```tsx
<HelpMenu
  onReplayTour={() => startTour()}
  onShowWelcome={() => openModal('welcome')}
/>
```
> `useState`, `useRef`, `useEffect`, `cn` are already imported in `Header.tsx`. "Replay product tour" calls `startTour()` regardless of `hasCompletedTour`, so it always works.

## 6. Tests / verification
```bash
npm i react-joyride --workspace=apps/studio
npm run typecheck --workspace=apps/studio    # expect: clean (cross-ref P1-8 studio typecheck)
npm run dev --workspace=apps/studio
```
Manual checklist (fresh profile / cleared localStorage `accumulate-studio-ui`):
- [ ] First load: Welcome modal appears; after "Start from Scratch" the spotlight tour begins on the Action Palette.
- [ ] Tour highlights, in order: palette → canvas → code panel → network selector → Execute.
- [ ] Esc and "Skip tour" both end the tour; reloading does NOT re-show it (`hasCompletedTour` persisted).
- [ ] Header "?" button is always visible; "Replay product tour" re-runs the spotlight; "Show welcome screen" reopens `WelcomeModal`.
- [ ] With an existing persisted profile (version ≤ 2), after migration the tour does **not** auto-run (`hasCompletedTour === true`), but "?" → Replay still works.
- [ ] Resizing panels mid-tour: the spotlight repositions correctly (joyride re-measures on step change).

Persisted-state inspection: in DevTools, `JSON.parse(localStorage['accumulate-studio-ui'])` should show `"version":3`, `state.hasCompletedTour` present, and `tourRunning` absent (transient).

## 7. Risks, rollback, out of scope

**Risks**
- `react-joyride` overlay z-index must beat Radix dialogs (`zIndex: 10000` set); verify it sits above the Header and below any error toast you want visible.
- If a `data-tour` target is hidden (e.g. user collapsed the palette via Ctrl+B before replaying), joyride skips/errs on that step — acceptable; optionally `startTour` could first ensure panels are visible. Note as a polish item.

**Rollback**: remove `<ProductTour />` render + the launch effect + the Help menu; uninstall `react-joyride`. The `data-tour` attributes are inert and can stay. The store fields default safely.

**Out of scope**: contextual per-feature coach-marks, analytics on tour completion, and changing the Welcome modal's internal copy/steps.
