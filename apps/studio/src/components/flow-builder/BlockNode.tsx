import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  UserPlus,
  Book,
  FileKey,
  Wallet,
  Wallet2,
  Database,
  Coins,
  Send,
  BadgePlus,
  Flame,
  CreditCard,
  ArrowRightLeft,
  FileText,
  FileOutput,
  KeyRound,
  Key,
  Lock,
  Shield,
  Droplets,
  Search,
  Clock,
  MessageSquare,
  type LucideIcon,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../ui';
import { BLOCK_CATALOG, type BlockType } from '@accumulate-studio/types';
import { useFlowStore, selectNodeExecutionState, selectNodeValidation } from '../../store';

// Icon mapping
const BLOCK_ICONS: Record<string, LucideIcon> = {
  'user-plus': UserPlus,
  book: Book,
  'file-key': FileKey,
  wallet: Wallet,
  'wallet-minimal': Wallet2,
  database: Database,
  coins: Coins,
  send: Send,
  'badge-plus': BadgePlus,
  flame: Flame,
  'credit-card': CreditCard,
  'arrow-right-left': ArrowRightLeft,
  'file-text': FileText,
  'file-output': FileOutput,
  'key-round': KeyRound,
  key: Key,
  lock: Lock,
  shield: Shield,
  droplets: Droplets,
  search: Search,
  clock: Clock,
  'message-square': MessageSquare,
};

interface BlockNodeData {
  type: BlockType;
  label?: string;
  config?: Record<string, unknown>;
}

