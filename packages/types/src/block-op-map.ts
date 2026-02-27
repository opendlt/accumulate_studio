/**
 * BlockType <-> Operation ID canonical mapping
 *
 * Bidirectional mapping between Studio's PascalCase BlockType
 * and manifest snake_case operation IDs.
 */

import type { BlockType } from './blocks';

// =============================================================================
// BlockType → op ID mapping
// =============================================================================

export const BLOCK_TO_OP: Record<BlockType, string> = {
  GenerateKeys: 'generate_keys',
  Faucet: 'faucet',
  WaitForBalance: 'wait_for_balance',
  WaitForCredits: 'wait_for_credits',
  AddCredits: 'add_credits',
  CreateIdentity: 'create_identity',
  CreateKeyBook: 'create_key_book',
  CreateKeyPage: 'create_key_page',
  CreateTokenAccount: 'create_token_account',
  CreateDataAccount: 'create_data_account',
  CreateToken: 'create_token',
  CreateLiteTokenAccount: 'create_lite_token_account',
  SendTokens: 'send_tokens',
  IssueTokens: 'issue_tokens',
  BurnTokens: 'burn_tokens',
  TransferCredits: 'transfer_credits',
  BurnCredits: 'burn_credits',
  WriteData: 'write_data',
  WriteDataTo: 'write_data_to',
  UpdateKeyPage: 'update_key_page',
  UpdateKey: 'update_key',
  LockAccount: 'lock_account',
  UpdateAccountAuth: 'update_account_auth',
  QueryAccount: 'query_account',
  Comment: 'comment',
};

// =============================================================================
// op ID → BlockType mapping (reverse)
// =============================================================================

export const OP_TO_BLOCK: Record<string, BlockType> = Object.fromEntries(
  Object.entries(BLOCK_TO_OP).map(([k, v]) => [v, k as BlockType])
) as Record<string, BlockType>;

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Convert a BlockType to its canonical snake_case operation ID
 */
export function blockTypeToOp(bt: BlockType): string {
  return BLOCK_TO_OP[bt];
}

/**
 * Convert a snake_case operation ID to its BlockType, if it exists
 */
export function opToBlockType(op: string): BlockType | undefined {
  return OP_TO_BLOCK[op];
}
