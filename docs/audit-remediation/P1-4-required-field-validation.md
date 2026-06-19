# [P1-4] — Required-field validation (Save gate, node badge, flow indicator, pre-run surfacing)

| Field | Value |
| --- | --- |
| Priority | P1 |
| Severity | High |
| Effort | M (≈2 days) |
| Risk | Medium |
| Depends on | — |
| Blocks | — |
| Primary files | `apps/studio/src/components/modals/BlockConfigModal.tsx`, `apps/studio/src/components/flow-builder/BlockNode.tsx`, `apps/studio/src/components/layout/Header.tsx`, `apps/studio/src/services/config-validation.ts` (new) |

---

## 1. Problem & impact

`BlockConfigModal.handleSave` saves **unconditionally** — the `required` asterisks rendered next to fields are purely cosmetic:

```tsx
// BlockConfigModal.tsx:483-488
const handleSave = () => {
  if (modalData?.nodeId) {
    updateNodeConfig(modalData.nodeId, config as BlockConfig);
  }
  onClose();
};
```

A user can save a `CreateIdentity` block with an empty `url` (a required field, `blocks.ts:308-315` `required: ['url']`). Nothing stops them in the modal, nothing flags the node on the canvas, and the flow-level validity dot (`Header.tsx:590-611`) only reflects **prerequisite** validation (`analyzeFlow`), not missing config. The first signal of trouble is a runtime failure during `executeFlow`.

Impact: invisible, late-surfacing errors. The asterisk UI implies enforcement that does not exist.

## 2. Evidence (current code)

The schema shape is `{ properties, required }`. `BlockConfigModal` already reads `requiredFields`:

```tsx
// BlockConfigModal.tsx:494-499
const schema = blockDef.configSchema as {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};
const properties = schema.properties ?? {};
const requiredFields = schema.required ?? [];
```

…and passes `required` to each field, which only renders an asterisk (e.g. `TextField`, `BlockConfigModal.tsx:46-51`):

```tsx
<label ...>
  {formatLabel(name)}
  {required && <span className="text-red-500 ml-1">*</span>}
</label>
```

Real `required` arrays exist throughout the catalog, e.g.:

```ts
// packages/types/src/blocks.ts:308-315 (CreateIdentity configSchema)
configSchema: { type:'object', properties: { url: {...} }, required: ['url'] }
// :390 CreateTokenAccount → required: ['url', 'tokenUrl']
// :414 CreateDataAccount → required: ['url']
```

Node card shows config preview but **no validity badge for config** — only the prerequisite `ValidationBadge` (`BlockNode.tsx:173-176`, fed by `selectNodeValidation` which comes from `analyzeFlow`/prerequisites, not config):

```tsx
// BlockNode.tsx:173-176
{validationResult && !executionState && (
  <ValidationBadge validationResult={validationResult} />
)}
```

Flow-level indicator is prerequisite-only (`Header.tsx:590-611`, `validationSeverity = selectFlowValidationSeverity`).

`updateNodeConfig` signature (`flow-store.ts:60`): `updateNodeConfig(nodeId, config)`.

The "auto-resolved" convention matters: fields whose description contains `auto-resolved`/`auto-fetched` are intentionally left blank and filled at runtime (`BlockConfigModal.tsx:406-410`, `hasAutoResolvedFields`). **These must NOT count as missing**, otherwise valid flows show false errors.

## 3. Root cause

Required-ness was modeled in the schema and rendered as an asterisk, but no validation function consumes it. There is no shared "is this node's config complete?" predicate, so neither the modal, the node card, nor the header can enforce it.

## 4. Target behavior & acceptance criteria

- [ ] A shared `getMissingRequiredFields(blockType, config)` returns the list of required field names that are empty AND not auto-resolved.
- [ ] In `BlockConfigModal`, Save validates: if any required field is missing, Save shows per-field inline errors and a footer summary, and **does not call `updateNodeConfig`/close**. (Save button stays enabled so the click can surface errors; alternatively disable Save and show summary — see Step 2 decision.)
- [ ] Inline error text appears under each offending field (red, dark-mode correct), and the field border turns red.
- [ ] The node card (`BlockNode`) shows a "N missing" badge when its config has missing required fields and the node is not currently executing.
- [ ] The flow-level Header indicator turns at least `warning` (red preferred) when any node has missing required fields, and its tooltip shows "Fix N issues".
- [ ] Execute pre-check: if any node has missing required fields, the confirm/execute path surfaces "Fix N issues before running" instead of failing at runtime. (Surface via toast or disabled confirm.)
- [ ] Auto-resolved fields left blank do **not** count as missing.
- [ ] Existing prerequisite badges/validation continue to work unchanged (config validation is additive, shown alongside).

