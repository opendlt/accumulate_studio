/**
 * Prerequisite Knowledge Graph
 * Declarative mapping of block types to required/produced protocol resources.
 * Powers the "Recipe Engine" that guides developers through correct sequencing.
 */

import type { BlockType } from './blocks';

// =============================================================================
// Resource Kinds (Protocol-level resources)
// =============================================================================

export type ResourceKind =
  | 'keypair'
  | 'lite-identity'
  | 'lite-token-account'
  | 'acme-balance'
  | 'credits'
  | 'adi'
  | 'key-book'
  | 'key-page'
  | 'adi-token-account'
  | 'adi-data-account'
  | 'token-issuer'
  | 'token-balance'
  | 'data-account'
  | 'signer';

// =============================================================================
// Resource Requirement
// =============================================================================

export type PrerequisiteSeverity = 'error' | 'warning';

export interface ResourceRequirement {
  /** The resource kind needed */
  resource: ResourceKind;
  /** How severe is the missing resource */
  severity: PrerequisiteSeverity;
  /** Human-readable label for the requirement */
  label: string;
  /** Block types that can produce this resource */
  satisfiedBy: BlockType[];
}

// =============================================================================
// Prerequisite Rule (per block type)
// =============================================================================

export interface PrerequisiteRule {
  /** Resources this block needs before it can execute */
  requires: ResourceRequirement[];
  /** Resources this block produces after execution */
  produces: ResourceKind[];
  /** Estimated credit cost for this block */
  creditCost: number;
  /** Human-readable explanation of what this block needs */
  explanation: string;
  /** Canonical ordered chain of blocks to go from nothing to ready */
  defaultRecipe: BlockType[];
}

// =============================================================================
// Prerequisite Graph
// =============================================================================

