import React, { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save, Info } from 'lucide-react';
import { cn, Button } from '../ui';
import { useFlowStore, useUIStore } from '../../store';
import { BLOCK_CATALOG, type BlockType, type BlockConfig } from '@accumulate-studio/types';

// =============================================================================
// Types
// =============================================================================

interface BlockConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ModalData {
  nodeId: string;
  blockType: BlockType;
}

interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: {
    type: string;
    properties?: Record<string, SchemaProperty>;
  };
  default?: unknown;
  visibleFor?: string[];
}

// =============================================================================
// Field Components
// =============================================================================

interface FieldProps {
  name: string;
  property: SchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  required: boolean;
}

const TextField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => (
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
        'border-gray-300 dark:border-gray-600',
        'text-gray-900 dark:text-gray-100',
        'placeholder-gray-400 dark:placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
      )}
    />
    {property.description && (
      <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
    )}
  </div>
);

const NumberField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {formatLabel(name)}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      type="number"
      value={(value as number) ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      placeholder={property.description}
      className={cn(
        'w-full px-3 py-2 rounded-md border transition-colors',
        'bg-white dark:bg-gray-800',
        'border-gray-300 dark:border-gray-600',
        'text-gray-900 dark:text-gray-100',
        'placeholder-gray-400 dark:placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
      )}
    />
    {property.description && (
      <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
    )}
  </div>
);

const UrlField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {formatLabel(name)}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      type="url"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={property.description ?? 'acc://...'}
      className={cn(
        'w-full px-3 py-2 rounded-md border transition-colors font-mono text-sm',
        'bg-white dark:bg-gray-800',
        'border-gray-300 dark:border-gray-600',
        'text-gray-900 dark:text-gray-100',
        'placeholder-gray-400 dark:placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
      )}
    />
    {property.description && (
      <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
    )}
  </div>
);

const TextareaField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {formatLabel(name)}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <textarea
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={property.description}
      rows={4}
      className={cn(
        'w-full px-3 py-2 rounded-md border transition-colors resize-none',
        'bg-white dark:bg-gray-800',
        'border-gray-300 dark:border-gray-600',
        'text-gray-900 dark:text-gray-100',
        'placeholder-gray-400 dark:placeholder-gray-500',
        'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
      )}
    />
    {property.description && (
      <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
    )}
  </div>
);

const SelectField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
      {formatLabel(name)}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <select
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full px-3 py-2 rounded-md border transition-colors',
        'bg-white dark:bg-gray-800',
        'border-gray-300 dark:border-gray-600',
        'text-gray-900 dark:text-gray-100',
        'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
      )}
    >
      <option value="">Select...</option>
      {property.enum?.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    {property.description && (
      <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
    )}
  </div>
);

const ArrayField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => {
  const arrayValue = Array.isArray(value) ? value : [];

  const addItem = () => {
    onChange([...arrayValue, '']);
  };

  const removeItem = (index: number) => {
    const newValue = [...arrayValue];
    newValue.splice(index, 1);
    onChange(newValue);
  };

  const updateItem = (index: number, itemValue: string) => {
    const newValue = [...arrayValue];
    newValue[index] = itemValue;
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {formatLabel(name)}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {arrayValue.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={item as string}
            onChange={(e) => updateItem(index, e.target.value)}
            className={cn(
              'flex-1 px-3 py-2 rounded-md border transition-colors',
              'bg-white dark:bg-gray-800',
              'border-gray-300 dark:border-gray-600',
              'text-gray-900 dark:text-gray-100',
              'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
            )}
          />
          <button
            type="button"
            onClick={() => removeItem(index)}
            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-sm text-accumulate-600 dark:text-accumulate-400 hover:underline"
      >
        + Add item
      </button>
      {property.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
      )}
    </div>
  );
};

