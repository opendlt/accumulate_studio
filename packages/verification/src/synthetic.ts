/**
 * Synthetic Message Parsing and Tracing
 * Track synthetic message flow from source to destination
 */

import type { SyntheticMessage, SyntheticMessageType, TransactionStatus } from '@accumulate-studio/types';

// =============================================================================
// Types
// =============================================================================

export interface TraceResult {
  /** Original transaction that caused the synthetic messages */
  sourceTransaction?: string;
  /** All synthetic messages in the flow */
  messages: SyntheticMessage[];
  /** Messages grouped by destination partition */
  byDestination: Map<string, SyntheticMessage[]>;
  /** Messages grouped by type */
  byType: Map<SyntheticMessageType, SyntheticMessage[]>;
  /** Overall delivery status */
  status: 'pending' | 'partial' | 'delivered' | 'failed';
  /** Messages that failed to deliver */
  failedMessages: SyntheticMessage[];
  /** Messages still pending */
  pendingMessages: SyntheticMessage[];
  /** Summary statistics */
  summary: TraceSummary;
}

export interface TraceSummary {
  total: number;
  delivered: number;
  pending: number;
  failed: number;
  byType: Record<string, number>;
}

export interface RawTransactionResult {
  txid?: string;
  txHash?: string;
  status?: string | { code?: string; delivered?: boolean };
  result?: {
    type?: string;
    synthetic?: RawSyntheticMessage[];
    produced?: RawSyntheticMessage[];
    [key: string]: unknown;
  };
  produced?: RawSyntheticMessage[];
  [key: string]: unknown;
}

interface RawSyntheticMessage {
  type?: string;
  hash?: string;
  txid?: string;
  source?: string;
  destination?: string;
  status?: string | { code?: string; delivered?: boolean };
  cause?: string;
  [key: string]: unknown;
}

// =============================================================================
// Synthetic Message Parsing
// =============================================================================

/**
 * Parse synthetic messages from a transaction result
 * @param txResult - Raw transaction result from API
 * @returns Array of parsed SyntheticMessage objects
 */
export function parseSyntheticMessages(txResult: object): SyntheticMessage[] {
  const raw = txResult as RawTransactionResult;
  const messages: SyntheticMessage[] = [];

  // Look for synthetic messages in various locations
  const sources = [
    raw.result?.synthetic,
    raw.result?.produced,
    raw.produced,
  ];

  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const item of source) {
        const parsed = parseSingleSynthetic(item);
        if (parsed) {
          messages.push(parsed);
        }
      }
    }
  }

  return messages;
}

/**
 * Parse a single synthetic message
 */
function parseSingleSynthetic(data: RawSyntheticMessage): SyntheticMessage | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const type = parseSyntheticType(data.type);
  if (!type) {
    return null;
  }

  const hash = data.hash || data.txid;
  if (!hash) {
    return null;
  }

  return {
    type,
    hash: String(hash),
    source: data.source || '',
    destination: data.destination || '',
    status: parseTransactionStatus(data.status),
    cause: data.cause,
  };
}

/**
 * Parse a synthetic message type string
 */
function parseSyntheticType(type: unknown): SyntheticMessageType | null {
  if (typeof type !== 'string') {
    return null;
  }

  const validTypes: SyntheticMessageType[] = [
    'SyntheticCreateIdentity',
    'SyntheticWriteData',
    'SyntheticDepositTokens',
    'SyntheticDepositCredits',
    'SyntheticBurnTokens',
    'SyntheticMirror',
    'SyntheticSequenced',
    'SyntheticAnchor',
  ];

  // Handle various formats
  const normalized = type.replace(/^synthetic/i, 'Synthetic');

  if (validTypes.includes(normalized as SyntheticMessageType)) {
    return normalized as SyntheticMessageType;
  }

  // Try matching by suffix
  for (const validType of validTypes) {
    if (validType.toLowerCase().endsWith(type.toLowerCase())) {
      return validType;
    }
  }

  return null;
}

/**
 * Parse a transaction status
 */
function parseTransactionStatus(status: unknown): TransactionStatus {
  if (typeof status === 'string') {
    const lower = status.toLowerCase();
    if (lower === 'delivered' || lower === 'confirmed') return 'delivered';
    if (lower === 'pending') return 'pending';
    if (lower === 'failed') return 'failed';
    return 'unknown';
  }

  if (typeof status === 'object' && status !== null) {
    const s = status as { code?: string; delivered?: boolean };
    if (s.delivered === true) return 'delivered';
    if (s.code?.toLowerCase() === 'ok' || s.code?.toLowerCase() === 'delivered') {
      return 'delivered';
    }
  }

  return 'pending';
}

// =============================================================================
// Synthetic Message Tracing
// =============================================================================

/**
 * Trace synthetic message delivery from source to destination
 * @param messages - Array of synthetic messages to trace
 * @returns Trace result with grouped messages and status
 */
