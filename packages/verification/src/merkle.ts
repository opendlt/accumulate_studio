/**
 * Merkle Proof Verification
 * Implements Merkle tree proof verification using SHA256
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { MerkleProofEntry } from '@accumulate-studio/types';

// =============================================================================
// MerkleProof Class
// =============================================================================

/**
 * MerkleProof handles Merkle tree proof verification for Accumulate transactions
 */
export class MerkleProof {
  private entries: MerkleProofEntry[];

  constructor(entries: MerkleProofEntry[] = []) {
    this.entries = entries;
  }

  /**
   * Get the proof entries
   */
  getEntries(): MerkleProofEntry[] {
    return [...this.entries];
  }

  /**
   * Add a proof entry
   */
  addEntry(hash: string, right: boolean): void {
    this.entries.push({ hash, right });
  }

  /**
   * Compute the Merkle root from the proof entries and a leaf hash
   * @param txHash - The transaction hash (leaf node)
   * @returns The computed Merkle root
   */
  computeRoot(txHash: string): string {
    return computeRoot(this.entries, txHash);
  }

  /**
   * Verify that the proof produces the expected root
   * @param txHash - The transaction hash (leaf node)
   * @param expectedRoot - The expected Merkle root
   * @returns True if the proof is valid
   */
  verify(txHash: string, expectedRoot: string): boolean {
    return verifyProof(this.entries, txHash, expectedRoot);
  }

  /**
   * Create a MerkleProof from an array of entries
   */
  static fromEntries(entries: MerkleProofEntry[]): MerkleProof {
    return new MerkleProof(entries);
  }

  /**
   * Serialize to JSON
   */
  toJSON(): MerkleProofEntry[] {
    return this.entries;
  }
}

// =============================================================================
// Standalone Functions
// =============================================================================

/**
 * Combine two hashes using SHA256
 * The order is determined by the 'right' flag in the proof
 */
function combineHashes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return sha256(combined);
}

/**
 * Normalize a hash string (remove 0x prefix if present, lowercase)
 */
function normalizeHash(hash: string): string {
  return hash.toLowerCase().replace(/^0x/, '');
}

/**
 * Compute the Merkle root from proof entries and a transaction hash
 * @param entries - Array of Merkle proof entries
 * @param txHash - The transaction hash (leaf node)
 * @returns The computed Merkle root as a hex string
 */
export function computeRoot(entries: MerkleProofEntry[], txHash: string): string {
  // Start with the transaction hash as the current node
  let currentHash = hexToBytes(normalizeHash(txHash));

  // Walk up the tree using the proof entries
  for (const entry of entries) {
    const siblingHash = hexToBytes(normalizeHash(entry.hash));

    if (entry.right) {
      // Sibling is on the right, so current is on the left
      currentHash = combineHashes(currentHash, siblingHash);
    } else {
      // Sibling is on the left, so current is on the right
      currentHash = combineHashes(siblingHash, currentHash);
    }
  }

  return bytesToHex(currentHash);
}

/**
 * Verify a Merkle proof
 * @param proof - Array of Merkle proof entries
 * @param txHash - The transaction hash (leaf node)
 * @param expectedRoot - The expected Merkle root
 * @returns True if the computed root matches the expected root
 */
export function verifyProof(
  proof: MerkleProofEntry[],
  txHash: string,
  expectedRoot: string
): boolean {
  const computedRoot = computeRoot(proof, txHash);
  return computedRoot.toLowerCase() === normalizeHash(expectedRoot);
}

/**
 * Hash data using SHA256
 * @param data - Data to hash (string or bytes)
 * @returns Hex-encoded hash
 */
export function sha256Hash(data: string | Uint8Array): string {
  if (typeof data === 'string') {
    // If it looks like hex, convert to bytes first
    if (/^(0x)?[0-9a-fA-F]+$/.test(data)) {
      const normalized = normalizeHash(data);
      return bytesToHex(sha256(hexToBytes(normalized)));
    }
    // Otherwise, hash as UTF-8 string
    return bytesToHex(sha256(new TextEncoder().encode(data)));
  }
  return bytesToHex(sha256(data));
}

/**
 * Create a leaf hash for a Merkle tree
 * Accumulate uses double SHA256 for leaf hashes
 */
export function createLeafHash(data: string | Uint8Array): string {
  const firstHash = sha256(
    typeof data === 'string'
      ? /^(0x)?[0-9a-fA-F]+$/.test(data)
        ? hexToBytes(normalizeHash(data))
        : new TextEncoder().encode(data)
      : data
  );
  return bytesToHex(sha256(firstHash));
}
