/**
 * @accumulate-studio/verification
 * Transaction receipt verification, Merkle proof validation, and state diff computation
 */

// Merkle proof verification
export {
  MerkleProof,
  computeRoot,
  verifyProof,
  sha256Hash,
  createLeafHash,
} from './merkle';

// Receipt parsing and verification
export {
  parseReceipt,
  verifyReceipt,
  parseAndVerifyReceipt,
  isReceiptAnchored,
  getProofDepth,
  estimateBlockSize,
  type ReceiptVerificationResult,
  type RawReceiptData,
} from './receipt';

// State diff computation
export {
  computeStateDiff,
  getAdditions,
  getRemovals,
  getChanges,
  wasPathModified,
  getChangeAtPath,
  formatDiffEntry,
  formatDiff,
  applyDiff,
} from './state-diff';

// Synthetic message parsing and tracing
export {
  parseSyntheticMessages,
  traceSyntheticDelivery,
  areAllDelivered,
  hasFailures,
  getPendingMessages,
  getMessagesForDestination,
  getCauseChain,
  buildDependencyGraph,
  formatTraceResult,
  type TraceResult,
  type TraceSummary,
  type RawTransactionResult,
} from './synthetic';

// Re-export types from @accumulate-studio/types for convenience
export type {
  TransactionReceipt,
  MerkleProofEntry,
  StateDiffEntry,
  AccountStateDiff,
  SyntheticMessage,
  SyntheticMessageType,
  TransactionStatus,
} from '@accumulate-studio/types';
