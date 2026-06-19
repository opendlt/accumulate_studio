# P2-4 — Accessibility: Radix Menus, ARIA Labels, Keyboard-Operable Resize, Keyboard Block Placement

| Field | Value |
| --- | --- |
| Priority | P2 |
| Severity | Medium |
| Effort | M |
| Risk | Medium (replaces two hand-rolled dropdowns with Radix; touches Header, App, FlowCanvas, palette) |
| Depends on | P2-3 (shares the Radix-component convention; not a hard blocker) |
| Blocks | None |
| Primary files | `apps/studio/src/components/layout/Header.tsx`, `apps/studio/src/App.tsx`, `apps/studio/src/components/flow-builder/FlowCanvas.tsx`, `apps/studio/src/components/palette/ActionPalette.tsx`, `apps/studio/src/components/palette/BlockItem.tsx`, `apps/studio/src/components/layout/NetworkStatusIndicator.tsx` |

---

## 1. Problem & impact

The app's modals use Radix (`@radix-ui/react-dialog`, `@radix-ui/react-tabs`) and therefore get focus trapping, `aria-*`, and keyboard handling for free. But several interactive surfaces are hand-rolled `<button>` + absolutely-positioned `<div>` constructs with **no** ARIA semantics or keyboard support:

1. **`NetworkSelector`** (`Header.tsx:60-159`) and **`ThemeToggle`** (`Header.tsx:170-244`) are custom dropdowns: the trigger lacks `aria-haspopup`/`aria-expanded`, the menu has no `role="menu"`, items have no `role="menuitem"`, there is no arrow-key navigation, no `Escape`-to-close on the menu items, and no focus return to the trigger on close. Screen-reader users hear a generic button; keyboard users cannot operate the menu at all (only `Tab` lands on each item with no roving focus or close affordance).
2. **Canvas and palette regions** have no `aria-label`/landmark roles. A screen-reader user navigating regions cannot tell the canvas from the code panel from the palette.
3. **`ResizeHandle`** (`App.tsx:42-94`) is mouse-only: it has `onMouseDown` and visual styling but **no `role`, no `aria-valuenow/min/max`, no `tabIndex`, no keyboard handler**. Keyboard users cannot resize panels at all.
4. **Block placement is effectively DnD-only.** Drag-and-drop is the documented method; click-to-append (`BlockItem.tsx`) exists but is undocumented and not announced, so keyboard/AT users have no discoverable way to add blocks.

**Impact:** the app fails WCAG 2.1 keyboard-operability (2.1.1) and name/role/value (4.1.2) for core controls; AT users cannot change network/theme, resize panels, or reliably place blocks.

---

## 2. Evidence (current code)

**Custom dropdown trigger, no ARIA (`Header.tsx:84-103`):**
```tsx
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(/* ... */)}
      >
        <span className={cn('w-2 h-2 rounded-full', /* ... */)} />
        {selectedNetwork.name}
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>
```
**Menu container is a plain div, items are plain buttons (`Header.tsx:105-155`):**
```tsx
      {isOpen && (
        <div className={cn('absolute top-full right-0 mt-1 w-56 py-1', /* ... */ 'z-50')}>
          {networkOptions.map((network) => (
            <button key={network.id} onClick={() => { onChange(network.id); setIsOpen(false); }} /* ... */>
```
`ThemeToggle` (`Header.tsx:197-241`) has the same shape: bare trigger button, `{isOpen && <div>…<button>}`.

**ResizeHandle — mouse only (`App.tsx:71-93`):**
```tsx
  return (
    <div
      className={cn(/* ... */)}
      onMouseDown={handleMouseDown}
    >
      <div className={cn('transition-opacity opacity-0 group-hover:opacity-100', /* ... */)}>
        <GripVertical className="w-3 h-3 text-gray-400" />
      </div>
    </div>
  );
```
No `role`, `tabIndex`, `aria-*`, or `onKeyDown`.

**Canvas region — no label (`FlowCanvas.tsx:458-462`):**
```tsx
    <div
      ref={reactFlowWrapper}
      className="flex-1 h-full bg-gray-100 dark:bg-gray-950"
    >
```

**Palette region** — `ActionPalette.tsx` wraps `BlockItem`s; the scroll container has no `role`/`aria-label` (confirmed: no `aria-` attributes in palette files).

---

