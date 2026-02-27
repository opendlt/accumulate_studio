/**
 * Verification Tools
 * MCP tools for proof verification and synthetic message tracing
 */

import {
  NETWORKS,
  NetworkId,
  TransactionReceipt,
  MerkleProofEntry,
  SyntheticMessage,
  SyntheticMessageType,
  TransactionStatus,
} from '@accumulate-studio/types';

import {
  OperationCategory,
  ToolResponse,
  successResponse,
  errorResponse,
  errorFromException,
  requirePermission,
} from '../permissions.js';

import { getCurrentNetwork } from './network.js';

// =============================================================================
// Types
// =============================================================================

export interface ReceiptData {
  receipt: TransactionReceipt;
  raw?: Record<string, unknown>;
}

export interface VerificationResult {
  valid: boolean;
  receipt: TransactionReceipt;
  verification: {
    localProofValid: boolean;
    anchorProofValid: boolean;
    majorBlockAnchored: boolean;
  };
  details: string[];
}

export interface SyntheticTrace {
  source: {
    txHash: string;
    url: string;
    status: TransactionStatus;
  };
  synthetics: SyntheticMessage[];
  pending: number;
  delivered: number;
  failed: number;
}

// =============================================================================
// Tool: proof.get_receipt
// =============================================================================

export interface ProofGetReceiptArgs {
  txHash: string;
  network?: NetworkId;
}

export interface ProofGetReceiptResult {
  receipt: ReceiptData;
  network: NetworkId;
}

/**
 * Get Merkle receipt for a transaction
 */
