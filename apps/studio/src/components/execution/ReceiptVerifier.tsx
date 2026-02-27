import React, { useState, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldX,
  ChevronDown,
  ChevronRight,
  Hash,
  GitBranch,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { cn, Button } from '../ui';
import type { FlowExecutionState, TransactionReceipt, MerkleProofEntry } from '@accumulate-studio/types';

interface ReceiptVerifierProps {
  executionState: FlowExecutionState | null;
}

interface ReceiptCardProps {
  receipt: TransactionReceipt;
  nodeId: string;
}

interface ProofTreeProps {
  proof: MerkleProofEntry[];
  txHash: string;
}

const ProofTree: React.FC<ProofTreeProps> = ({ proof, txHash }) => {
  if (proof.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No proof entries available
      </p>
    );
  }

  return (
    <div className="relative pl-4">
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

      {/* Transaction hash at the bottom */}
      <div className="relative flex items-center gap-3 py-2">
        <div className="relative z-10 w-5 h-5 rounded-full bg-accumulate-500 flex items-center justify-center">
          <Hash className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">Transaction Hash</p>
          <code className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate block">
            {txHash}
          </code>
        </div>
      </div>

      {/* Proof entries */}
      {proof.map((entry, index) => (
        <div key={index} className="relative flex items-center gap-3 py-2">
          <div
            className={cn(
              'relative z-10 w-5 h-5 rounded-full flex items-center justify-center',
              entry.right
                ? 'bg-blue-100 dark:bg-blue-900/50'
                : 'bg-purple-100 dark:bg-purple-900/50'
            )}
          >
            <GitBranch
              className={cn(
                'w-3 h-3',
                entry.right ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'
              )}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  entry.right
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                )}
              >
                {entry.right ? 'Right' : 'Left'}
              </span>
              <span className="text-xs text-gray-400">Level {index + 1}</span>
            </div>
            <code className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate block mt-1">
              {entry.hash}
            </code>
          </div>
        </div>
      ))}

      {/* Anchor/Root at the top */}
      <div className="relative flex items-center gap-3 py-2">
        <div className="relative z-10 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <ShieldCheck className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">Merkle Root (Anchored)</p>
        </div>
      </div>
    </div>
  );
};

const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt, nodeId }) => {
  const [expanded, setExpanded] = useState(true);
  const [showProof, setShowProof] = useState(false);

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(receipt.txHash);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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

        {receipt.verified ? (
          <ShieldCheck className="w-5 h-5 text-green-500" />
        ) : (
          <ShieldX className="w-5 h-5 text-red-500" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {nodeId}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {receipt.txHash}
          </p>
        </div>

        <span
          className={cn(
            'px-2 py-1 rounded text-xs font-medium',
            receipt.verified
              ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
          )}
        >
          {receipt.verified ? 'Verified' : 'Unverified'}
        </span>
      </div>

      {/* Content */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
          {/* Transaction info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Transaction Hash</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate flex-1">
                  {receipt.txHash}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={handleCopyHash}
                  title="Copy hash"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  title="View in explorer"
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Local Block</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                #{receipt.localBlock}
                <span className="text-xs text-gray-500 ml-2">
                  {new Date(receipt.localTimestamp).toLocaleString()}
                </span>
              </p>
            </div>
          </div>

          {receipt.majorBlock && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Major Block</p>
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  #{receipt.majorBlock}
                  {receipt.majorTimestamp && (
                    <span className="text-xs text-gray-500 ml-2">
                      {new Date(receipt.majorTimestamp).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Anchor chain info */}
          {receipt.anchorChain && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Anchor Chain
              </p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Start:</span>
                  <code className="font-mono text-gray-700 dark:text-gray-300">
                    {receipt.anchorChain.start}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">End:</span>
                  <code className="font-mono text-gray-700 dark:text-gray-300">
                    {receipt.anchorChain.end}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Anchor:</span>
                  <code className="font-mono text-gray-700 dark:text-gray-300">
                    {receipt.anchorChain.anchor}
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* Proof visualization toggle */}
          <div>
            <button
              onClick={() => setShowProof(!showProof)}
              className="flex items-center gap-2 text-sm text-accumulate-600 dark:text-accumulate-400 hover:text-accumulate-700 dark:hover:text-accumulate-300"
            >
              {showProof ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              <GitBranch className="w-4 h-4" />
              {showProof ? 'Hide' : 'Show'} Merkle Proof ({receipt.proof.length} entries)
            </button>

            {showProof && (
              <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <ProofTree proof={receipt.proof} txHash={receipt.txHash} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const ReceiptVerifier: React.FC<ReceiptVerifierProps> = ({ executionState }) => {
  // Extract receipts from execution state
  const receipts = useMemo(() => {
    if (!executionState) return [];

    const result: { nodeId: string; receipt: TransactionReceipt }[] = [];
    for (const [nodeId, state] of Object.entries(executionState.nodeStates)) {
      if (state.receipt) {
        result.push({ nodeId, receipt: state.receipt as TransactionReceipt });
      }
    }
    return result;
  }, [executionState]);

  // Summary stats
  const stats = useMemo(() => {
    const verified = receipts.filter((r) => r.receipt.verified).length;
    const unverified = receipts.filter((r) => !r.receipt.verified).length;
    return { verified, unverified, total: receipts.length };
  }, [receipts]);

  if (!executionState) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No receipts available yet.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Execute the flow to generate transaction receipts.
          </p>
        </div>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No receipts generated.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Receipts are generated after transactions are confirmed.
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
          {stats.total} receipt{stats.total !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-4">
          {stats.verified > 0 && (
            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <ShieldCheck className="w-4 h-4" />
              {stats.verified} verified
            </span>
          )}
          {stats.unverified > 0 && (
            <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <ShieldX className="w-4 h-4" />
              {stats.unverified} unverified
            </span>
          )}
        </div>
      </div>

      {/* Receipt cards */}
      {receipts.map(({ nodeId, receipt }) => (
        <ReceiptCard key={nodeId} nodeId={nodeId} receipt={receipt} />
      ))}
    </div>
  );
};