## 3. Root cause

The dropdowns and resize handle were built ad-hoc before standardizing on Radix primitives. Radix's `@radix-ui/react-dialog` and `react-tabs` are already dependencies, but `@radix-ui/react-dropdown-menu` was never added, so menus stayed hand-rolled. ARIA labels on layout regions were never added because the visual layout "reads" fine sighted. The resize handle was implemented purely for the mouse-drag interaction.

---

## 4. Target behavior & acceptance criteria

- [ ] `NetworkSelector` and `ThemeToggle` are rebuilt on `@radix-ui/react-dropdown-menu`. Trigger exposes `aria-haspopup="menu"` and `aria-expanded` (Radix supplies these); menu has `role="menu"`; items have `role="menuitem"`; arrow keys move focus; `Enter`/`Space` select; `Escape` closes and returns focus to the trigger. Visual appearance is preserved (same colors, dot indicators, check marks, "REAL TOKENS" badge).
- [ ] The canvas wrapper has `role="application"` (or `region`) + `aria-label="Flow canvas"`; the palette scroll region has `role="region"` + `aria-label="Action palette"`; the palette list has `role="list"` and items `role="listitem"`/`role="button"` with `tabIndex={0}` + `onKeyDown` Enter/Space activation.
- [ ] `ResizeHandle` is keyboard-operable: `role="separator"`, `aria-orientation`, `aria-valuenow/min/max`, `aria-label`, `tabIndex={0}`, and Arrow-key resize (Left/Right for horizontal, Up/Down for vertical) plus `Home`/`End` to clamp to min/max. It receives current value + min/max via props.
- [ ] Keyboard block placement is documented: palette items are focusable and `Enter`/`Space` places the focused block (reusing the click handler from P2-3 Part C); a short "Keyboard" hint is added to the palette and/or WelcomeModal.
- [ ] No regression in mouse behavior; `pnpm --filter @accumulate-studio/studio build` passes; axe-core smoke test (optional) reports no new critical violations on the dropdowns.

---

## 5. Implementation steps

### Step 1 — add the dependency

```bash
pnpm --filter @accumulate-studio/studio add @radix-ui/react-dropdown-menu
```

### Step 2 — convert `NetworkSelector` to Radix `DropdownMenu`

Replace the entire `NetworkSelector` component (`Header.tsx:60-159`). Remove the `useState`/`useRef`/`useEffect` click-outside plumbing — Radix handles open state, outside-click, focus return, and keyboard nav.

Add to the Header imports (top of file):
```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
```
You can drop the now-unused `useEffect`/`useRef` *for these components* (keep them if other components in the file still use them — `EditableFlowName` uses `useRef`/`useEffect`, so leave the React import intact).