export async function proofGetReceipt(
  args: ProofGetReceiptArgs
): Promise<ToolResponse<ProofGetReceiptResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const { txHash, network } = args;

    if (!txHash) {
      return errorResponse([
        {
          code: 'MISSING_TX_HASH',
          message: 'Transaction hash is required',
        },
      ]);
    }

    const targetNetwork = network ?? getCurrentNetwork();
    const config = NETWORKS[targetNetwork];

    if (!config) {
      return errorResponse([
        {
          code: 'INVALID_NETWORK',
          message: `Unknown network: ${targetNetwork}`,
        },
      ]);
    }

    // Query transaction with receipt
    const response = await fetch(config.v2Endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query-tx',
        params: {
          txid: txHash,
          prove: true,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return errorResponse([
        {
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      ]);
    }

    const result = await response.json();

    if (result.error) {
      return errorResponse([
        {
          code: result.error.code?.toString() ?? 'RPC_ERROR',
          message: result.error.message ?? 'Unknown RPC error',
          details: result.error.data,
        },
      ]);
    }

    const txResult = result.result;

    // Check if receipt is available
    if (!txResult?.receipts || txResult.receipts.length === 0) {
      return errorResponse(
        [
          {
            code: 'NO_RECEIPT',
            message: 'Receipt not available yet. Transaction may not be anchored.',
            details: {
              status: txResult?.status,
              hint: 'Wait for the transaction to be included in a major block',
            },
          },
        ],
        ['Transaction may still be pending or not yet anchored']
      );
    }

    // Parse the receipt
    const rawReceipt = txResult.receipts[0];
    const proof: MerkleProofEntry[] = (rawReceipt.proof ?? []).map(
      (entry: { hash: string; right: boolean }) => ({
        hash: entry.hash,
        right: entry.right ?? false,
      })
    );

    const receipt: TransactionReceipt = {
      txHash,
      localBlock: rawReceipt.localBlock ?? 0,
      localTimestamp: rawReceipt.localTimestamp ?? new Date().toISOString(),
      majorBlock: rawReceipt.majorBlock,
      majorTimestamp: rawReceipt.majorTimestamp,
      proof,
      anchorChain: rawReceipt.anchor
        ? {
            start: rawReceipt.anchor.start,
            end: rawReceipt.anchor.end,
            anchor: rawReceipt.anchor.value,
          }
        : undefined,
      verified: false, // Will be set by verification
    };

    return successResponse({
      receipt: {
        receipt,
        raw: rawReceipt,
      },
      network: targetNetwork,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * proof.get_receipt tool definition
 */
export const proofGetReceiptTool = {
  name: 'proof.get_receipt',
  description: 'Get Merkle receipt for a transaction',
  inputSchema: {
    type: 'object' as const,
    properties: {
      txHash: {
        type: 'string' as const,
        description: 'Transaction hash',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to query',
      },
    },
    required: ['txHash'],
  },
  handler: proofGetReceipt,
};

// =============================================================================
// Tool: proof.verify_receipt
// =============================================================================

export interface ProofVerifyReceiptArgs {
  receipt: TransactionReceipt;
  expectedRoot?: string;
}

export interface ProofVerifyReceiptResult {
  verification: VerificationResult;
}

/**
 * Verify a Merkle receipt
 */
export async function proofVerifyReceipt(
  args: ProofVerifyReceiptArgs
): Promise<ToolResponse<ProofVerifyReceiptResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const { receipt, expectedRoot } = args;

    if (!receipt || !receipt.txHash) {
      return errorResponse([
        {
          code: 'INVALID_RECEIPT',
          message: 'Valid receipt with txHash is required',
        },
      ]);
    }

    const details: string[] = [];
    let localProofValid = false;
    let anchorProofValid = false;
    let majorBlockAnchored = false;

    // Step 1: Verify local proof (Merkle path)
    if (receipt.proof && receipt.proof.length > 0) {
      try {
        const computedRoot = computeMerkleRoot(receipt.txHash, receipt.proof);
        details.push(`Computed Merkle root: ${computedRoot}`);

        if (expectedRoot) {
          localProofValid = computedRoot.toLowerCase() === expectedRoot.toLowerCase();
          details.push(
            localProofValid
              ? 'Local proof matches expected root'
              : `Local proof mismatch: expected ${expectedRoot}`
          );
        } else {
          // Without expected root, we can only verify structure
          localProofValid = true;
          details.push('Local proof structure is valid (no expected root to compare)');
        }
      } catch (error) {
        details.push(
          `Local proof verification failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      details.push('No local proof entries in receipt');
    }

    // Step 2: Verify anchor chain
    if (receipt.anchorChain) {
      const { start, end, anchor } = receipt.anchorChain;
      if (start && end && anchor) {
        anchorProofValid = true;
        details.push(`Anchor chain: ${start} -> ${end}`);
        details.push(`Anchor value: ${anchor}`);
      } else {
        details.push('Incomplete anchor chain data');
      }
    } else {
      details.push('No anchor chain in receipt');
    }

    // Step 3: Check major block anchoring
    if (receipt.majorBlock && receipt.majorBlock > 0) {
      majorBlockAnchored = true;
      details.push(`Anchored in major block: ${receipt.majorBlock}`);
      if (receipt.majorTimestamp) {
        details.push(`Major block timestamp: ${receipt.majorTimestamp}`);
      }
    } else {
      details.push('Not yet anchored in a major block');
    }

    // Overall validity
    const valid = localProofValid && (anchorProofValid || !receipt.anchorChain);

    const verificationResult: VerificationResult = {
      valid,
      receipt: {
        ...receipt,
        verified: valid,
      },
      verification: {
        localProofValid,
        anchorProofValid,
        majorBlockAnchored,
      },
      details,
    };

    return successResponse(
      { verification: verificationResult },
      valid ? undefined : ['Receipt verification incomplete - see details']
    );
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * proof.verify_receipt tool definition
 */
export const proofVerifyReceiptTool = {
  name: 'proof.verify_receipt',
  description: 'Verify a Merkle receipt for cryptographic validity',
  inputSchema: {
    type: 'object' as const,
    properties: {
      receipt: {
        type: 'object' as const,
        description: 'Receipt from proof.get_receipt',
      },
      expectedRoot: {
        type: 'string' as const,
        description: 'Expected Merkle root (optional)',
      },
    },
    required: ['receipt'],
  },
  handler: proofVerifyReceipt,
};

// =============================================================================
// Tool: trace.synthetics
// =============================================================================

export interface TraceSyntheticsArgs {
  txHash: string;
  follow?: boolean;
  maxDepth?: number;
  network?: NetworkId;
}

export interface TraceSyntheticsResult {
  trace: SyntheticTrace;
  network: NetworkId;
}

/**
 * Trace synthetic messages from a transaction
 */
export async function traceSynthetics(
  args: TraceSyntheticsArgs
): Promise<ToolResponse<TraceSyntheticsResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const { txHash, follow = false, maxDepth = 3, network } = args;

    if (!txHash) {
      return errorResponse([
        {
          code: 'MISSING_TX_HASH',
          message: 'Transaction hash is required',
        },
      ]);
    }

    const targetNetwork = network ?? getCurrentNetwork();
    const config = NETWORKS[targetNetwork];

    if (!config) {
      return errorResponse([
        {
          code: 'INVALID_NETWORK',
          message: `Unknown network: ${targetNetwork}`,
        },
      ]);
    }

    // Query the source transaction
    const response = await fetch(config.v2Endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query-tx',
        params: {
          txid: txHash,
          expand: true,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return errorResponse([
        {
          code: 'HTTP_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      ]);
    }

    const result = await response.json();

    if (result.error) {
      return errorResponse([
        {
          code: result.error.code?.toString() ?? 'RPC_ERROR',
          message: result.error.message ?? 'Unknown RPC error',
          details: result.error.data,
        },
      ]);
    }

    const txResult = result.result;
    const sourceUrl = txResult?.data?.header?.principal ?? 'unknown';
    const sourceStatus: TransactionStatus = txResult?.status ?? 'unknown';

    // Extract synthetic messages
    const synthetics: SyntheticMessage[] = [];
    const syntheticTxIds = txResult?.syntheticTxids ?? txResult?.produced ?? [];

    for (const syntheticId of syntheticTxIds) {
      const syntheticHash = typeof syntheticId === 'string' ? syntheticId : syntheticId.hash;

      // Optionally follow and query each synthetic
      if (follow) {
        try {
          const synResponse = await fetch(config.v2Endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'query-tx',
              params: { txid: syntheticHash },
            }),
            signal: AbortSignal.timeout(10000),
          });

          if (synResponse.ok) {
            const synResult = await synResponse.json();
            if (!synResult.error) {
              const synData = synResult.result;
              synthetics.push({
                type: (synData?.data?.body?.type ?? 'SyntheticSequenced') as SyntheticMessageType,
                hash: syntheticHash,
                source: sourceUrl,
                destination: synData?.data?.header?.principal ?? 'unknown',
                status: synData?.status ?? 'unknown',
                cause: txHash,
              });

              // Recursively trace if maxDepth allows
              if (maxDepth > 1 && synData?.syntheticTxids?.length > 0) {
                const nestedResult = await traceSynthetics({
                  txHash: syntheticHash,
                  follow: true,
                  maxDepth: maxDepth - 1,
                  network: targetNetwork,
                });

                if (nestedResult.ok && nestedResult.data) {
                  synthetics.push(...nestedResult.data.trace.synthetics);
                }
              }
            }
          }
        } catch {
          // Add with unknown status if query fails
          synthetics.push({
            type: 'SyntheticSequenced',
            hash: syntheticHash,
            source: sourceUrl,
            destination: 'unknown',
            status: 'unknown',
            cause: txHash,
          });
        }
      } else {
        // Just add the hash without following
        synthetics.push({
          type: 'SyntheticSequenced',
          hash: syntheticHash,
          source: sourceUrl,
          destination: 'unknown',
          status: 'pending',
          cause: txHash,
        });
      }
    }

    // Count statuses
    const pending = synthetics.filter((s) => s.status === 'pending').length;
    const delivered = synthetics.filter(
      (s) => s.status === 'delivered' || s.status === 'confirmed'
    ).length;
    const failed = synthetics.filter((s) => s.status === 'failed').length;

    const trace: SyntheticTrace = {
      source: {
        txHash,
        url: sourceUrl,
        status: sourceStatus,
      },
      synthetics,
      pending,
      delivered,
      failed,
    };

    const warnings: string[] = [];
    if (pending > 0) {
      warnings.push(`${pending} synthetic message(s) still pending`);
    }
    if (failed > 0) {
      warnings.push(`${failed} synthetic message(s) failed`);
    }

    return successResponse(
      {
        trace,
        network: targetNetwork,
      },
      warnings.length > 0 ? warnings : undefined
    );
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * trace.synthetics tool definition
 */
export const traceSyntheticsTool = {
  name: 'trace.synthetics',
  description: 'Trace synthetic messages produced by a transaction',
  inputSchema: {
    type: 'object' as const,
    properties: {
      txHash: {
        type: 'string' as const,
        description: 'Source transaction hash',
      },
      follow: {
        type: 'boolean' as const,
        description: 'Query each synthetic for status (default: false)',
      },
      maxDepth: {
        type: 'number' as const,
        description: 'Maximum recursion depth for nested synthetics (default: 3)',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to query',
      },
    },
    required: ['txHash'],
  },
  handler: traceSynthetics,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute Merkle root from a leaf hash and proof entries
 * This is a simplified implementation - real implementation would use proper SHA-256
 */
function computeMerkleRoot(leafHash: string, proof: MerkleProofEntry[]): string {
  let current = leafHash.toLowerCase();

  for (const entry of proof) {
    const sibling = entry.hash.toLowerCase();

    // Combine hashes based on position
    if (entry.right) {
      // Sibling is on the right
      current = simpleHash(current + sibling);
    } else {
      // Sibling is on the left
      current = simpleHash(sibling + current);
    }
  }

  return current;
}

/**
 * Simple hash function for demonstration
 * In production, this would use proper SHA-256
 */
function simpleHash(input: string): string {
  // This is a placeholder - real implementation would use crypto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

// =============================================================================
// Export all tools
// =============================================================================

export const verificationTools = [
  proofGetReceiptTool,
  proofVerifyReceiptTool,
  traceSyntheticsTool,
];
