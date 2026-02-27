import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  RefreshCw,
  Database,
  FileJson,
} from 'lucide-react';
import { cn } from '../ui';
import type { FlowExecutionState, AccountStateDiff, StateDiffEntry } from '@accumulate-studio/types';

interface StateDiffViewerProps {
  executionState: FlowExecutionState | null;
}

interface AccountDiffCardProps {
  diff: AccountStateDiff;
}

interface DiffLineProps {
  entry: StateDiffEntry;
}

const DiffLine: React.FC<DiffLineProps> = ({ entry }) => {
  const getIcon = () => {
    switch (entry.type) {
      case 'added':
        return <Plus className="w-3 h-3 text-green-500" />;
      case 'removed':
        return <Minus className="w-3 h-3 text-red-500" />;
      case 'changed':
        return <RefreshCw className="w-3 h-3 text-yellow-500" />;
    }
  };

  const getBgColor = () => {
    switch (entry.type) {
      case 'added':
        return 'bg-green-50 dark:bg-green-900/20 border-l-green-500';
      case 'removed':
        return 'bg-red-50 dark:bg-red-900/20 border-l-red-500';
      case 'changed':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-l-yellow-500';
    }
  };

  const formatValue = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  return (
    <div className={cn('border-l-2 pl-3 py-2', getBgColor())}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {entry.path}
            </span>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                entry.type === 'added' && 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
                entry.type === 'removed' && 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
                entry.type === 'changed' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
              )}
            >
              {entry.type}
            </span>
          </div>

          {entry.type === 'changed' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="p-2 bg-red-100/50 dark:bg-red-900/30 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Before:</p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                  {formatValue(entry.before)}
                </pre>
              </div>
              <div className="p-2 bg-green-100/50 dark:bg-green-900/30 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">After:</p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                  {formatValue(entry.after)}
                </pre>
              </div>
            </div>
          )}

          {entry.type === 'added' && (
            <div className="p-2 bg-green-100/50 dark:bg-green-900/30 rounded mt-2">
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                {formatValue(entry.after)}
              </pre>
            </div>
          )}

          {entry.type === 'removed' && (
            <div className="p-2 bg-red-100/50 dark:bg-red-900/30 rounded mt-2">
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                {formatValue(entry.before)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AccountDiffCard: React.FC<AccountDiffCardProps> = ({ diff }) => {
  const [expanded, setExpanded] = useState(true);
  const [showRawJson, setShowRawJson] = useState(false);

  const stats = useMemo(() => {
    return {
      added: diff.changes.filter((c) => c.type === 'added').length,
      removed: diff.changes.filter((c) => c.type === 'removed').length,
      changed: diff.changes.filter((c) => c.type === 'changed').length,
    };
  }, [diff.changes]);

  const isNewAccount = diff.before === null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}

        <Database className="w-4 h-4 text-accumulate-500" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {diff.url}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {diff.accountType}
            {isNewAccount && (
              <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded">
                New Account
              </span>
            )}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs">
          {stats.added > 0 && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Plus className="w-3 h-3" />
              {stats.added}
            </span>
          )}
          {stats.removed > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <Minus className="w-3 h-3" />
              {stats.removed}
            </span>
          )}
          {stats.changed > 0 && (
            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <RefreshCw className="w-3 h-3" />
              {stats.changed}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* View toggle */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
            <button
              onClick={() => setShowRawJson(false)}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors',
                !showRawJson
                  ? 'bg-accumulate-100 text-accumulate-700 dark:bg-accumulate-900/50 dark:text-accumulate-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              )}
            >
              Diff View
            </button>
            <button
              onClick={() => setShowRawJson(true)}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors flex items-center gap-1',
                showRawJson
                  ? 'bg-accumulate-100 text-accumulate-700 dark:bg-accumulate-900/50 dark:text-accumulate-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              )}
            >
              <FileJson className="w-3 h-3" />
              JSON
            </button>
          </div>

          {showRawJson ? (
            <div className="grid grid-cols-2 gap-0">
              <div className="p-3 border-r border-gray-200 dark:border-gray-700 bg-red-50/30 dark:bg-red-900/10">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Before
                </p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {diff.before ? JSON.stringify(diff.before, null, 2) : 'null'}
                </pre>
              </div>
              <div className="p-3 bg-green-50/30 dark:bg-green-900/10">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  After
                </p>
                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {JSON.stringify(diff.after, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {diff.changes.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No changes detected
                </p>
              ) : (
                diff.changes.map((change, index) => (
                  <DiffLine key={`${change.path}-${index}`} entry={change} />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const StateDiffViewer: React.FC<StateDiffViewerProps> = ({ executionState }) => {
  // Extract state diffs from execution state
  // In a real implementation, this would come from the execution engine
  const stateDiffs = useMemo((): AccountStateDiff[] => {
    if (!executionState) return [];

    // Extract diffs from node outputs
    const diffs: AccountStateDiff[] = [];
    for (const state of Object.values(executionState.nodeStates)) {
      if (state.outputs?.stateDiff) {
        const diff = state.outputs.stateDiff as AccountStateDiff;
        diffs.push(diff);
      }
      if (state.outputs?.stateDiffs) {
        const nodeDiffs = state.outputs.stateDiffs as AccountStateDiff[];
        diffs.push(...nodeDiffs);
      }
    }
    return diffs;
  }, [executionState]);

  if (!executionState) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Database className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No state changes yet.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Execute the flow to see account state changes.
          </p>
        </div>
      </div>
    );
  }

  if (stateDiffs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Database className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No state changes detected.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            The executed transactions did not modify any account state.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {stateDiffs.length} account{stateDiffs.length !== 1 ? 's' : ''} modified
        </span>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Plus className="w-3 h-3" />
            Added
          </span>
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <Minus className="w-3 h-3" />
            Removed
          </span>
          <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <RefreshCw className="w-3 h-3" />
            Changed
          </span>
        </div>
      </div>

      {/* Account diffs */}
      {stateDiffs.map((diff, index) => (
        <AccountDiffCard key={`${diff.url}-${index}`} diff={diff} />
      ))}
    </div>
  );
};