export const BlockNode: React.FC<NodeProps> = memo(({ id, data, selected }) => {
  const nodeData = data as BlockNodeData;
  const blockDef = BLOCK_CATALOG[nodeData.type];
  const executionState = useFlowStore(selectNodeExecutionState(id));
  const validationResult = useFlowStore(selectNodeValidation(id));
  const removeNode = useFlowStore((state) => state.removeNode);

  // Handle delete button click
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node selection/double-click
    e.preventDefault();
    removeNode(id);
  };

  if (!blockDef) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-lg border-2 border-red-500">
        Unknown block: {nodeData.type}
      </div>
    );
  }

  const Icon = BLOCK_ICONS[blockDef.icon] || Coins;

  // Execution status indicator
  const StatusIcon = () => {
    if (!executionState) return null;

    switch (executionState.status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Play className="w-4 h-4 text-gray-400" />;
      default:
        return null;
    }
  };

  const statusClass = executionState
    ? {
        pending: 'node-status-pending',
        running: 'node-status-running',
        success: 'node-status-success',
        error: 'node-status-error',
        skipped: 'node-status-pending',
      }[executionState.status]
    : '';

  // Validation severity for border glow
  const validationSeverity = validationResult?.severity ?? 'valid';

  return (
    <div
      className={cn(
        'group min-w-[200px] max-w-[280px] bg-white dark:bg-gray-800 rounded-xl shadow-lg',
        'border-2 transition-all duration-150',
        selected
          ? 'border-accumulate-500 ring-2 ring-accumulate-500/20'
          : 'border-gray-200 dark:border-gray-700',
        // Validation border glow (only when not selected, to avoid clashing)
        !selected && validationSeverity === 'error' && 'ring-2 ring-red-400/50 border-red-300 dark:border-red-700',
        !selected && validationSeverity === 'warning' && 'ring-1 ring-yellow-400/30 border-yellow-300 dark:border-yellow-700',
        statusClass
      )}
    >
      {/* Input handles */}
      {blockDef.inputs.length > 0 && (
        <Handle
          type="target"
          position={Position.Top}
          id="input"
          className={cn(
            'w-3 h-3 !bg-gray-400 dark:!bg-gray-500 border-2 border-white dark:border-gray-800',
            'hover:!bg-accumulate-500'
          )}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 rounded-t-xl"
        style={{ backgroundColor: `${blockDef.color}10` }}
      >
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${blockDef.color}20` }}
        >
          <Icon className="w-4 h-4" style={{ color: blockDef.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {nodeData.label || blockDef.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {blockDef.category}
          </div>
        </div>
        <StatusIcon />
        {/* Validation badge */}
        {validationResult && !executionState && (
          <ValidationBadge validationResult={validationResult} />
        )}
        {/* Delete button */}
        <button
          onClick={handleDelete}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            'p-1 rounded-md transition-colors',
            'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20',
            'opacity-0 group-hover:opacity-100',
            selected && 'opacity-100'
          )}
          title="Delete block"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body - Config preview */}
      <div className="px-4 py-3">
        {nodeData.config && Object.keys(nodeData.config).length > 0 ? (
          <div className="space-y-1.5">
            {Object.entries(nodeData.config).slice(0, 3).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2 text-xs">
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {key}:
                </span>
                <span className="text-gray-700 dark:text-gray-300 truncate font-mono">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
            {Object.keys(nodeData.config).length > 3 && (
              <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                +{Object.keys(nodeData.config).length - 3} more...
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400 dark:text-gray-500 italic">
            Click to configure
          </div>
        )}

        {/* Execution result */}
        {executionState?.error && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-600 dark:text-red-400">
            {executionState.error.message}
          </div>
        )}

        {executionState?.txHash && (
          <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs text-green-600 dark:text-green-400 font-mono truncate">
            TX: {executionState.txHash.slice(0, 16)}...
          </div>
        )}
      </div>

      {/* Output handles */}
      {blockDef.outputs.length > 0 && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="output"
          className={cn(
            'w-3 h-3 !bg-gray-400 dark:!bg-gray-500 border-2 border-white dark:border-gray-800',
            'hover:!bg-accumulate-500'
          )}
        />
      )}
    </div>
  );
});

BlockNode.displayName = 'BlockNode';

// =============================================================================
// Validation Badge Sub-Component
// =============================================================================

import type { NodeValidationResult } from '../../services/prerequisite-engine';

const ValidationBadge: React.FC<{ validationResult: NodeValidationResult }> = ({
  validationResult,
}) => {
  const { severity, issues, creditCost, autoFixRecipe } = validationResult;

  if (severity === 'valid') {
    return (
      <div className="group/badge relative">
        <CheckCircle2 className="w-4 h-4 text-green-500" />
        <div className="hidden group-hover/badge:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
            All prerequisites met
            {creditCost > 0 && (
              <span className="text-gray-300"> &middot; ~{creditCost} credits</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (severity === 'warning') {
    return (
      <div className="group/badge relative">
        <AlertTriangle className="w-4 h-4 text-yellow-500 animate-pulse" />
        <ValidationTooltip issues={issues} creditCost={creditCost} autoFixRecipe={autoFixRecipe} />
      </div>
    );
  }

  // error
  return (
    <div className="group/badge relative">
      <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" />
      <ValidationTooltip issues={issues} creditCost={creditCost} autoFixRecipe={autoFixRecipe} />
    </div>
  );
};

const ValidationTooltip: React.FC<{
  issues: NodeValidationResult['issues'];
  creditCost: number;
  autoFixRecipe: BlockType[];
}> = ({ issues, creditCost, autoFixRecipe }) => (
  <div className="hidden group-hover/badge:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
    <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-3 py-2 shadow-lg min-w-[180px] max-w-[260px]">
      <div className="font-medium mb-1">
        {issues.length} missing prerequisite{issues.length !== 1 ? 's' : ''}
      </div>
      <ul className="space-y-0.5 text-gray-300">
        {issues.map((issue, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-red-400 mt-0.5 flex-shrink-0">&bull;</span>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
      {creditCost > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700 dark:border-gray-600 text-gray-400">
          ~{creditCost} credits needed
        </div>
      )}
      {autoFixRecipe.length > 0 && (
        <div className="mt-1 text-accumulate-400">
          Double-click to configure, or use Smart Drop
        </div>
      )}
    </div>
  </div>
);
