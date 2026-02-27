import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Zap,
  ArrowRightLeft,
} from 'lucide-react';
import { cn, Button } from '../ui';
import type {
  FlowExecutionState,
  SyntheticMessage,
  SyntheticMessageType,
  TransactionStatus,
} from '@accumulate-studio/types';

interface SyntheticTracerProps {
  executionState: FlowExecutionState | null;
}

interface SyntheticMessageCardProps {
  message: SyntheticMessage;
  index: number;
}

const MESSAGE_TYPE_LABELS: Record<SyntheticMessageType, string> = {
  SyntheticCreateIdentity: 'Create Identity',
  SyntheticWriteData: 'Write Data',
  SyntheticDepositTokens: 'Deposit Tokens',
  SyntheticDepositCredits: 'Deposit Credits',
  SyntheticBurnTokens: 'Burn Tokens',
  SyntheticMirror: 'Mirror',
  SyntheticSequenced: 'Sequenced',
  SyntheticAnchor: 'Anchor',
};

const MESSAGE_TYPE_COLORS: Record<SyntheticMessageType, string> = {
  SyntheticCreateIdentity: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  SyntheticWriteData: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  SyntheticDepositTokens: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  SyntheticDepositCredits: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  SyntheticBurnTokens: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  SyntheticMirror: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
  SyntheticSequenced: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  SyntheticAnchor: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const StatusIcon: React.FC<{ status: TransactionStatus }> = ({ status }) => {
  switch (status) {
    case 'delivered':
    case 'confirmed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'pending':
      return <Clock className="w-4 h-4 text-yellow-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    default:
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
  }
};

const StatusBadge: React.FC<{ status: TransactionStatus }> = ({ status }) => {
  const colors: Record<TransactionStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    delivered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors[status])}>
      {status}
    </span>
  );
};

const SyntheticMessageCard: React.FC<SyntheticMessageCardProps> = ({ message, index }) => {
  const [expanded, setExpanded] = useState(false);

  const handleCopyHash = async () => {
    try {
      await navigator.clipboard.writeText(message.hash);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const extractPartition = (url: string): string => {
    // Extract partition from URL (e.g., "acc://foo.acme/bar" -> "foo")
    const match = url.match(/acc:\/\/([^.]+)/);
    return match ? match[1] : 'unknown';
  };

  const sourcePartition = extractPartition(message.source);
  const destPartition = extractPartition(message.destination);
  const isCrossPartition = sourcePartition !== destPartition;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header - Arrow visualization */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}

        <StatusIcon status={message.status} />

        {/* Type badge */}
        <span
          className={cn(
            'px-2 py-0.5 rounded text-xs font-medium flex-shrink-0',
            MESSAGE_TYPE_COLORS[message.type]
          )}
        >
          {MESSAGE_TYPE_LABELS[message.type]}
        </span>

        {/* Arrow flow visualization */}
        <div className="flex-1 flex items-center gap-2 min-w-0 px-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
              {message.source}
            </span>
          </div>

          <div className="flex items-center gap-1 text-gray-400">
            {isCrossPartition ? (
              <>
                <ArrowRightLeft className="w-4 h-4 text-accumulate-500" />
                <span className="text-xs text-accumulate-500 font-medium">cross</span>
              </>
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
          </div>

          <div className="flex items-center gap-1 min-w-0">
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
              {message.destination}
            </span>
          </div>
        </div>

        <StatusBadge status={message.status} />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
          {/* Message details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Message Hash</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate flex-1">
                  {message.hash}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
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
                  className="h-6 w-6 flex-shrink-0"
                  title="View in explorer"
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Type</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">{message.type}</p>
            </div>
          </div>

          {/* Source and destination */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Source</p>
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                  {message.source}
                </code>
                <p className="text-xs text-gray-400 mt-1">Partition: {sourcePartition}</p>
              </div>

              <div className="px-4">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    isCrossPartition
                      ? 'bg-accumulate-100 dark:bg-accumulate-900/50'
                      : 'bg-gray-100 dark:bg-gray-700'
                  )}
                >
                  <Send
                    className={cn(
                      'w-5 h-5',
                      isCrossPartition
                        ? 'text-accumulate-600 dark:text-accumulate-400'
                        : 'text-gray-500'
                    )}
                  />
                </div>
              </div>

              <div className="flex-1 text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Destination</p>
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                  {message.destination}
                </code>
                <p className="text-xs text-gray-400 mt-1">Partition: {destPartition}</p>
              </div>
            </div>
          </div>

          {/* Cause transaction */}
          {message.cause && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cause Transaction</p>
              <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                {message.cause}
              </code>
            </div>
          )}

          {/* Settlement status */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            {message.status === 'confirmed' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">
                  Settled and confirmed
                </span>
              </>
            ) : message.status === 'delivered' ? (
              <>
                <Zap className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  Delivered, awaiting confirmation
                </span>
              </>
            ) : message.status === 'pending' ? (
              <>
                <Clock className="w-4 h-4 text-yellow-500" />
                <span className="text-sm text-yellow-600 dark:text-yellow-400">
                  Pending settlement
                </span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400">
                  Settlement failed
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const SyntheticTracer: React.FC<SyntheticTracerProps> = ({ executionState }) => {
  // Extract synthetic messages from execution state
  const syntheticMessages = useMemo((): SyntheticMessage[] => {
    if (!executionState) return [];

    const messages: SyntheticMessage[] = [];
    for (const state of Object.values(executionState.nodeStates)) {
      if (state.outputs?.synthetics) {
        const synthetics = state.outputs.synthetics as SyntheticMessage[];
        messages.push(...synthetics);
      }
    }
    return messages;
  }, [executionState]);

  // Summary stats
  const stats = useMemo(() => {
    const byStatus = {
      pending: 0,
      delivered: 0,
      confirmed: 0,
      failed: 0,
      unknown: 0,
    };
    for (const msg of syntheticMessages) {
      byStatus[msg.status]++;
    }
    return byStatus;
  }, [syntheticMessages]);

  if (!executionState) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Send className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No synthetic messages yet.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Execute the flow to see synthetic message traces.
          </p>
        </div>
      </div>
    );
  }

  if (syntheticMessages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Send className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No synthetic messages generated.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            The executed transactions did not produce any synthetic messages.
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
          {syntheticMessages.length} synthetic message{syntheticMessages.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-3">
          {stats.confirmed > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3 h-3" />
              {stats.confirmed} confirmed
            </span>
          )}
          {stats.delivered > 0 && (
            <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <Zap className="w-3 h-3" />
              {stats.delivered} delivered
            </span>
          )}
          {stats.pending > 0 && (
            <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
              <Clock className="w-3 h-3" />
              {stats.pending} pending
            </span>
          )}
          {stats.failed > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <XCircle className="w-3 h-3" />
              {stats.failed} failed
            </span>
          )}
        </div>
      </div>

      {/* Flow visualization header */}
      <div className="flex items-center gap-2 px-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Message flow:</span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          Same partition
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-accumulate-500" />
          Cross partition
        </span>
      </div>

      {/* Message cards */}
      {syntheticMessages.map((message, index) => (
        <SyntheticMessageCard key={`${message.hash}-${index}`} message={message} index={index} />
      ))}
    </div>
  );
};