## 5. Implementation steps

### Step 1 — Shared validation module

Create `apps/studio/src/services/config-validation.ts`:

```ts
import { BLOCK_CATALOG, type BlockType } from '@accumulate-studio/types';
import type { Flow } from '@accumulate-studio/types';

interface SchemaShape {
  properties?: Record<string, { description?: string }>;
  required?: string[];
}

/** A required field is "auto-resolved" if its description opts into runtime resolution. */
function isAutoResolved(desc?: string): boolean {
  if (!desc) return false;
  return desc.includes('auto-resolved') || desc.includes('auto-fetched');
}

/** True when a config value is considered empty for required-ness. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Returns the names of required fields that are empty and NOT auto-resolved.
 */
export function getMissingRequiredFields(
  blockType: BlockType,
  config: Record<string, unknown> | undefined
): string[] {
  const def = BLOCK_CATALOG[blockType];
  if (!def) return [];
  const schema = def.configSchema as SchemaShape;
  const required = schema.required ?? [];
  const props = schema.properties ?? {};
  const cfg = config ?? {};

  return required.filter((field) => {
    if (isAutoResolved(props[field]?.description)) return false;
    return isEmpty(cfg[field]);
  });
}

/** Count of nodes in a flow that have ≥1 missing required field. */
export function countNodesWithMissingFields(flow: Flow): number {
  return flow.nodes.reduce((n, node) => {
    const missing = getMissingRequiredFields(
      node.type,
      node.config as Record<string, unknown>
    );
    return n + (missing.length > 0 ? 1 : 0);
  }, 0);
}
```

> The empty/auto-resolved logic mirrors `BlockConfigModal.tsx:406-410`. Keep both in sync; ideally the modal imports `isAutoResolved` from here too (optional refactor).

### Step 2 — Save gate + inline errors in `BlockConfigModal`

Add error state and gate `handleSave`. Decision: **keep Save enabled** but block the save and reveal errors on click (clearer feedback than a silently-disabled button).

**Add imports / state** (top of component, near `BlockConfigModal.tsx:461`):

```tsx
import { getMissingRequiredFields } from '../../services/config-validation';
// …inside component:
const [errors, setErrors] = useState<string[]>([]);
```

Reset errors when the modal opens (extend the existing effect at `BlockConfigModal.tsx:468-472`):

```tsx
useEffect(() => {
  if (node && isOpen) {
    setConfig((node.config as Record<string, unknown>) ?? {});
    setErrors([]);
  }
}, [node, isOpen]);
```

Clear a field's error as the user types (extend `handleFieldChange`, `BlockConfigModal.tsx:475-480`):

```tsx
const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
  setConfig((prev) => ({ ...prev, [fieldName]: value }));
  setErrors((prev) => prev.filter((f) => f !== fieldName));
}, []);
```

**Gate `handleSave`** (`BlockConfigModal.tsx:483-488`):

**Before:**
```tsx
const handleSave = () => {
  if (modalData?.nodeId) {
    updateNodeConfig(modalData.nodeId, config as BlockConfig);
  }
  onClose();
};
```

**After:**
```tsx
const handleSave = () => {
  if (!modalData) return;
  const missing = getMissingRequiredFields(
    modalData.blockType,
    config as Record<string, unknown>
  );
  if (missing.length > 0) {
    setErrors(missing);
    return; // do NOT save or close
  }
  updateNodeConfig(modalData.nodeId, config as BlockConfig);
  onClose();
};
```

**Pass error state into fields.** The field components receive `required`; add an `error?: boolean` prop. Update the `FieldProps` interface (`BlockConfigModal.tsx:38-44`):