Before (`Header.tsx:60-159`, abridged):
```tsx
const NetworkSelector: React.FC<NetworkSelectorProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedNetwork = NETWORKS[value];
  useEffect(() => { /* click outside */ }, []);
  const activeNetworkIds: NetworkId[] = ['mainnet', 'kermit', 'local'];
  const networkOptions = activeNetworkIds.map((id) => NETWORKS[id]);
  return (
    <div ref={dropdownRef} className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className={cn(/* trigger */)}>
        <span className={cn('w-2 h-2 rounded-full', /* dot */)} />
        {selectedNetwork.name}
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && (
        <div className={cn('absolute top-full right-0 mt-1 w-56 py-1', /* menu */)}>
          {networkOptions.map((network) => (
            <button key={network.id} onClick={() => { onChange(network.id); setIsOpen(false); }} /* ... */>
              {/* dot, name, REAL TOKENS badge, description, check */}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
```
After:
```tsx
const NetworkSelector: React.FC<NetworkSelectorProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selectedNetwork = NETWORKS[value];

  // Only show active networks (testnet/devnet are defunct)
  const activeNetworkIds: NetworkId[] = ['mainnet', 'kermit', 'local'];
  const networkOptions = activeNetworkIds.map((id) => NETWORKS[id]);

  const dotClass = (id: NetworkId) =>
    cn(
      'w-2 h-2 rounded-full flex-shrink-0',
      id === 'mainnet' && 'bg-green-500',
      id === 'kermit' && 'bg-purple-500',
      id === 'local' && 'bg-gray-500'
    );

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Network: ${selectedNetwork.name}`}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
            'hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
            'text-gray-900 dark:text-gray-100',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accumulate-500'
          )}
        >
          <span className={dotClass(value)} />
          {selectedNetwork.name}
          <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={cn(
            'w-56 py-1 z-50',
            'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
            'border border-gray-200 dark:border-gray-700',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        >
          {networkOptions.map((network) => (
            <DropdownMenu.Item
              key={network.id}
              onSelect={() => onChange(network.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2 text-left outline-none cursor-pointer',
                'data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700',
                value === network.id && 'bg-gray-50 dark:bg-gray-700/50'
              )}
            >
              <span className={dotClass(network.id)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {network.name}
                  </span>
                  {network.id === 'mainnet' && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      REAL TOKENS
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {network.description}
                </div>
              </div>
              {value === network.id && (
                <Check className="w-4 h-4 text-accumulate-500 flex-shrink-0" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
```
> Radix `DropdownMenu.Trigger asChild` automatically sets `aria-haspopup="menu"` and `aria-expanded` on the child button; `Content` is `role="menu"` and `Item` is `role="menuitem"` with roving focus and arrow-key nav. The explicit `aria-label` on the trigger gives AT a stable name.

### Step 3 — convert `ThemeToggle` to Radix `DropdownMenu`

Replace `ThemeToggle` (`Header.tsx:170-244`).

Before (abridged):
```tsx
const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => { /* click outside */ }, []);
  const themes = [ /* light/dark/system */ ];
  const currentTheme = themes.find((t) => t.id === theme) || themes[2];
  const ThemeIcon = currentTheme.icon;
  return (
    <div ref={dropdownRef} className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className={cn(/* ... */)} title="Theme">
        <ThemeIcon className="w-5 h-5" />
      </button>
      {isOpen && (
        <div className={cn('absolute top-full right-0 mt-1 w-36 py-1', /* ... */)}>
          {themes.map((t) => { /* button per theme */ })}
        </div>
      )}
    </div>
  );
};
```
After:
```tsx
const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onChange }) => {
  const themes = [
    { id: 'light' as const, label: 'Light', icon: Sun },
    { id: 'dark' as const, label: 'Dark', icon: Moon },
    { id: 'system' as const, label: 'System', icon: Monitor },
  ];
  const currentTheme = themes.find((t) => t.id === theme) || themes[2];
  const ThemeIcon = currentTheme.icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Theme: ${currentTheme.label}`}
          className={cn(
            'p-2 rounded-lg text-gray-600 dark:text-gray-400',
            'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accumulate-500'
          )}
        >
          <ThemeIcon className="w-5 h-5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={cn(
            'w-36 py-1 z-50',
            'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
            'border border-gray-200 dark:border-gray-700',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        >
          {themes.map((t) => {
            const Icon = t.icon;
            return (
              <DropdownMenu.Item
                key={t.id}
                onSelect={() => onChange(t.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 text-left outline-none cursor-pointer',
                  'data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700',
                  theme === t.id && 'bg-gray-50 dark:bg-gray-700/50'
                )}
              >
                <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-900 dark:text-gray-100">{t.label}</span>
                {theme === t.id && <Check className="w-4 h-4 text-accumulate-500 ml-auto" />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
```
> After Steps 2–3, the `useRef`/`useEffect` imports are still needed by `EditableFlowName`; do **not** delete them from the top-level React import.

> **Note on `NetworkStatusIndicator`** (`NetworkStatusIndicator.tsx:58-156`): it is a custom expandable *panel* (status detail, not a menu of choices). Converting it to `DropdownMenu` is optional and lower-value. Minimum a11y fix: add `aria-haspopup="dialog"`, `aria-expanded={expanded}`, and `aria-label` to its trigger button (`NetworkStatusIndicator.tsx:60-69`), and give the dropdown panel `role="dialog"` + `aria-label="Network status"`. Full Radix migration is out of scope for this doc.

### Step 4 — keyboard-operable `ResizeHandle`

Generalize the handle to accept the current value and bounds so it can announce and adjust them. Update both the component (`App.tsx:36-94`) and its three call-sites.

Before (`App.tsx:36-94`):
```tsx
interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction, onResize, className }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef(0);
  const handleMouseDown = useCallback((e: React.MouseEvent) => { /* ... */ }, [direction, onResize]);
  return (
    <div
      className={cn(/* ... */)}
      onMouseDown={handleMouseDown}
    >
      <div className={cn('transition-opacity opacity-0 group-hover:opacity-100', /* ... */)}>
        <GripVertical className="w-3 h-3 text-gray-400" />
      </div>
    </div>
  );
};
```
After:
```tsx
interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  /** Current size (px) for ARIA + keyboard clamping. */
  value: number;
  min: number;
  max: number;
  /** Accessible name, e.g. "Resize palette". */
  label: string;
  className?: string;
}

// Pixels moved per arrow-key press.
const KEYBOARD_STEP = 16;

const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onResize,
  value,
  min,
  max,
  label,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPosRef.current;
        startPosRef.current = currentPos;
        onResize(delta);
      };
      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResize]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // For horizontal handles a positive onResize delta grows the panel to the
      // LEFT of the handle (palette) and shrinks the one to the right; the
      // call-sites already encode that sign, so we just forward +/- KEYBOARD_STEP.
      let delta = 0;
      if (direction === 'horizontal') {
        if (e.key === 'ArrowLeft') delta = -KEYBOARD_STEP;
        else if (e.key === 'ArrowRight') delta = KEYBOARD_STEP;
      } else {
        if (e.key === 'ArrowUp') delta = -KEYBOARD_STEP;
        else if (e.key === 'ArrowDown') delta = KEYBOARD_STEP;
      }
      if (e.key === 'Home') delta = min - value;
      else if (e.key === 'End') delta = max - value;

      if (delta !== 0) {
        e.preventDefault();
        onResize(delta);
      }
    },
    [direction, onResize, min, max, value]
  );

  return (
    <div
      role="separator"
      aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex items-center justify-center transition-colors group',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accumulate-500',
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:bg-accumulate-500/20'
          : 'h-1 cursor-row-resize hover:bg-accumulate-500/20',
        isDragging && 'bg-accumulate-500/30',
        className
      )}
    >
      <div
        className={cn(
          'transition-opacity opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          direction === 'horizontal' ? 'rotate-90' : '',
          isDragging && 'opacity-100'
        )}
      >
        <GripVertical className="w-3 h-3 text-gray-400" />
      </div>
    </div>
  );
};
```
> An `aria-orientation` of a `separator` describes the separator line: a vertical-line handle that resizes horizontally is `aria-orientation="vertical"`. Adjust if your AT testing prefers the opposite convention — the key requirement is that the value is announced and arrow keys move it.

**Update the three call-sites** to pass the new props:

Palette handle (`App.tsx:311`):
```tsx
              <ResizeHandle
                direction="horizontal"
                onResize={handlePaletteResize}
                value={paletteWidth}
                min={MIN_PANEL_WIDTH}
                max={MAX_PANEL_WIDTH}
                label="Resize palette"
              />
```
Execution handle (`App.tsx:402`):
```tsx
                <ResizeHandle
                  direction="vertical"
                  onResize={handleExecutionResize}
                  value={executionHeight}
                  min={MIN_EXECUTION_HEIGHT}
                  max={MAX_EXECUTION_HEIGHT}
                  label="Resize execution panel"
                />
```
Code-panel handle (`App.tsx:438`):
```tsx
              <ResizeHandle
                direction="horizontal"
                onResize={handleCodePanelResize}
                value={codePanelWidth}
                min={MIN_PANEL_WIDTH}
                max={MAX_PANEL_WIDTH}
                label="Resize code panel"
              />
```

### Step 5 — ARIA labels on canvas + palette regions

Canvas wrapper (`FlowCanvas.tsx:458-462`):
```tsx
    <div
      ref={reactFlowWrapper}
      role="application"
      aria-label="Flow canvas — drag blocks here to build your flow"
      className="flex-1 h-full bg-gray-100 dark:bg-gray-950"
    >
```
Palette region — open `apps/studio/src/components/palette/ActionPalette.tsx` and add `role="region"` + `aria-label="Action palette"` to its outermost container, and `role="list"` to the block-list scroll container. Example (match to the real element names in that file):
```tsx
    <div role="region" aria-label="Action palette" className={/* existing */}>
      {/* ...search/header... */}
      <div role="list" className={/* existing scroll container */}>
        {blocks.map((block) => (
          <BlockItem key={block.type} block={block} />
        ))}
      </div>
    </div>
```

### Step 6 — keyboard-operable palette items + documented placement

Make each `BlockItem` focusable and Enter/Space-activatable, reusing the `handleClick` from P2-3 Part C (the unified prerequisite-aware placement). Update the root element (`BlockItem.tsx:126-138`):
```tsx
    <div
      role="button"
      tabIndex={0}
      aria-label={`Add block: ${block.name}. ${block.description}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg cursor-grab active:cursor-grabbing',
        'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
        'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accumulate-500',
        'transition-all duration-150'
      )}
    >
```
> `handleClick` already guards drag via `didDrag`; keyboard activation never sets `didDrag`, so Enter/Space always places. If P2-3 Part C is not yet merged, the keyboard handler still works against the existing `handleClick`, but blocks placed this way will skip prerequisite analysis until C lands — note this dependency in the PR.

**Document it.** Add a one-line keyboard hint to the palette footer/header (or the `WelcomeModal` "Action Palette" card text in `WelcomeModal.tsx`):
> "Tip: focus a block and press Enter to add it to the canvas — no mouse required."

---

## 6. Tests

**Component tests (Vitest + RTL + `@testing-library/user-event`):**
1. `NetworkSelector.test.tsx`: open via keyboard (`Tab` to trigger, `Enter`/`ArrowDown`) → menu opens; `ArrowDown`/`ArrowUp` move highlight; `Enter` on an item calls `onChange` with that id; `Escape` closes and focus returns to the trigger. Assert trigger has `aria-haspopup="menu"` and toggles `aria-expanded`.
2. `ThemeToggle.test.tsx`: same keyboard-open + select assertions; assert selecting "Dark" calls `onChange('dark')`.
3. `ResizeHandle.test.tsx`: render with `direction="horizontal"`, `value=280`, `min=200`, `max=600`; assert `role="separator"`, `aria-valuenow=280`. Fire `keyDown ArrowRight` → `onResize` called with `+16`; `ArrowLeft` → `-16`; `End` → `+320` (max−value); `Home` → `-80` (min−value). For `direction="vertical"`, Up/Down map instead of Left/Right.
4. `BlockItem.test.tsx`: focus item, press Enter → `handleClick` effects fire (`addNode` called); assert `role="button"`, `tabIndex=0`, and an `aria-label` containing the block name.

**Manual QA / AT checklist:**
- [ ] With keyboard only (no mouse): Tab to the network selector, open it, arrow to "Kermit", Enter — network changes; focus returns to the trigger.
- [ ] Same for the theme toggle.
- [ ] Tab to a resize handle (GripVertical shows on focus); Arrow keys resize the panel; Home/End jump to min/max; screen reader announces "Resize palette, separator, NNN".
- [ ] Tab into the palette; Enter on a focused block adds it to the canvas.
- [ ] VoiceOver/NVDA rotor lists "Flow canvas" and "Action palette" regions.
- [ ] Run axe DevTools on the header with a menu open → no "ARIA required" / "name-role-value" violations.
- [ ] Mouse drag on every resize handle still works exactly as before.

---

## 7. Risks, rollback, out of scope

- **Risk — Radix Portal z-index/stacking.** The new menus render in a portal; verify they sit above the header (`z-50` on `Content`) and are not clipped. The existing modals already portal successfully, so the app root supports it.
- **Risk — `asChild` button focus ring.** Radix forwards refs/props to the child button; keep the `focus-visible:ring` classes on the button so keyboard focus is visible.
- **Risk — ResizeHandle sign convention.** The code-panel handle uses `prev - delta` (`App.tsx:263`) while palette uses `prev + delta` (`App.tsx:259`); the keyboard handler forwards the same signed delta, so Right-arrow on the code-panel handle shrinks the code panel (grows the canvas). Confirm this matches user expectation during QA; if it feels inverted, swap the Left/Right mapping per-handle via an optional `invert` prop.
- **Rollback:** Steps are independent. Reverting the dropdown conversion restores the hand-rolled menus; reverting the ResizeHandle prop change requires reverting all three call-sites together (the new props are required — make them optional with defaults if you want a partial rollback).
- **Out of scope:** full Radix migration of `NetworkStatusIndicator`, focus-management inside React Flow nodes themselves (xyflow has its own a11y story), high-contrast theming, and screen-reader live-region announcements for execution progress.
