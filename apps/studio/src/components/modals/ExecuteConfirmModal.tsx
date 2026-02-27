import React, { useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Play, AlertTriangle, Zap, Layers, CreditCard, Globe } from 'lucide-react';
import { cn, Button } from '../ui';
import { useFlowStore, useUIStore } from '../../store';
import { NETWORKS, BLOCK_CATALOG, isTransactionBlock, type NetworkId } from '@accumulate-studio/types';

// =============================================================================
// Types
// =============================================================================

interface ExecuteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

interface ExecutionSummary {
  totalBlocks: number;
  transactionBlocks: number;
  utilityBlocks: number;
  estimatedCredits: number;
  hasMainnetWarning: boolean;
  network: NetworkId;
}

// =============================================================================
// Constants
// =============================================================================

// Estimated credits per transaction type (simplified)
const CREDIT_COSTS: Record<string, number> = {
  CreateIdentity: 2500,
  CreateKeyBook: 100,
  CreateKeyPage: 100,
  CreateTokenAccount: 100,
  CreateDataAccount: 100,
  CreateToken: 5000,
  SendTokens: 1,
  IssueTokens: 1,
  BurnTokens: 1,
  AddCredits: 1,
  TransferCredits: 1,
  BurnCredits: 1,
  WriteData: 1,
  WriteDataTo: 1,
  UpdateKeyPage: 1,
  UpdateKey: 1,
  LockAccount: 1,
  UpdateAccountAuth: 1,
  Faucet: 0,
  QueryAccount: 0,
  WaitForBalance: 0,
  WaitForCredits: 0,
  GenerateKeys: 0,
  Comment: 0,
};

// =============================================================================
// Helper Components
// =============================================================================

interface SummaryItemProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: boolean;
}

const SummaryItem: React.FC<SummaryItemProps> = ({ icon, label, value, highlight }) => (
  <div
    className={cn(
      'flex items-center justify-between p-3 rounded-lg',
      highlight
        ? 'bg-accumulate-50 dark:bg-accumulate-900/20 border border-accumulate-200 dark:border-accumulate-800'
        : 'bg-gray-50 dark:bg-gray-800'
    )}
  >
    <div className="flex items-center gap-3">
      <div className="text-gray-500 dark:text-gray-400">{icon}</div>
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
    </div>
    <span
      className={cn(
        'font-semibold',
        highlight
          ? 'text-accumulate-600 dark:text-accumulate-400'
          : 'text-gray-900 dark:text-gray-100'
      )}
    >
      {value}
    </span>
  </div>
);

// =============================================================================
// Main Component
// =============================================================================

export const ExecuteConfirmModal: React.FC<ExecuteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const flow = useFlowStore((state) => state.flow);
  const selectedNetwork = useUIStore((state) => state.selectedNetwork);

  // Calculate execution summary
  const summary = useMemo((): ExecutionSummary => {
    let transactionBlocks = 0;
    let utilityBlocks = 0;
    let estimatedCredits = 0;

    for (const node of flow.nodes) {
      if (isTransactionBlock(node.type)) {
        transactionBlocks++;
        estimatedCredits += CREDIT_COSTS[node.type] ?? 1;
      } else {
        utilityBlocks++;
      }
    }

    return {
      totalBlocks: flow.nodes.length,
      transactionBlocks,
      utilityBlocks,
      estimatedCredits,
      hasMainnetWarning: selectedNetwork === 'mainnet',
      network: selectedNetwork,
    };
  }, [flow.nodes, selectedNetwork]);

  const networkConfig = NETWORKS[summary.network];

  // Handle confirm
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

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
            'w-full max-w-md overflow-hidden',
            'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
            'border border-gray-200 dark:border-gray-700',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'duration-200'
          )}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    summary.hasMainnetWarning
                      ? 'bg-orange-100 dark:bg-orange-900/30'
                      : 'bg-green-100 dark:bg-green-900/30'
                  )}
                >
                  <Play
                    className={cn(
                      'w-5 h-5',
                      summary.hasMainnetWarning
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-green-600 dark:text-green-400'
                    )}
                  />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Execute Flow
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400">
                    Review and confirm execution
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
          <div className="px-6 py-4 space-y-4">
            {/* Mainnet Warning */}
            {summary.hasMainnetWarning && (
              <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    MainNet Warning
                  </h4>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                    You are about to execute on the MainNet. This will use real ACME tokens and
                    credits. Transactions cannot be reversed.
                  </p>
                </div>
              </div>
            )}

            {/* Network Info */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">Network</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {networkConfig.name}
                </span>
                {networkConfig.faucetAvailable && (
                  <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded">
                    Faucet
                  </span>
                )}
                {networkConfig.readOnly && (
                  <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs rounded">
                    Read-Only
                  </span>
                )}
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-2">
              <SummaryItem
                icon={<Layers className="w-4 h-4" />}
                label="Total Blocks"
                value={summary.totalBlocks}
              />
              <SummaryItem
                icon={<Zap className="w-4 h-4" />}
                label="Transactions"
                value={summary.transactionBlocks}
                highlight
              />
              <SummaryItem
                icon={<CreditCard className="w-4 h-4" />}
                label="Estimated Credits"
                value={`~${summary.estimatedCredits.toLocaleString()}`}
              />
            </div>

            {/* Empty flow warning */}
            {summary.totalBlocks === 0 && (
              <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  This flow has no blocks. Add blocks to the canvas before executing.
                </p>
              </div>
            )}

            {/* No transactions info */}
            {summary.transactionBlocks === 0 && summary.totalBlocks > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                This flow contains only utility blocks and won't submit any transactions.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant={summary.hasMainnetWarning ? 'destructive' : 'primary'}
                onClick={handleConfirm}
                disabled={summary.totalBlocks === 0 || networkConfig.readOnly}
              >
                <Play className="w-4 h-4 mr-2" />
                {summary.hasMainnetWarning ? 'Execute on MainNet' : 'Execute Flow'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