export function traceSyntheticDelivery(messages: SyntheticMessage[]): TraceResult {
  // Group by destination partition
  const byDestination = new Map<string, SyntheticMessage[]>();
  for (const msg of messages) {
    const dest = extractPartition(msg.destination);
    const existing = byDestination.get(dest) || [];
    existing.push(msg);
    byDestination.set(dest, existing);
  }

  // Group by type
  const byType = new Map<SyntheticMessageType, SyntheticMessage[]>();
  for (const msg of messages) {
    const existing = byType.get(msg.type) || [];
    existing.push(msg);
    byType.set(msg.type, existing);
  }

  // Categorize messages
  const failedMessages = messages.filter((m) => m.status === 'failed');
  const pendingMessages = messages.filter((m) => m.status === 'pending' || m.status === 'unknown');
  const deliveredMessages = messages.filter(
    (m) => m.status === 'delivered' || m.status === 'confirmed'
  );

  // Determine overall status
  let status: TraceResult['status'];
  if (failedMessages.length > 0) {
    status = 'failed';
  } else if (pendingMessages.length > 0) {
    if (deliveredMessages.length > 0) {
      status = 'partial';
    } else {
      status = 'pending';
    }
  } else {
    status = 'delivered';
  }

  // Build summary
  const byTypeCount: Record<string, number> = {};
  for (const [type, msgs] of byType) {
    byTypeCount[type] = msgs.length;
  }

  const summary: TraceSummary = {
    total: messages.length,
    delivered: deliveredMessages.length,
    pending: pendingMessages.length,
    failed: failedMessages.length,
    byType: byTypeCount,
  };

  return {
    messages,
    byDestination,
    byType,
    status,
    failedMessages,
    pendingMessages,
    summary,
  };
}

/**
 * Extract partition name from an Accumulate URL
 * e.g., "acc://example.acme/tokens" -> "example.acme"
 */
function extractPartition(url: string): string {
  if (!url) return 'unknown';

  // Remove acc:// prefix
  const withoutPrefix = url.replace(/^acc:\/\//, '');

  // Get the first path segment (the ADI or partition)
  const firstSlash = withoutPrefix.indexOf('/');
  if (firstSlash === -1) {
    return withoutPrefix;
  }

  return withoutPrefix.substring(0, firstSlash);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if all synthetic messages have been delivered
 */
export function areAllDelivered(messages: SyntheticMessage[]): boolean {
  return messages.every((m) => m.status === 'delivered' || m.status === 'confirmed');
}

/**
 * Check if any synthetic message failed
 */
export function hasFailures(messages: SyntheticMessage[]): boolean {
  return messages.some((m) => m.status === 'failed');
}

/**
 * Get messages pending delivery
 */
export function getPendingMessages(messages: SyntheticMessage[]): SyntheticMessage[] {
  return messages.filter((m) => m.status === 'pending' || m.status === 'unknown');
}

/**
 * Get messages for a specific destination
 */
export function getMessagesForDestination(
  messages: SyntheticMessage[],
  destination: string
): SyntheticMessage[] {
  const destPartition = extractPartition(destination);
  return messages.filter((m) => extractPartition(m.destination) === destPartition);
}

/**
 * Get the cause chain for a synthetic message
 * Returns an array of transaction hashes from the original cause to this message
 */
export function getCauseChain(message: SyntheticMessage, allMessages: SyntheticMessage[]): string[] {
  const chain: string[] = [message.hash];

  let current = message;
  while (current.cause) {
    chain.unshift(current.cause);
    const causedBy = allMessages.find((m) => m.hash === current.cause);
    if (!causedBy) break;
    current = causedBy;
  }

  return chain;
}

/**
 * Build a dependency graph of synthetic messages
 */
export function buildDependencyGraph(
  messages: SyntheticMessage[]
): Map<string, SyntheticMessage[]> {
  const graph = new Map<string, SyntheticMessage[]>();

  for (const msg of messages) {
    if (msg.cause) {
      const deps = graph.get(msg.cause) || [];
      deps.push(msg);
      graph.set(msg.cause, deps);
    }
  }

  return graph;
}

/**
 * Format a trace result as a human-readable string
 */
export function formatTraceResult(trace: TraceResult): string {
  const lines: string[] = [
    `Synthetic Message Trace`,
    `Status: ${trace.status}`,
    `Total: ${trace.summary.total} messages`,
    `  Delivered: ${trace.summary.delivered}`,
    `  Pending: ${trace.summary.pending}`,
    `  Failed: ${trace.summary.failed}`,
    '',
    'Messages by Type:',
  ];

  for (const [type, count] of Object.entries(trace.summary.byType)) {
    lines.push(`  ${type}: ${count}`);
  }

  if (trace.failedMessages.length > 0) {
    lines.push('', 'Failed Messages:');
    for (const msg of trace.failedMessages) {
      lines.push(`  ${msg.type}: ${msg.hash} (${msg.source} -> ${msg.destination})`);
    }
  }

  return lines.join('\n');
}
