import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Play, Square, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn, Button } from '../ui';
import { TransactionLog } from './TransactionLog';
import { StateDiffViewer } from './StateDiffViewer';
import { ReceiptVerifier } from './ReceiptVerifier';
import { SyntheticTracer } from './SyntheticTracer';
import { AssertionResults } from './AssertionResults';
import type { FlowExecutionState } from '@accumulate-studio/types';
import type { AssertionResult } from '../../services/assertion-runner';

interface ExecutionPanelProps {
  executionState: FlowExecutionState | null;
  assertionResults?: AssertionResult[] | null;
  assertionsRunning?: boolean;
  onExecute: () => void;
  onStop: () => void;
}

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  executionState,
  assertionResults,
  assertionsRunning,
  onExecute,
  onStop,
}) => {
  const [activeTab, setActiveTab] = React.useState('log');

  const isRunning = executionState?.status === 'running';
  const isCompleted = executionState?.status === 'completed';
  const isFailed = executionState?.status === 'failed';

  // Calculate execution stats
  const nodeStates = executionState?.nodeStates ?? {};
  const totalNodes = Object.keys(nodeStates).length;
  const successCount = Object.values(nodeStates).filter((s) => s.status === 'success').length;
  const errorCount = Object.values(nodeStates).filter((s) => s.status === 'error').length;

  const getStatusIcon = () => {
    if (isRunning) {
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    }
    if (isCompleted) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (isFailed) {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    return <AlertCircle className="w-4 h-4 text-gray-400" />;
  };

  const getStatusText = () => {
    if (isRunning) {
      return 'Running...';
    }
    if (isCompleted) {
      return `Completed (${successCount}/${totalNodes} successful)`;
    }
    if (isFailed) {
      return `Failed (${errorCount} error${errorCount !== 1 ? 's' : ''})`;
    }
    return 'Ready to execute';
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Execution
          </h2>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onStop}
                className="flex items-center gap-2"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={onExecute}
                className="flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Execute
              </Button>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          {getStatusIcon()}
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {getStatusText()}
          </span>
          {executionState?.startedAt && (
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
              {new Date(executionState.startedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Tabbed content */}
      <Tabs.Root
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Tabs.List className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-800">
          <Tabs.Trigger
            value="log"
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium',
              'border-b-2 -mb-px transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accumulate-500',
              activeTab === 'log'
                ? 'border-accumulate-500 text-accumulate-600 dark:text-accumulate-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            Transaction Log
          </Tabs.Trigger>
          <Tabs.Trigger
            value="state"
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium',
              'border-b-2 -mb-px transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accumulate-500',
              activeTab === 'state'
                ? 'border-accumulate-500 text-accumulate-600 dark:text-accumulate-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            State Diff
          </Tabs.Trigger>
          <Tabs.Trigger
            value="receipt"
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium',
              'border-b-2 -mb-px transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accumulate-500',
              activeTab === 'receipt'
                ? 'border-accumulate-500 text-accumulate-600 dark:text-accumulate-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            Receipt
          </Tabs.Trigger>
          <Tabs.Trigger
            value="synthetic"
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium',
              'border-b-2 -mb-px transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accumulate-500',
              activeTab === 'synthetic'
                ? 'border-accumulate-500 text-accumulate-600 dark:text-accumulate-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            Synthetic
          </Tabs.Trigger>
          <Tabs.Trigger
            value="assertions"
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium',
              'border-b-2 -mb-px transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accumulate-500',
              activeTab === 'assertions'
                ? 'border-accumulate-500 text-accumulate-600 dark:text-accumulate-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            Assertions
            {assertionResults && assertionResults.length > 0 && (
              <span className={cn(
                'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                assertionResults.every((r) => r.status === 'pass' || r.status === 'skip')
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}>
                {assertionResults.filter((r) => r.status === 'pass').length}/{assertionResults.length}
              </span>
            )}
          </Tabs.Trigger>
        </Tabs.List>

        <div className="flex-1 overflow-hidden">
          <Tabs.Content value="log" className="h-full">
            <TransactionLog executionState={executionState} />
          </Tabs.Content>
          <Tabs.Content value="state" className="h-full">
            <StateDiffViewer executionState={executionState} />
          </Tabs.Content>
          <Tabs.Content value="receipt" className="h-full">
            <ReceiptVerifier executionState={executionState} />
          </Tabs.Content>
          <Tabs.Content value="synthetic" className="h-full">
            <SyntheticTracer executionState={executionState} />
          </Tabs.Content>
          <Tabs.Content value="assertions" className="h-full">
            <AssertionResults results={assertionResults ?? null} isRunning={assertionsRunning} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
};