const ObjectArrayField: React.FC<FieldProps> = ({ name, property, value, onChange, required }) => {
  const arrayValue = Array.isArray(value) ? value as Record<string, unknown>[] : [];
  const itemProps = property.items?.properties ?? {};
  const fieldNames = Object.keys(itemProps);

  const addItem = () => {
    const blank: Record<string, unknown> = {};
    for (const key of fieldNames) {
      blank[key] = itemProps[key].default ?? '';
    }
    onChange([...arrayValue, blank]);
  };

  const removeItem = (index: number) => {
    const next = [...arrayValue];
    next.splice(index, 1);
    onChange(next);
  };

  const updateItem = (index: number, field: string, fieldValue: unknown) => {
    const next = [...arrayValue];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {formatLabel(name)}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {arrayValue.map((item, index) => (
        <div
          key={index}
          className={cn(
            'flex flex-wrap items-center gap-2 p-2 rounded-md border',
            'bg-gray-50 dark:bg-gray-800/50',
            'border-gray-200 dark:border-gray-700'
          )}
        >
          {fieldNames.map((field) => {
            const subProp = itemProps[field];
            // Hide fields that aren't relevant for the selected operation type
            if (subProp.visibleFor && subProp.visibleFor.length > 0) {
              const selectedType = (item.type as string) ?? '';
              if (!selectedType || !subProp.visibleFor.includes(selectedType)) {
                return null;
              }
            }
            if (subProp.enum) {
              return (
                <select
                  key={field}
                  value={(item[field] as string) ?? ''}
                  onChange={(e) => updateItem(index, field, e.target.value)}
                  className={cn(
                    'px-2 py-1.5 rounded-md border text-sm',
                    'bg-white dark:bg-gray-800',
                    'border-gray-300 dark:border-gray-600',
                    'text-gray-900 dark:text-gray-100',
                    'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
                  )}
                >
                  <option value="">{formatLabel(field)}...</option>
                  {subProp.enum.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              );
            }
            if (subProp.type === 'number') {
              return (
                <input
                  key={field}
                  type="number"
                  value={(item[field] as number) ?? ''}
                  onChange={(e) => updateItem(index, field, e.target.value ? Number(e.target.value) : '')}
                  placeholder={subProp.description ?? formatLabel(field)}
                  className={cn(
                    'w-24 px-2 py-1.5 rounded-md border text-sm',
                    'bg-white dark:bg-gray-800',
                    'border-gray-300 dark:border-gray-600',
                    'text-gray-900 dark:text-gray-100',
                    'placeholder-gray-400 dark:placeholder-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
                  )}
                />
              );
            }
            return (
              <input
                key={field}
                type="text"
                value={(item[field] as string) ?? ''}
                onChange={(e) => updateItem(index, field, e.target.value)}
                placeholder={subProp.description ?? formatLabel(field)}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-md border text-sm',
                  'bg-white dark:bg-gray-800',
                  'border-gray-300 dark:border-gray-600',
                  'text-gray-900 dark:text-gray-100',
                  'placeholder-gray-400 dark:placeholder-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-accumulate-500 focus:border-transparent'
                )}
              />
            );
          })}
          <button
            type="button"
            onClick={() => removeItem(index)}
            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-sm text-accumulate-600 dark:text-accumulate-400 hover:underline"
      >
        + Add item
      </button>
      {property.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{property.description}</p>
      )}
    </div>
  );
};

const BooleanField: React.FC<FieldProps> = ({ name, property, value, onChange }) => (
  <div className="flex items-center gap-3">
    <input
      type="checkbox"
      id={name}
      checked={(value as boolean) ?? false}
      onChange={(e) => onChange(e.target.checked)}
      className={cn(
        'w-4 h-4 rounded border transition-colors cursor-pointer',
        'border-gray-300 dark:border-gray-600',
        'text-accumulate-600 focus:ring-accumulate-500'
      )}
    />
    <label htmlFor={name} className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
      {formatLabel(name)}
    </label>
    {property.description && (
      <span className="text-xs text-gray-500 dark:text-gray-400">- {property.description}</span>
    )}
  </div>
);

// =============================================================================
// Helpers
// =============================================================================

function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function hasAutoResolvedFields(properties: Record<string, SchemaProperty>): boolean {
  return Object.values(properties).some(
    (p) => p.description?.includes('auto-resolved') || p.description?.includes('auto-fetched')
  );
}

function getFieldComponent(property: SchemaProperty): React.FC<FieldProps> {
  // Check for enum first (select)
  if (property.enum) {
    return SelectField;
  }

  // Check for array of objects (e.g. operations: [{type, authority}])
  if (property.type === 'array' && property.items?.type === 'object' && property.items.properties) {
    return ObjectArrayField;
  }

  // Check for array of strings
  if (property.type === 'array') {
    return ArrayField;
  }

  // Check for boolean
  if (property.type === 'boolean') {
    return BooleanField;
  }

  // Check for number
  if (property.type === 'number' || property.type === 'integer') {
    return NumberField;
  }

  // Check for URL pattern in description or name
  if (property.description?.toLowerCase().includes('url')) {
    return UrlField;
  }

  // Check for long text (textarea)
  if (property.description?.toLowerCase().includes('entries') || property.description?.toLowerCase().includes('text')) {
    return TextareaField;
  }

  // Default to text input
  return TextField;
}

// =============================================================================
// Main Component
// =============================================================================

export const BlockConfigModal: React.FC<BlockConfigModalProps> = ({ isOpen, onClose }) => {
  const modalData = useUIStore((state) => state.modalData) as ModalData | null;
  const updateNodeConfig = useFlowStore((state) => state.updateNodeConfig);
  const nodes = useFlowStore((state) => state.flow.nodes);

  const [config, setConfig] = useState<Record<string, unknown>>({});

  // Get node and block definition
  const node = modalData ? nodes.find((n) => n.id === modalData.nodeId) : null;
  const blockDef = modalData ? BLOCK_CATALOG[modalData.blockType] : null;

  // Initialize config when modal opens
  useEffect(() => {
    if (node && isOpen) {
      setConfig((node.config as Record<string, unknown>) ?? {});
    }
  }, [node, isOpen]);

  // Handle field change
  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  }, []);

  // Handle save
  const handleSave = () => {
    if (modalData?.nodeId) {
      updateNodeConfig(modalData.nodeId, config as BlockConfig);
    }
    onClose();
  };

  if (!blockDef || !modalData) {
    return null;
  }

  const schema = blockDef.configSchema as {
    properties?: Record<string, SchemaProperty>;
    required?: string[];
  };
  const properties = schema.properties ?? {};
  const requiredFields = schema.required ?? [];

  return (
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
            'w-full max-w-lg max-h-[85vh] overflow-hidden',
            'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
            'border border-gray-200 dark:border-gray-700',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            'duration-200'
          )}
        >
          {/* Header */}
          <div
            className="px-6 py-4 border-b border-gray-200 dark:border-gray-700"
            style={{ backgroundColor: `${blockDef.color}10` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${blockDef.color}20` }}
                >
                  <div
                    className="w-5 h-5 rounded"
                    style={{ backgroundColor: blockDef.color }}
                  />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {blockDef.name}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400">
                    {blockDef.description}
                  </Dialog.Description>
                </div>
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
          </div>

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-180px)]">
            <div className="space-y-4">
              {/* Auto-resolution hint for blocks with optional fields */}
              {hasAutoResolvedFields(properties) && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Fields left empty will be auto-resolved from upstream blocks at execution time. You only need to fill in values you want to override.
                  </p>
                </div>
              )}
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
                  />
                );
              })}
              {Object.keys(properties).length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-8">
                  This block has no configurable parameters.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