```tsx
interface FieldProps {
  name: string;
  property: SchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  required: boolean;
  error?: boolean;
}
```

For each text-like field, add a red border + message. Example for `TextField` (`BlockConfigModal.tsx:46-70`):

**Before:**
```tsx
const TextField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => (
  <div className="space-y-1.5">
    <label ...>{formatLabel(name)}{required && <span ...>*</span>}</label>
    <input type="text" ... className={cn(
      'w-full px-3 py-2 rounded-md border transition-colors',
      'bg-white dark:bg-gray-800',
      'border-gray-300 dark:border-gray-600',
      ...
    )} />
    {property.description && (<p ...>{property.description}</p>)}
  </div>
);
```

**After:**
```tsx
const TextField: React.FC<FieldProps> = ({ name, property, value, onChange, required, error }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {formatLabel(name)}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={property.description}
      className={cn(
        'w-full px-3 py-2 rounded-md border transition-colors',
        'bg-white dark:bg-gray-800',
        'text-gray-900 dark:text-gray-100',
        'placeholder-gray-400 dark:placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent',
        error
          ? 'border-red-500 dark:border-red-500'
          : 'border-gray-300 dark:border-gray-600'
      )}
    />
    {error && <p className="text-xs text-red-500">This field is required.</p>}
    {property.description && !error && (
      <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
    )}
  </div>
);
```

Apply the same `error` border/message pattern to `NumberField`, `UrlField`, `TextareaField`, `SelectField`, `ArrayField` (the `ObjectArrayField` and `BooleanField` are rarely `required`; add `error` to them only if a required object-array/boolean exists in the catalog — none currently, so optional).

**Wire `error` at the render site** (`BlockConfigModal.tsx:573-586`):

**Before:**
```tsx
{Object.entries(properties).map(([fieldName, property]) => {
  const FieldComponent = getFieldComponent(property);
  const isRequired = requiredFields.includes(fieldName);
  return (
    <FieldComponent key={fieldName} name={fieldName} property={property}
      value={config[fieldName]}
      onChange={(value) => handleFieldChange(fieldName, value)}
      required={isRequired} />
  );
})}
```

**After:**
```tsx
{Object.entries(properties).map(([fieldName, property]) => {
  const FieldComponent = getFieldComponent(property);
  const isRequired = requiredFields.includes(fieldName);
  return (
    <FieldComponent
      key={fieldName}
      name={fieldName}
      property={property}
      value={config[fieldName]}
      onChange={(value) => handleFieldChange(fieldName, value)}
      required={isRequired}
      error={errors.includes(fieldName)}
    />
  );
})}
```

**Footer summary** — add above the buttons in the footer (`BlockConfigModal.tsx:596-606`):

```tsx
<div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
  {errors.length > 0 && (
    <p className="mb-3 text-sm text-red-600 dark:text-red-400">
      Fix {errors.length} required field{errors.length !== 1 ? 's' : ''} before saving.
    </p>
  )}
  <div className="flex items-center justify-end gap-3">
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={handleSave}>
      <Save className="w-4 h-4 mr-2" />
      Save Configuration
    </Button>
  </div>
</div>
```

### Step 3 — Node-card "N missing" badge in `BlockNode`

Compute missing fields and render a badge in the header row, next to the existing `StatusIcon`/`ValidationBadge`.

**Add import + computation** (`BlockNode.tsx`, near `:71-83`):

```tsx
import { getMissingRequiredFields } from '../../services/config-validation';
// …inside BlockNode, after blockDef:
const missingRequired = getMissingRequiredFields(
  nodeData.type,
  nodeData.config as Record<string, unknown>
);
```

**Render badge** in the header, right before the delete button (`BlockNode.tsx:172-177`):

**Before:**
```tsx
        <StatusIcon />
        {/* Validation badge */}
        {validationResult && !executionState && (
          <ValidationBadge validationResult={validationResult} />
        )}
```

