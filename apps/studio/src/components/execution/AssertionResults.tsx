import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle } from 'lucide-react';
import { cn } from '../ui';
import type { AssertionResult, AssertionStatus } from '../../services/assertion-runner';

// =============================================================================
// Types
// =============================================================================

interface AssertionResultsProps {
  results: AssertionResult[] | null;
  isRunning?: boolean;
}

// =============================================================================
// Status Helpers
// =============================================================================

const STATUS_CONFIG: Record<AssertionStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  pass: { icon: CheckCircle2, color: 'text-green-500', label: 'Pass' },
  fail: { icon: XCircle, color: 'text-red-500', label: 'Fail' },
  skip: { icon: MinusCircle, color: 'text-gray-400', label: 'Skip' },
  error: { icon: AlertTriangle, color: 'text-yellow-500', label: 'Error' },
};

// =============================================================================
// Component
// =============================================================================

export const AssertionResults: React.FC<AssertionResultsProps> = ({ results, isRunning }) => {
  if (isRunning) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin w-6 h-6 border-2 border-accumulate-500 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Running assertions...</p>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Assertions will run after execution completes.
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No assertions defined for this flow.
        </p>
      </div>
    );
  }

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skip').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return (
    <div className="h-full overflow-auto p-4">
      {/* Summary */}
      <div className="flex items-center gap-4 mb-4 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {results.length} assertion{results.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-3 ml-auto text-xs">
          {passCount > 0 && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> {passCount} passed
            </span>
          )}
          {failCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <XCircle className="w-3.5 h-3.5" /> {failCount} failed
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-3.5 h-3.5" /> {errorCount} error
            </span>
          )}
          {skipCount > 0 && (
            <span className="flex items-center gap-1 text-gray-500">
              <MinusCircle className="w-3.5 h-3.5" /> {skipCount} skipped
            </span>
          )}
        </div>
      </div>

      {/* Results list */}
      <div className="space-y-2">
        {results.map((result, idx) => {
          const config = STATUS_CONFIG[result.status];
          const Icon = config.icon;

          return (
            <div
              key={idx}
              className={cn(
                'flex items-start gap-3 px-3 py-2 rounded-lg border',
                'bg-white dark:bg-gray-900',
                result.status === 'pass' && 'border-green-200 dark:border-green-800/50',
                result.status === 'fail' && 'border-red-200 dark:border-red-800/50',
                result.status === 'error' && 'border-yellow-200 dark:border-yellow-800/50',
                result.status === 'skip' && 'border-gray-200 dark:border-gray-700'
              )}
            >
              <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded', {
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': result.status === 'pass',
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': result.status === 'fail',
                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400': result.status === 'error',
                    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': result.status === 'skip',
                  })}>
                    {result.assertion.type}
                  </span>
                  <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                  {result.message}
                </p>
                {result.assertion.message && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">
                    {result.assertion.message}
                  </p>
                )}
                {result.actual !== undefined && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Actual: <code className="font-mono">{result.actual}</code>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
