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
  HelpCircle,
  Share2,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn, Button, ConfirmDialog, useToast } from '../ui';
import { useFlowStore, useUIStore } from '../../store';
import { selectCanUndo, selectCanRedo, selectFlowValidationSeverity, selectTotalCreditCost } from '../../store/flow-store';
import { NETWORKS, validateFlow, type NetworkId, type Flow } from '@accumulate-studio/types';
import { NetworkStatusIndicator } from './NetworkStatusIndicator';
import { downloadFlowAsJson } from '../../utils/save-flow';
import { countNodesWithMissingFields } from '../../services/config-validation';
import { buildShareUrl } from '../../lib/share-link';

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

export const NetworkSelector: React.FC<NetworkSelectorProps> = ({ value, onChange }) => {
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

// =============================================================================
// Theme Toggle
// =============================================================================

interface ThemeToggleProps {
  theme: 'light' | 'dark' | 'system';
  onChange: (theme: 'light' | 'dark' | 'system') => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onChange }) => {
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

// =============================================================================
// Help Menu
// =============================================================================

interface HelpMenuProps {
  onReplayTour: () => void;
  onShowWelcome: () => void;
}

const HelpMenu: React.FC<HelpMenuProps> = ({ onReplayTour, onShowWelcome }) => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <button
        aria-label="Help"
        title="Help"
        className={cn(
          'p-2 rounded-lg text-gray-600 dark:text-gray-400',
          'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accumulate-500'
        )}
      >
        <HelpCircle className="w-5 h-5" />
      </button>
    </DropdownMenu.Trigger>

    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={4}
        className={cn(
          'w-48 py-1 z-50',
          'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
          'border border-gray-200 dark:border-gray-700',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
        )}
      >
        <DropdownMenu.Item
          onSelect={onReplayTour}
          className={cn(
            'w-full px-4 py-2 text-left text-sm outline-none cursor-pointer',
            'text-gray-900 dark:text-gray-100',
            'data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700'
          )}
        >
          Replay product tour
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={onShowWelcome}
          className={cn(
            'w-full px-4 py-2 text-left text-sm outline-none cursor-pointer',
            'text-gray-900 dark:text-gray-100',
            'data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700'
          )}
        >
          Show welcome screen
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

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
  // Config-completeness: count of nodes with empty required fields.
  const missingFieldCount = countNodesWithMissingFields(flow);

  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const selectedNetwork = useUIStore((state) => state.selectedNetwork);
  const setSelectedNetwork = useUIStore((state) => state.setSelectedNetwork);
  const openModal = useUIStore((state) => state.openModal);
  const startTour = useUIStore((state) => state.startTour);
  const { addToast } = useToast();

  // Single reusable confirm dialog driven by a pending-action descriptor.
  const [confirm, setConfirm] = useState<{
    title: string;
    description?: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const closeConfirm = useCallback(() => setConfirm(null), []);

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFlow = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  // Final commit step shared by the confirm chain below.
  const commitImport = useCallback((flowData: Flow) => {
    loadFlow(flowData);
    addToast({ type: 'success', title: 'Flow imported', description: flowData.name });
  }, [loadFlow, addToast]);

  // Step 2: optionally confirm replacing the current flow, then commit.
  const importWithReplaceCheck = useCallback((flowData: Flow) => {
    if (flow.nodes.length > 0) {
      setConfirm({
        title: 'Replace current flow?',
        description: 'Importing will discard the flow currently on the canvas.',
        confirmLabel: 'Replace',
        destructive: true,
        onConfirm: () => { closeConfirm(); commitImport(flowData); },
      });
    } else {
      commitImport(flowData);
    }
  }, [flow.nodes.length, commitImport, closeConfirm]);

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
          addToast({
            type: 'error',
            title: 'Invalid flow file',
            description: 'Missing required fields (version, nodes).',
          });
          return;
        }

        const validation = validateFlow(flowData);
        if (!validation.valid) {
          // Step 1: surface validation issues, ask to proceed.
          setConfirm({
            title: 'Flow has validation issues',
            description: `${validation.errors.join('\n')}\n\nLoad anyway?`,
            confirmLabel: 'Load anyway',
            destructive: true,
            onConfirm: () => { closeConfirm(); importWithReplaceCheck(flowData); },
          });
          return;
        }

        importWithReplaceCheck(flowData);
      } catch {
        addToast({
          type: 'error',
          title: 'Could not parse flow file',
          description: 'Please ensure the file is valid JSON.',
        });
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be re-imported
    e.target.value = '';
  }, [addToast, importWithReplaceCheck, closeConfirm]);

  const handleExecute = () => {
    if (isExecuting) return; // never trigger anything while a run is in flight
    if (onExecute) {
      onExecute();
    } else {
      // Default: open execution confirmation
      openModal('execute-confirm');
    }
  };

  const handleSaveFlow = useCallback(() => {
    const filename = downloadFlowAsJson(flow);
    addToast({ type: 'success', title: 'Flow saved', description: filename });
  }, [flow, addToast]);

  const handleShare = useCallback(async () => {
    const res = buildShareUrl(flow);
    if (!res.ok || !res.url) {
      addToast({
        type: 'error',
        title: 'Cannot create link',
        description:
          res.error === 'too-large'
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
        description:
          'Anyone with this link can open this flow. It contains the flow (incl. any account URLs) but never private keys.',
        duration: 7000,
      });
    } catch {
      // Clipboard blocked (insecure context / permissions) — fall back to prompt.
      window.prompt('Copy this share link:', res.url);
    }
  }, [flow, addToast]);

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
              if (flow.nodes.length === 0) {
                newFlow();
              } else {
                setConfirm({
                  title: 'Start a new flow?',
                  description: 'This clears the current flow and cannot be undone.',
                  confirmLabel: 'New Flow',
                  destructive: true,
                  onConfirm: () => { closeConfirm(); newFlow(); },
                });
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
              if (flow.nodes.length > 0) {
                setConfirm({
                  title: 'Clear the canvas?',
                  description: 'This removes all blocks from the canvas.',
                  confirmLabel: 'Clear',
                  destructive: true,
                  onConfirm: () => { closeConfirm(); clearCanvas(); },
                });
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
          <span data-tour="network-selector">
            <NetworkSelector value={selectedNetwork} onChange={setSelectedNetwork} />
          </span>
          <NetworkStatusIndicator />
        </div>

        {/* Help */}
        <HelpMenu
          onReplayTour={() => startTour()}
          onShowWelcome={() => openModal('welcome')}
        />

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
          title="Save Flow (JSON) — Ctrl+S"
        >
          <Save className="w-4 h-4" />
        </button>

        {/* Share flow (copy permalink) */}
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

        {/* Validation indicator — red if prerequisites error OR config incomplete */}
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

        {/* Execute button */}
        <Button
          data-tour="execute"
          variant="primary"
          size="sm"
          onClick={handleExecute}
          disabled={isExecuting || flow.nodes.length === 0}
          title="Execute (Ctrl+Enter)"
          className={cn(
            'relative',
            isExecuting && 'animate-pulse'
          )}
        >
          <Play className="w-4 h-4 mr-2" />
          {isExecuting ? 'Executing...' : 'Execute'}
        </Button>
      </div>

      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          destructive={confirm.destructive}
          onConfirm={confirm.onConfirm}
          onCancel={closeConfirm}
        />
      )}
    </header>
  );
};

export default Header;