**After:**
```tsx
        <StatusIcon />
        {/* Config completeness badge — missing required fields */}
        {!executionState && missingRequired.length > 0 && (
          <div className="group/req relative flex-shrink-0">
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
              {missingRequired.length} missing
            </span>
            <div className="hidden group-hover/req:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
              <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                Missing: {missingRequired.join(', ')}
              </div>
            </div>
          </div>
        )}
        {/* Validation badge (prerequisites) */}
        {validationResult && !executionState && (
          <ValidationBadge validationResult={validationResult} />
        )}
```

> Use `formatLabel` for friendlier names in the tooltip if desired, but raw field keys are acceptable and avoid importing the modal's helper.

### Step 4 — Flow-level indicator + "Fix N issues" in Header

The Header dot reflects prerequisite severity. Overlay config-completeness so the dot goes red and the tooltip reports the count.

**Add selector** (`Header.tsx` imports, `:20-22`):

```tsx
import { countNodesWithMissingFields } from '../../services/config-validation';
// …inside Header component, near the other flow selectors (~:347):
const missingFieldCount = countNodesWithMissingFields(flow);
```

**Augment the validation indicator block** (`Header.tsx:590-611`):

**Before:**
```tsx
{flow.nodes.length > 0 && (
  <div className="relative group">
    <div className={cn('w-2.5 h-2.5 rounded-full',
      validationSeverity === 'valid' && 'bg-green-500',
      validationSeverity === 'warning' && 'bg-yellow-500',
      validationSeverity === 'error' && 'bg-red-500')} />
    <div className="hidden group-hover:block absolute top-full right-0 mt-2 z-50">
      <div className="bg-gray-900 ... ">
        {validationSeverity === 'valid' && 'All prerequisites met'}
        {validationSeverity === 'warning' && 'Some warnings in flow'}
        {validationSeverity === 'error' && 'Missing prerequisites'}
        {totalCreditCost > 0 && (<span ...> · ~{totalCreditCost.toLocaleString()} credits</span>)}
      </div>
    </div>
  </div>
)}
```

**After:** (dot is red if either prerequisites error OR config is incomplete)
```tsx
{flow.nodes.length > 0 && (
  <div className="relative group">
    <div
      className={cn(
        'w-2.5 h-2.5 rounded-full',
        missingFieldCount > 0
          ? 'bg-red-500'
          : validationSeverity === 'valid'
            ? 'bg-green-500'
            : validationSeverity === 'warning'
              ? 'bg-yellow-500'
              : 'bg-red-500'
      )}
    />
    <div className="hidden group-hover:block absolute top-full right-0 mt-2 z-50">
      <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
        {missingFieldCount > 0 && (
          <div className="text-red-300">
            Fix {missingFieldCount} block{missingFieldCount !== 1 ? 's' : ''} with missing fields
          </div>
        )}
        {missingFieldCount === 0 && validationSeverity === 'valid' && 'All prerequisites met'}
        {missingFieldCount === 0 && validationSeverity === 'warning' && 'Some warnings in flow'}
        {missingFieldCount === 0 && validationSeverity === 'error' && 'Missing prerequisites'}
        {totalCreditCost > 0 && (
          <span className="text-gray-300"> &middot; ~{totalCreditCost.toLocaleString()} credits</span>
        )}
      </div>
    </div>
  </div>
)}
```

### Step 5 — Surface at Execute time

In the execute path, block/warn when there are missing fields. Two options:

- **Minimal (recommended):** in `App.handleExecuteFlow` (`App.tsx:198-204`) or the new `handleHeaderExecute` (P1-3), pre-check and toast instead of running:

```tsx
import { countNodesWithMissingFields } from './services/config-validation';
// inside the execute handler, before executeFlow / before opening confirm:
const missing = countNodesWithMissingFields(flow);
if (missing > 0) {
  addToast({
    type: 'warning',
    title: 'Cannot run yet',
    description: `Fix ${missing} block${missing !== 1 ? 's' : ''} with missing required fields.`,
  });
  return;
}
```
`addToast` is already in scope in `App.tsx` (`:125`).

- **Alternative:** pass `missingFieldCount` into `ExecuteConfirmModal` and disable its Confirm button with the same message.

## 6. Tests

### Unit test — `apps/studio/src/services/__tests__/config-validation.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@accumulate-studio/types', async (orig) => {
  const actual = await orig<any>();
  return {
    ...actual,
    BLOCK_CATALOG: {
      CreateIdentity: { configSchema: {
        properties: { url: { description: 'ADI URL' }, pub: { description: 'auto-resolved key' } },
        required: ['url', 'pub'],
      } },
    },
  };
});

