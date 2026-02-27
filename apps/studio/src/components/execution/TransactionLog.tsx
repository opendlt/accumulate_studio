import React, { useState, useMemo } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { cn, Button } from '../ui';
import { useFlowStore } from '../../store';
import { BLOCK_CATALOG } from '@accumulate-studio/types';
import type { FlowExecutionState, NodeExecutionState, NodeExecutionStatus } from '@accumulate-studio/types';

interface TransactionLogProps {
  executionState: FlowExecutionState | null;
}

interface TransactionItemProps {
  nodeId: string;
  displayName: string;
  state: NodeExecutionState;
}

const StatusIcon: React.FC<{ status: NodeExecutionStatus }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'skipped':
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case 'pending':
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
};

const StatusBadge: React.FC<{ status: NodeExecutionStatus }> = ({ status }) => {
  const colors: Record<NodeExecutionStatus, string> = {
    pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    skipped: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors[status])}>
      {status}
    </span>
  );
};

const TransactionItem: React.FC<TransactionItemProps> = ({ nodeId, displayName, state }) => {
  const [expanded, setExpanded] = useState(false);

  const handleCopyHash = async () => {
    if (state.txHash) {
      try {
        await navigator.clipboard.writeText(state.txHash);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '--:--:--';
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatDuration = () => {
    if (!state.startedAt || !state.completedAt) return null;
    const start = new Date(state.startedAt).getTime();
    const end = new Date(state.completedAt).getTime();
    const duration = end - start;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const hasDetails = state.error || state.outputs || state.txHash;

  return (
    <div
      className={cn(
        'border-b border-gray-100 dark:border-gray-800 last:border-b-0',
        state.status === 'error' && 'bg-red-50/50 dark:bg-red-900/10'
      )}
    >
      {/* Main row */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50',
          !hasDetails && 'cursor-default'
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Expand icon */}
        <div className="w-4 h-4 flex-shrink-0">
          {hasDetails && (
            expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          )}
        </div>

        {/* Status icon */}
        <StatusIcon status={state.status} />

        {/* Node name */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
            {displayName}
          </span>
        </div>

        {/* Status badge */}
        <StatusBadge status={state.status} />

        {/* Timestamp */}
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {formatTime(state.startedAt)}
        </span>

        {/* Duration */}
        {formatDuration() && (
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-16 text-right">
            {formatDuration()}
          </span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="px-4 pb-3 pl-11 space-y-2">
          {/* Transaction hash */}
          {state.txHash && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">TxHash:</span>
              <code className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded truncate max-w-xs">
                {state.txHash}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyHash();
                }}
                title="Copy hash"
              >
                <Copy className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="View in explorer"
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Error message */}
          {state.error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    {state.error.code}
                  </p>
                  <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                    {state.error.message}
                  </p>
                  {state.error.details && (
                    <pre className="mt-2 text-xs text-red-500 dark:text-red-400 overflow-x-auto">
                      {JSON.stringify(state.error.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Outputs */}
          {state.outputs && Object.keys(state.outputs).length > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Outputs:
              </p>
              <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                {JSON.stringify(state.outputs, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const TransactionLog: React.FC<TransactionLogProps> = ({ executionState }) => {
  const flowNodes = useFlowStore((state) => state.flow.nodes);

  // Build a lookup from nodeId → human-readable name
  const nodeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const node of flowNodes) {
      const catalogEntry = BLOCK_CATALOG[node.type as keyof typeof BLOCK_CATALOG];
      map[node.id] = node.label || catalogEntry?.name || node.type;
    }
    return map;
  }, [flowNodes]);

  if (!executionState) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No execution data yet.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Click Execute to run the flow.
          </p>
        </div>
      </div>
    );
  }

  const nodeStates = executionState.nodeStates;
  const sortedNodes = Object.entries(nodeStates).sort((a, b) => {
    const timeA = a[1].startedAt ? new Date(a[1].startedAt).getTime() : Infinity;
    const timeB = b[1].startedAt ? new Date(b[1].startedAt).getTime() : Infinity;
    return timeA - timeB;
  });

  if (sortedNodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Preparing execution...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center gap-3 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span className="w-4" />
          <span className="w-4" />
          <span className="flex-1">Node</span>
          <span className="w-16">Status</span>
          <span className="w-16 text-right">Time</span>
          <span className="w-16 text-right">Duration</span>
        </div>
      </div>

      {/* Transaction list */}
      <div>
        {sortedNodes.map(([nodeId, state]) => (
          <TransactionItem key={nodeId} nodeId={nodeId} displayName={nodeNameMap[nodeId] || nodeId} state={state} />
        ))}
      </div>

      {/* Logs section */}
      {executionState.logs.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 mt-4">
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Execution Logs
            </h3>
          </div>
          <div className="p-2 font-mono text-xs max-h-48 overflow-y-auto bg-gray-900 text-gray-300">
            {executionState.logs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  'py-1 px-2',
                  log.level === 'error' && 'text-red-400',
                  log.level === 'warn' && 'text-yellow-400',
                  log.level === 'debug' && 'text-gray-500'
                )}
              >
                <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                {log.nodeId && <span className="text-blue-400">[{nodeNameMap[log.nodeId] || log.nodeId}]</span>}{' '}
                {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
