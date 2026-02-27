import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Download,
  Upload,
  Save,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Check,
  Pencil,
  Undo,
  Redo,
  Menu,
  FilePlus,
  Trash2,
} from 'lucide-react';
import { cn, Button } from '../ui';
import { useFlowStore, useUIStore } from '../../store';
import { selectCanUndo, selectCanRedo, selectFlowValidationSeverity, selectTotalCreditCost } from '../../store/flow-store';
import { NETWORKS, validateFlow, type NetworkId, type Flow } from '@accumulate-studio/types';
import { NetworkStatusIndicator } from './NetworkStatusIndicator';

// =============================================================================
// Logo Component
// =============================================================================

const AccumulateLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M16 2L4 9v14l12 7 12-7V9L16 2z"
      className="fill-accumulate-600"
    />
    <path
      d="M16 6l-8 4.5v9L16 24l8-4.5v-9L16 6z"
      className="fill-accumulate-400"
    />
    <path
      d="M16 10l-4 2.25v4.5L16 19l4-2.25v-4.5L16 10z"
      className="fill-white dark:fill-gray-900"
    />
  </svg>
);

// =============================================================================
// Network Selector Dropdown
// =============================================================================

interface NetworkSelectorProps {
  value: NetworkId;
  onChange: (network: NetworkId) => void;
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedNetwork = NETWORKS[value];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Only show active networks (testnet/devnet are defunct)
  const activeNetworkIds: NetworkId[] = ['mainnet', 'kermit', 'local'];
  const networkOptions = activeNetworkIds.map((id) => NETWORKS[id]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
          'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
          'hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors',
          'text-gray-900 dark:text-gray-100'
        )}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            value === 'mainnet' && 'bg-green-500',
            value === 'kermit' && 'bg-purple-500',
            value === 'local' && 'bg-gray-500'
          )}
        />
        {selectedNetwork.name}
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full right-0 mt-1 w-56 py-1',
            'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
            'border border-gray-200 dark:border-gray-700',
            'z-50'
          )}
        >
          {networkOptions.map((network) => (
            <button
              key={network.id}
              onClick={() => {
                onChange(network.id);
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2 text-left',
                'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                value === network.id && 'bg-gray-50 dark:bg-gray-700/50'
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  network.id === 'mainnet' && 'bg-green-500',
                  network.id === 'kermit' && 'bg-purple-500',
                  network.id === 'local' && 'bg-gray-500'
                )}
              />
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Theme Toggle
// =============================================================================

interface ThemeToggleProps {
  theme: 'light' | 'dark' | 'system';
  onChange: (theme: 'light' | 'dark' | 'system') => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themes = [
    { id: 'light' as const, label: 'Light', icon: Sun },
    { id: 'dark' as const, label: 'Dark', icon: Moon },
    { id: 'system' as const, label: 'System', icon: Monitor },
  ];

  const currentTheme = themes.find((t) => t.id === theme) || themes[2];
  const ThemeIcon = currentTheme.icon;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'p-2 rounded-lg',
          'text-gray-600 dark:text-gray-400',
          'hover:bg-gray-100 dark:hover:bg-gray-800',
          'transition-colors'
        )}
        title="Theme"
      >
        <ThemeIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full right-0 mt-1 w-36 py-1',
            'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
            'border border-gray-200 dark:border-gray-700',
            'z-50'
          )}
        >
          {themes.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => {
                  onChange(t.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2 text-left',
                  'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                  theme === t.id && 'bg-gray-50 dark:bg-gray-700/50'
                )}
              >
                <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm text-gray-900 dark:text-gray-100">{t.label}</span>
                {theme === t.id && <Check className="w-4 h-4 text-accumulate-500 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Editable Flow Name
// =============================================================================

interface EditableFlowNameProps {
  name: string;
  onNameChange: (name: string) => void;
}

const EditableFlowName: React.FC<EditableFlowNameProps> = ({ name, onNameChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      onNameChange(trimmed);
    } else {
      setEditValue(name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setEditValue(name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={handleKeyDown}
        className={cn(
          'px-2 py-1 text-lg font-semibold rounded',
          'bg-white dark:bg-gray-800 border border-accumulate-500',
          'text-gray-900 dark:text-gray-100',
          'focus:outline-none focus:ring-2 focus:ring-accumulate-500',
          'min-w-[200px]'
        )}
      />
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className={cn(
        'group flex items-center gap-2 px-2 py-1 rounded',
        'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
      )}
    >
      <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{name}</span>
      <Pencil className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};

// =============================================================================
// Main Header Component
// =============================================================================

interface HeaderProps {
  onExecute?: () => void;
  onExport?: () => void;
  onTogglePalette?: () => void;
  isExecuting?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onExecute,
  onExport,
  onTogglePalette,
  isExecuting = false,
}) => {
  // Store state
  const flow = useFlowStore((state) => state.flow);
  const setFlowName = useFlowStore((state) => state.setFlowName);
  const loadFlow = useFlowStore((state) => state.loadFlow);
  const newFlow = useFlowStore((state) => state.newFlow);
  const clearCanvas = useFlowStore((state) => state.clearCanvas);
  const undo = useFlowStore((state) => state.undo);
  const redo = useFlowStore((state) => state.redo);
  const canUndo = useFlowStore(selectCanUndo);
  const canRedo = useFlowStore(selectCanRedo);
  const validationSeverity = useFlowStore(selectFlowValidationSeverity);
  const totalCreditCost = useFlowStore(selectTotalCreditCost);

  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const selectedNetwork = useUIStore((state) => state.selectedNetwork);
  const setSelectedNetwork = useUIStore((state) => state.setSelectedNetwork);
  const openModal = useUIStore((state) => state.openModal);

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFlow = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        // Support both raw Flow objects and export bundles
        const flowData: Flow = parsed.flow ?? parsed;

        // Basic validation
        if (!flowData.version || !flowData.nodes || !Array.isArray(flowData.nodes)) {
          alert('Invalid flow file: missing required fields (version, nodes).');
          return;
        }

        const validation = validateFlow(flowData);
        if (!validation.valid) {
          const proceed = window.confirm(
            `Flow has validation issues:\n${validation.errors.join('\n')}\n\nLoad anyway?`
          );
          if (!proceed) return;
        }

        if (flow.nodes.length > 0) {
          const proceed = window.confirm('Replace current flow with imported flow?');
          if (!proceed) return;
        }

        loadFlow(flowData);
      } catch {
        alert('Failed to parse flow file. Please ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be re-imported
    e.target.value = '';
  }, [flow.nodes.length, loadFlow]);

  const handleExecute = () => {
    if (onExecute) {
      onExecute();
    } else {
      // Default: open execution confirmation
      openModal('execute-confirm');
    }
  };

  const handleSaveFlow = useCallback(() => {
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
  }, [flow]);

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      // Default: open export modal
      openModal('export');
    }
  };

  return (
    <header className="flex-shrink-0 h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      {/* Left section: Logo and flow name */}
      <div className="flex items-center gap-4">
        {/* Mobile menu toggle */}
        <button
          onClick={onTogglePalette}
          className={cn(
            'lg:hidden p-2 rounded-lg',
            'text-gray-600 dark:text-gray-400',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'transition-colors'
          )}
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <AccumulateLogo className="w-8 h-8" />
          <span className="hidden sm:inline text-lg font-bold text-gray-900 dark:text-gray-100">
            Accumulate Studio
          </span>
        </div>

        {/* Divider */}
        <div className="hidden md:block w-px h-6 bg-gray-200 dark:bg-gray-700" />

        {/* Flow name */}
        <div className="hidden md:block">
          <EditableFlowName name={flow.name} onNameChange={setFlowName} />
        </div>
      </div>

      {/* Center section: New Flow, Undo/Redo */}
      <div className="flex-1 flex justify-center">
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => {
              if (flow.nodes.length === 0 || window.confirm('Clear current flow and start new? This cannot be undone.')) {
                newFlow();
              }
            }}
            className={cn(
              'p-2 rounded-lg transition-colors',
              'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
            title="New Flow"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (flow.nodes.length > 0 && window.confirm('Remove all blocks from the canvas?')) {
                clearCanvas();
              }
            }}
            disabled={flow.nodes.length === 0}
            className={cn(
              'p-2 rounded-lg transition-colors',
              flow.nodes.length > 0
                ? 'text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            )}
            title="Clear Canvas"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          <button
            onClick={undo}
            disabled={!canUndo}
            className={cn(
              'p-2 rounded-lg transition-colors',
              canUndo
                ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            )}
            title="Undo (Ctrl+Z)"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={cn(
              'p-2 rounded-lg transition-colors',
              canRedo
                ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            )}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right section: Network, theme, actions */}
      <div className="flex items-center gap-2">
        {/* Network selector + status */}
        <div className="hidden md:flex items-center gap-1">
          <NetworkSelector value={selectedNetwork} onChange={setSelectedNetwork} />
          <NetworkStatusIndicator />
        </div>

        {/* Theme toggle */}
        <ThemeToggle theme={theme} onChange={setTheme} />

        {/* Divider */}
        <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-700" />

        {/* Save flow (JSON download) */}
        <button
          onClick={handleSaveFlow}
          disabled={flow.nodes.length === 0}
          className={cn(
            'hidden sm:flex p-2 rounded-lg transition-colors',
            flow.nodes.length > 0
              ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
          )}
          title="Save Flow (JSON)"
        >
          <Save className="w-4 h-4" />
        </button>

        {/* Import flow */}
        <button
          onClick={handleImportFlow}
          className={cn(
            'hidden sm:flex p-2 rounded-lg transition-colors',
            'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          )}
          title="Import Flow (JSON)"
        >
          <Upload className="w-4 h-4" />
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelected}
          className="hidden"
          aria-label="Import flow file"
        />

        {/* Export button */}
        <Button variant="secondary" size="sm" onClick={handleExport} className="hidden sm:flex">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>

        {/* Validation indicator */}
        {flow.nodes.length > 0 && (
          <div className="relative group">
            <div
              className={cn(
                'w-2.5 h-2.5 rounded-full',
                validationSeverity === 'valid' && 'bg-green-500',
                validationSeverity === 'warning' && 'bg-yellow-500',
                validationSeverity === 'error' && 'bg-red-500'
              )}
            />
            <div className="hidden group-hover:block absolute top-full right-0 mt-2 z-50">
              <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                {validationSeverity === 'valid' && 'All prerequisites met'}
                {validationSeverity === 'warning' && 'Some warnings in flow'}
                {validationSeverity === 'error' && 'Missing prerequisites'}
                {totalCreditCost > 0 && (
                  <span className="text-gray-300"> &middot; ~{totalCreditCost.toLocaleString()} credits</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Execute button */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleExecute}
          disabled={isExecuting || flow.nodes.length === 0}
          className={cn(
            'relative',
            isExecuting && 'animate-pulse'
          )}
        >
          <Play className="w-4 h-4 mr-2" />
          {isExecuting ? 'Executing...' : 'Execute'}
        </Button>
      </div>
    </header>
  );
};

export default Header;