import { getMissingRequiredFields, countNodesWithMissingFields } from '../config-validation';

describe('config-validation', () => {
  it('flags empty required, ignores auto-resolved', () => {
    expect(getMissingRequiredFields('CreateIdentity' as any, {})).toEqual(['url']);
  });
  it('passes when required filled', () => {
    expect(getMissingRequiredFields('CreateIdentity' as any, { url: 'acc://x.acme' })).toEqual([]);
  });
  it('treats whitespace-only as empty', () => {
    expect(getMissingRequiredFields('CreateIdentity' as any, { url: '   ' })).toEqual(['url']);
  });
  it('counts nodes with missing fields', () => {
    const flow: any = { nodes: [
      { type: 'CreateIdentity', config: {} },
      { type: 'CreateIdentity', config: { url: 'acc://ok.acme' } },
    ] };
    expect(countNodesWithMissingFields(flow)).toBe(1);
  });
});
```

### Component test — extend `BlockConfigModal.test.tsx`

The existing mock already defines `CreateIdentity` with `required: ['url']` (`BlockConfigModal.test.tsx:57-67`). Add:

```tsx
it('does not save when a required field is empty', () => {
  mockNodeConfig = {}; // url missing
  render(<BlockConfigModal isOpen onClose={mockOnClose} />);
  fireEvent.click(screen.getByText('Save Configuration'));
  expect(mockUpdateNodeConfig).not.toHaveBeenCalled();
  expect(mockOnClose).not.toHaveBeenCalled();
  expect(screen.getByText(/required field/i)).toBeDefined(); // footer summary
});

it('saves when required field is filled', () => {
  mockNodeConfig = { url: 'acc://test.acme' };
  render(<BlockConfigModal isOpen onClose={mockOnClose} />);
  fireEvent.click(screen.getByText('Save Configuration'));
  expect(mockUpdateNodeConfig).toHaveBeenCalledWith('node-1', expect.objectContaining({ url: 'acc://test.acme' }));
  expect(mockOnClose).toHaveBeenCalledTimes(1);
});
```

> Note: the existing test "calls updateNodeConfig … on Save" (`BlockConfigModal.test.tsx:156-168`) uses `mockNodeConfig = { url: 'acc://test' }` which is non-empty, so it still passes the new gate. ✅

### Manual QA checklist

- [ ] Open `CreateIdentity`, clear `url`, click Save → red border + "This field is required." + footer count; modal stays open; node not updated.
- [ ] Type into `url` → its inline error clears immediately.
- [ ] Save with `url` filled → modal closes, node updates.
- [ ] Node card shows "N missing" badge with hover tooltip listing field names; badge disappears once configured.
- [ ] Header dot is red while any node has missing fields; tooltip reads "Fix N blocks with missing fields".
- [ ] Auto-resolved blank field (description contains "auto-resolved") does NOT count as missing.
- [ ] Press Execute with a missing field → toast "Fix N blocks…", no run starts.
- [ ] Prerequisite badges still render alongside config badges.

## 7. Risks, rollback, out of scope

- **Risk — false positives:** the auto-resolved heuristic is description-string-based. Audit the catalog (`blocks.ts`) for required fields whose descriptions don't say "auto-resolved" but are runtime-filled; either update the description or extend `isAutoResolved`. Run the full template suite (`flow-templates.test.ts`) — the 8 golden paths must report 0 missing fields after their config modals are completed as designed.
- **Risk — perf:** `countNodesWithMissingFields` runs on every Header render. It's O(nodes × required) and cheap; if flows grow large, memoize via a store selector with the debounced validation subscription (`flow-store.ts:677-686`).
- **Rollback:** the validation module is additive; revert `handleSave`, the field `error` props, the BlockNode badge, the Header dot override, and the execute pre-check independently.
- **Out of scope:** type/format validation (valid `acc://` URL syntax, number ranges), cross-field validation, validating array-item sub-fields, and validating prerequisite-derived fields (owned by `analyzeFlow`).
