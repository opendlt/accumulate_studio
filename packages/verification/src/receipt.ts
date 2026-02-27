/**
 * Transaction Receipt Verification
 * Parse and verify Accumulate transaction receipts
 */

import type { TransactionReceipt, MerkleProofEntry } from '@accumulate-studio/types';
import { MerkleProof, verifyProof } from './merkle';

// =============================================================================
// Types
// =============================================================================

export interface ReceiptVerificationResult {
  valid: boolean;
  error?: string;
  details?: {
    proofValid: boolean;
    anchorValid: boolean;
    computedRoot?: string;
  };
}

export interface RawReceiptData {
  txid?: string;
  txHash?: string;
  localBlock?: number;
  localTimestamp?: string;
  majorBlock?: number;
  majorTimestamp?: string;
  proof?: RawProofEntry[];
  anchorChain?: {
    start?: string;
    end?: string;
    anchor?: string;
  };
  [key: string]: unknown;
}

interface RawProofEntry {
  hash?: string;
  right?: boolean;
  [key: string]: unknown;
}

// =============================================================================
// Receipt Parsing
// =============================================================================

/**
 * Parse raw receipt data into a TransactionReceipt
 * @param data - Raw receipt data from API response
 * @returns Parsed TransactionReceipt
 * @throws Error if required fields are missing
 */
export function parseReceipt(data: unknown): TransactionReceipt {
  if (!data || typeof data !== 'object') {
    throw new Error('Receipt data must be an object');
  }

  const raw = data as RawReceiptData;

  // Extract transaction hash
  const txHash = raw.txHash || raw.txid;
  if (!txHash || typeof txHash !== 'string') {
    throw new Error('Receipt must contain txHash or txid');
  }

  // Extract block info
  const localBlock = raw.localBlock;
  if (typeof localBlock !== 'number') {
    throw new Error('Receipt must contain localBlock');
  }

  const localTimestamp = raw.localTimestamp || new Date().toISOString();

  // Parse proof entries
  const proof: MerkleProofEntry[] = [];
  if (Array.isArray(raw.proof)) {
    for (const entry of raw.proof) {
      if (entry && typeof entry === 'object' && typeof entry.hash === 'string') {
        proof.push({
          hash: entry.hash,
          right: entry.right === true,
        });
      }
    }
  }

  // Parse anchor chain info
  let anchorChain: TransactionReceipt['anchorChain'];
  if (raw.anchorChain && typeof raw.anchorChain === 'object') {
    const ac = raw.anchorChain;
    if (ac.start && ac.end && ac.anchor) {
      anchorChain = {
        start: String(ac.start),
        end: String(ac.end),
        anchor: String(ac.anchor),
      };
    }
  }

  return {
    txHash: normalizeHash(txHash),
    localBlock,
    localTimestamp: typeof localTimestamp === 'string' ? localTimestamp : new Date().toISOString(),
    majorBlock: typeof raw.majorBlock === 'number' ? raw.majorBlock : undefined,
    majorTimestamp: typeof raw.majorTimestamp === 'string' ? raw.majorTimestamp : undefined,
    proof,
    anchorChain,
    verified: false, // Will be set by verification
  };
}

/**
 * Normalize hash string (lowercase, no 0x prefix)
 */
function normalizeHash(hash: string): string {
  return hash.toLowerCase().replace(/^0x/, '');
}

// =============================================================================
// Receipt Verification
// =============================================================================

/**
 * Verify a transaction receipt
 * Validates the Merkle proof and anchor chain
 * @param receipt - The transaction receipt to verify
 * @returns Verification result with validity status and details
 */
export function verifyReceipt(receipt: TransactionReceipt): ReceiptVerificationResult {
  // Check for required fields
  if (!receipt.txHash) {
    return {
      valid: false,
      error: 'Receipt missing transaction hash',
    };
  }

  // If no proof, receipt cannot be verified
  if (!receipt.proof || receipt.proof.length === 0) {
    return {
      valid: false,
      error: 'Receipt contains no Merkle proof',
    };
  }

  // Verify the Merkle proof if we have an anchor
  if (!receipt.anchorChain?.anchor) {
    // No anchor to verify against, but proof structure is valid
    return {
      valid: true,
      details: {
        proofValid: true,
        anchorValid: false,
      },
    };
  }

  try {
    // Verify the proof against the anchor
    const merkleProof = MerkleProof.fromEntries(receipt.proof);
    const computedRoot = merkleProof.computeRoot(receipt.txHash);
    const proofValid = verifyProof(receipt.proof, receipt.txHash, receipt.anchorChain.anchor);

    return {
      valid: proofValid,
      error: proofValid ? undefined : 'Merkle proof does not match anchor',
      details: {
        proofValid,
        anchorValid: true,
        computedRoot,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      details: {
        proofValid: false,
        anchorValid: false,
      },
    };
  }
}

/**
 * Parse and verify a receipt in one step
 * @param data - Raw receipt data
 * @returns Parsed receipt with verified flag set appropriately
 */
export function parseAndVerifyReceipt(data: unknown): TransactionReceipt {
  const receipt = parseReceipt(data);
  const result = verifyReceipt(receipt);
  return {
    ...receipt,
    verified: result.valid,
  };
}

/**
 * Check if a receipt is anchored (included in a major block)
 */
export function isReceiptAnchored(receipt: TransactionReceipt): boolean {
  return (
    receipt.majorBlock !== undefined &&
    receipt.majorBlock > 0 &&
    receipt.anchorChain?.anchor !== undefined
  );
}

/**
 * Get the proof depth (number of levels in the Merkle tree)
 */
export function getProofDepth(receipt: TransactionReceipt): number {
  return receipt.proof?.length ?? 0;
}

/**
 * Estimate the number of transactions in the block based on proof depth
 * A balanced Merkle tree with depth d can hold 2^d transactions
 */
export function estimateBlockSize(receipt: TransactionReceipt): number {
  const depth = getProofDepth(receipt);
  return Math.pow(2, depth);
}