export const PREREQUISITE_GRAPH: Record<BlockType, PrerequisiteRule> = {
  // ── Utility Blocks ──────────────────────────────────────────────────────

  GenerateKeys: {
    requires: [],
    produces: ['keypair', 'lite-identity', 'lite-token-account'],
    creditCost: 0,
    explanation: 'Generates a new Ed25519 keypair. No prerequisites needed.',
    defaultRecipe: [],
  },

  Faucet: {
    requires: [
      {
        resource: 'lite-token-account',
        severity: 'error',
        label: 'Lite Token Account',
        satisfiedBy: ['GenerateKeys', 'CreateLiteTokenAccount'],
      },
    ],
    produces: ['acme-balance', 'token-balance'],
    creditCost: 0,
    explanation: 'Requests testnet ACME tokens. Needs a lite token account to receive funds.',
    defaultRecipe: ['GenerateKeys'],
  },

  WaitForBalance: {
    requires: [
      {
        resource: 'lite-token-account',
        severity: 'warning',
        label: 'Token Account',
        satisfiedBy: ['GenerateKeys', 'CreateLiteTokenAccount', 'CreateTokenAccount'],
      },
    ],
    produces: ['acme-balance'],
    creditCost: 0,
    explanation: 'Polls until a minimum token balance is reached.',
    defaultRecipe: ['GenerateKeys', 'Faucet'],
  },

  WaitForCredits: {
    requires: [
      {
        resource: 'lite-identity',
        severity: 'warning',
        label: 'Identity with Key Page',
        satisfiedBy: ['GenerateKeys', 'CreateLiteTokenAccount', 'CreateIdentity'],
      },
    ],
    produces: ['credits'],
    creditCost: 0,
    explanation: 'Polls until a minimum credit balance is reached.',
    defaultRecipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits'],
  },

  QueryAccount: {
    requires: [
      {
        resource: 'lite-token-account',
        severity: 'warning',
        label: 'Account to Query',
        satisfiedBy: ['GenerateKeys', 'CreateLiteTokenAccount'],
      },
    ],
    produces: [],
    creditCost: 0,
    explanation: 'Queries an account. Optionally set up a lite token account with funds to query.',
    defaultRecipe: ['GenerateKeys', 'Faucet'],
  },

  Comment: {
    requires: [],
    produces: [],
    creditCost: 0,
    explanation: 'A comment block. No prerequisites needed.',
    defaultRecipe: [],
  },

  // ── Account Creation ────────────────────────────────────────────────────

  CreateLiteTokenAccount: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair',
        satisfiedBy: ['GenerateKeys'],
      },
    ],
    produces: ['lite-identity', 'lite-token-account'],
    creditCost: 0,
    explanation: 'Creates a lite token account from a keypair.',
    defaultRecipe: ['GenerateKeys'],
  },

  // ── Credit Operations ───────────────────────────────────────────────────

  AddCredits: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'lite-token-account',
        severity: 'error',
        label: 'Lite Token Account (ACME Source)',
        satisfiedBy: ['GenerateKeys', 'CreateLiteTokenAccount'],
      },
      {
        resource: 'acme-balance',
        severity: 'error',
        label: 'ACME Token Balance',
        satisfiedBy: ['Faucet', 'SendTokens', 'WaitForBalance'],
      },
      {
        resource: 'lite-identity',
        severity: 'error',
        label: 'Lite Identity (Credit Recipient)',
        satisfiedBy: ['GenerateKeys', 'CreateLiteTokenAccount'],
      },
    ],
    produces: ['credits'],
    creditCost: 0,
    explanation:
      'Purchases credits with ACME tokens. Needs a funded lite token account (ACME source) and a lite identity or key page (credit recipient).',
    defaultRecipe: ['GenerateKeys', 'Faucet', 'WaitForBalance'],
  },

  TransferCredits: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'adi',
        severity: 'error',
        label: 'ADI (Same Domain)',
        satisfiedBy: ['CreateIdentity'],
      },
      {
        resource: 'key-page',
        severity: 'error',
        label: 'Destination Key Page',
        satisfiedBy: ['CreateIdentity', 'CreateKeyPage'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits on Source Key Page',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['credits'],
    creditCost: 1,
    explanation: 'Transfers credits between key pages within the same ADI. Requires an ADI with two key pages and credits on the source.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateKeyPage',
    ],
  },

  BurnCredits: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Burns credits permanently.',
    defaultRecipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits'],
  },

  // ── Identity Operations ─────────────────────────────────────────────────

  CreateIdentity: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['adi', 'key-book', 'key-page', 'signer'],
    creditCost: 2500,
    explanation:
      'Creates an ADI. Requires credits on your lite identity and a signing keypair.',
    defaultRecipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits'],
  },

  CreateKeyBook: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'adi',
        severity: 'error',
        label: 'ADI',
        satisfiedBy: ['CreateIdentity'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['key-book'],
    creditCost: 100,
    explanation: 'Creates a key book under an ADI.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits',
    ],
  },

  CreateKeyPage: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'key-book',
        severity: 'error',
        label: 'Key Book',
        satisfiedBy: ['CreateIdentity', 'CreateKeyBook'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['key-page'],
    creditCost: 100,
    explanation: 'Creates a key page in a key book.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits',
    ],
  },

  // ── Account Operations ──────────────────────────────────────────────────

  CreateTokenAccount: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'adi',
        severity: 'error',
        label: 'ADI',
        satisfiedBy: ['CreateIdentity'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['adi-token-account'],
    creditCost: 100,
    explanation: 'Creates a token account under an ADI.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits',
    ],
  },

  CreateDataAccount: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'adi',
        severity: 'error',
        label: 'ADI',
        satisfiedBy: ['CreateIdentity'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['adi-data-account', 'data-account'],
    creditCost: 100,
    explanation: 'Creates a data account under an ADI.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits',
    ],
  },

  CreateToken: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'adi',
        severity: 'error',
        label: 'ADI',
        satisfiedBy: ['CreateIdentity'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['token-issuer'],
    creditCost: 5000,
    explanation: 'Creates a custom token type under an ADI.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits',
    ],
  },

  // ── Token Operations ────────────────────────────────────────────────────

  SendTokens: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'token-balance',
        severity: 'error',
        label: 'Token Balance',
        satisfiedBy: ['Faucet', 'WaitForBalance', 'IssueTokens'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['token-balance'],
    creditCost: 1,
    explanation: 'Sends tokens between accounts. Needs a funded account, credits, and a signer.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'GenerateKeys',
    ],
  },

  IssueTokens: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'token-issuer',
        severity: 'error',
        label: 'Token Issuer',
        satisfiedBy: ['CreateToken'],
      },
      {
        resource: 'adi-token-account',
        severity: 'error',
        label: 'Token Account (Recipient)',
        satisfiedBy: ['CreateTokenAccount'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: ['token-balance'],
    creditCost: 1,
    explanation: 'Mints new tokens. Requires a token issuer account.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateToken',
      'CreateTokenAccount',
    ],
  },

  BurnTokens: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'token-issuer',
        severity: 'error',
        label: 'Token Issuer',
        satisfiedBy: ['CreateToken'],
      },
      {
        resource: 'adi-token-account',
        severity: 'error',
        label: 'Token Account',
        satisfiedBy: ['CreateTokenAccount'],
      },
      {
        resource: 'token-balance',
        severity: 'error',
        label: 'Minted Token Balance',
        satisfiedBy: ['IssueTokens'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Burns custom tokens permanently. Requires a token issuer, minted tokens, and credits.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateToken',
      'CreateTokenAccount', 'IssueTokens',
    ],
  },

  // ── Data Operations ─────────────────────────────────────────────────────

  WriteData: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'data-account',
        severity: 'error',
        label: 'Data Account',
        satisfiedBy: ['CreateDataAccount'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Writes data to a data account. Needs the account and credits.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateDataAccount',
    ],
  },

  WriteDataTo: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Writes data to a lite data account. Needs a keypair and credits.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'GenerateKeys',
    ],
  },

  // ── Key Management ──────────────────────────────────────────────────────

  UpdateKeyPage: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'key-page',
        severity: 'error',
        label: 'Key Page',
        satisfiedBy: ['CreateIdentity', 'CreateKeyPage'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Updates a key page (add/remove keys, set thresholds). Needs a second keypair to add.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'GenerateKeys',
    ],
  },

  UpdateKey: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Old Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'key-page',
        severity: 'error',
        label: 'Key Page',
        satisfiedBy: ['CreateIdentity', 'CreateKeyPage'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Replaces a key on a key page. Needs a second keypair for the new key.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'GenerateKeys',
    ],
  },

  LockAccount: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'adi',
        severity: 'error',
        label: 'Account to Lock',
        satisfiedBy: ['CreateIdentity'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Locks an account at a specific block height.',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits',
    ],
  },

  // ── Authority Operations ────────────────────────────────────────────────

  UpdateAccountAuth: {
    requires: [
      {
        resource: 'keypair',
        severity: 'error',
        label: 'Keypair (Signer)',
        satisfiedBy: ['GenerateKeys'],
      },
      {
        resource: 'adi-token-account',
        severity: 'error',
        label: 'ADI Account',
        satisfiedBy: ['CreateTokenAccount', 'CreateDataAccount'],
      },
      {
        resource: 'credits',
        severity: 'error',
        label: 'Credits',
        satisfiedBy: ['AddCredits', 'WaitForCredits'],
      },
    ],
    produces: [],
    creditCost: 1,
    explanation: 'Modifies an ADI account\'s authorities (enable/disable/add/remove). Requires an ADI account (token or data).',
    defaultRecipe: [
      'GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateTokenAccount',
    ],
  },
};
