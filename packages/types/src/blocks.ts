/**
 * Block Catalog - All operation primitives for the Accumulate Protocol
 * Based on the 33 transaction types from the unified SDKs
 */

// =============================================================================
// Block Categories
// =============================================================================

export type BlockCategory =
  | 'identity'
  | 'account'
  | 'token'
  | 'credit'
  | 'data'
  | 'key-management'
  | 'authority'
  | 'utility';

// =============================================================================
// Transaction Types (from Accumulate Protocol)
// =============================================================================

export type TransactionType =
  // Identity Operations
  | 'CreateIdentity'
  | 'CreateKeyBook'
  | 'CreateKeyPage'
  // Account Operations
  | 'CreateTokenAccount'
  | 'CreateDataAccount'
  | 'CreateToken'
  | 'CreateLiteTokenAccount'
  // Token Operations
  | 'SendTokens'
  | 'IssueTokens'
  | 'BurnTokens'
  // Credit Operations
  | 'AddCredits'
  | 'TransferCredits'
  | 'BurnCredits'
  // Data Operations
  | 'WriteData'
  | 'WriteDataTo'
  // Key Management
  | 'UpdateKeyPage'
  | 'UpdateKey'
  | 'LockAccount'
  // Authority Operations
  | 'UpdateAccountAuth';

// =============================================================================
// Utility Block Types (Non-Transaction)
// =============================================================================

export type UtilityBlockType =
  | 'Faucet'
  | 'QueryAccount'
  | 'WaitForBalance'
  | 'WaitForCredits'
  | 'GenerateKeys'
  | 'Comment';

// =============================================================================
// All Block Types
// =============================================================================

export type BlockType = TransactionType | UtilityBlockType;

// =============================================================================
// Block Input/Output Port Definitions
// =============================================================================

export interface PortDefinition {
  id: string;
  name: string;
  type: 'url' | 'string' | 'decimal' | 'int' | 'bool' | 'bytes' | 'keypair' | 'any';
  required: boolean;
  description?: string;
  default?: unknown;
}

// =============================================================================
// Block Configuration Schemas
// =============================================================================

export interface CreateIdentityConfig {
  url: string;
  keyBookUrl?: string;
  publicKeyHash: string;
  authorities?: string[];
}

export interface CreateKeyBookConfig {
  url: string;
  publicKeyHash?: string;
}

export interface CreateKeyPageConfig {
  url?: string;
  keys?: string[];
}

export interface CreateTokenAccountConfig {
  url: string;
  tokenUrl: string;
  authorities?: string[];
}

export interface CreateDataAccountConfig {
  url: string;
  authorities?: string[];
}

export interface CreateTokenConfig {
  url: string;
  symbol: string;
  precision: number;
  supplyLimit?: string;
  properties?: {
    hasLockingRule?: boolean;
  };
}

export interface SendTokensConfig {
  from?: string;
  to?: string;
  amount?: string;
  recipients?: Array<{
    url: string;
    amount: string;
  }>;
}

export interface IssueTokensConfig {
  recipient: string;
  amount: string;
}

export interface BurnTokensConfig {
  account?: string;
  tokenUrl?: string;
  amount: string;
}

export interface AddCreditsConfig {
  recipient: string;
  amount: string;
  oracle?: number;
}

export interface TransferCreditsConfig {
  from?: string;
  recipient: string;
  amount: number;
}

export interface BurnCreditsConfig {
  amount: number;
}

export interface WriteDataConfig {
  account?: string;
  entries: string[];
  scratch?: boolean;
  writeToState?: boolean;
}

export interface WriteDataToConfig {
  recipient?: string;
  entries: string[];
}

export interface UpdateKeyPageConfig {
  operations: Array<
    | { type: 'add'; key: string; delegate?: string }
    | { type: 'remove'; key: string }
    | { type: 'update'; oldKey: string; newKey: string }
    | { type: 'setThreshold'; threshold: number }
    | { type: 'updateAllowed'; allow?: string[]; deny?: string[] }
    | { type: 'setRejectThreshold'; threshold: number }
    | { type: 'setResponseThreshold'; threshold: number }
  >;
}

export interface UpdateKeyConfig {
  newKey: string;
  timestamp?: number;
}

export interface LockAccountConfig {
  account?: string;
  height: number;
}

export interface UpdateAccountAuthConfig {
  account?: string;  // account to modify (defaults to upstream tokenAccountUrl/dataAccountUrl)
  operations: Array<
    | { type: 'enable'; authority: string }
    | { type: 'disable'; authority: string }
    | { type: 'add'; authority: string }
    | { type: 'remove'; authority: string }
  >;
}

// Utility Block Configs
export interface FaucetConfig {
  account: string;
  times?: number;
}

export interface QueryAccountConfig {
  url: string;
}

export interface WaitForBalanceConfig {
  account: string;
  minBalance: string;
  maxAttempts?: number;
  delayMs?: number;
}

export interface WaitForCreditsConfig {
  account: string;
  minCredits: number;
  maxAttempts?: number;
  delayMs?: number;
}

export interface GenerateKeysConfig {
  algorithm?: 'Ed25519' | 'RCD1' | 'BTC' | 'ETH';
}

export interface CommentConfig {
  text: string;
}

// =============================================================================
// Union Type for All Configs
// =============================================================================

export type BlockConfig =
  | CreateIdentityConfig
  | CreateKeyBookConfig
  | CreateKeyPageConfig
  | CreateTokenAccountConfig
  | CreateDataAccountConfig
  | CreateTokenConfig
  | SendTokensConfig
  | IssueTokensConfig
  | BurnTokensConfig
  | AddCreditsConfig
  | TransferCreditsConfig
  | BurnCreditsConfig
  | WriteDataConfig
  | WriteDataToConfig
  | UpdateKeyPageConfig
  | UpdateKeyConfig
  | LockAccountConfig
  | UpdateAccountAuthConfig
  | FaucetConfig
  | QueryAccountConfig
  | WaitForBalanceConfig
  | WaitForCreditsConfig
  | GenerateKeysConfig
  | CommentConfig;

// =============================================================================
// Block Definition
// =============================================================================

export interface BlockDefinition {
  type: BlockType;
  category: BlockCategory;
  name: string;
  description: string;
  icon: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema: Record<string, unknown>;
  transactionType?: TransactionType;
  color: string;
}

// =============================================================================
// Block Catalog - All Available Blocks
// =============================================================================

export const BLOCK_CATALOG: Record<BlockType, BlockDefinition> = {
  // Identity Operations
  CreateIdentity: {
    type: 'CreateIdentity',
    category: 'identity',
    name: 'Create ADI',
    description: 'Create an Accumulate Digital Identity',
    icon: 'user-plus',
    color: '#8B5CF6',
    transactionType: 'CreateIdentity',
    inputs: [
      { id: 'principal', name: 'Principal', type: 'url', required: true, description: 'Lite account funding the ADI' },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true, description: 'Keypair for signing' },
    ],
    outputs: [
      { id: 'adiUrl', name: 'ADI URL', type: 'url', required: true },
      { id: 'keyBookUrl', name: 'Key Book URL', type: 'url', required: true },
      { id: 'keyPageUrl', name: 'Key Page URL', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'ADI URL (e.g., acc://my-identity.acme)' },
        keyBookUrl: { type: 'string', description: 'Key book URL (default: {adi}/book)' },
        publicKeyHash: { type: 'string', description: 'SHA256 hash of public key (auto-resolved from upstream if empty)' },
      },
      required: ['url'],
    },
  },

  CreateKeyBook: {
    type: 'CreateKeyBook',
    category: 'identity',
    name: 'Create Key Book',
    description: 'Create a key book under an ADI',
    icon: 'book',
    color: '#8B5CF6',
    transactionType: 'CreateKeyBook',
    inputs: [
      { id: 'principal', name: 'Principal', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'keyBookUrl', name: 'Key Book URL', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Key book URL' },
        publicKeyHash: { type: 'string', description: 'Initial key hash (auto-generated if empty)' },
      },
      required: ['url'],
    },
  },

  CreateKeyPage: {
    type: 'CreateKeyPage',
    category: 'identity',
    name: 'Create Key Page',
    description: 'Add a new key page to a key book',
    icon: 'file-key',
    color: '#8B5CF6',
    transactionType: 'CreateKeyPage',
    inputs: [
      { id: 'principal', name: 'Principal', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'keyPageUrl', name: 'Key Page URL', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'string' }, description: 'Initial key hashes (auto-generated if empty)' },
      },
      required: [],
    },
  },

  // Account Operations
  CreateTokenAccount: {
    type: 'CreateTokenAccount',
    category: 'account',
    name: 'Create Token Account',
    description: 'Create a token holding account under an ADI',
    icon: 'wallet',
    color: '#10B981',
    transactionType: 'CreateTokenAccount',
    inputs: [
      { id: 'principal', name: 'Principal', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'tokenAccountUrl', name: 'Token Account URL', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Token account URL' },
        tokenUrl: { type: 'string', description: 'Token type URL (default: acc://ACME)' },
      },
      required: ['url', 'tokenUrl'],
    },
  },

  CreateDataAccount: {
    type: 'CreateDataAccount',
    category: 'account',
    name: 'Create Data Account',
    description: 'Create a data storage account',
    icon: 'database',
    color: '#10B981',
    transactionType: 'CreateDataAccount',
    inputs: [
      { id: 'principal', name: 'Principal', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'dataAccountUrl', name: 'Data Account URL', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Data account URL' },
      },
      required: ['url'],
    },
  },

  CreateToken: {
    type: 'CreateToken',
    category: 'account',
    name: 'Create Token Issuer',
    description: 'Create a custom token type',
    icon: 'coins',
    color: '#10B981',
    transactionType: 'CreateToken',
    inputs: [
      { id: 'principal', name: 'Principal', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'tokenUrl', name: 'Token URL', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Token URL' },
        symbol: { type: 'string', description: 'Token symbol (e.g., MYT)' },
        precision: { type: 'number', description: 'Decimal precision (default: 8)' },
        supplyLimit: { type: 'string', description: 'Optional supply limit' },
      },
      required: ['url', 'symbol', 'precision'],
    },
  },

  CreateLiteTokenAccount: {
    type: 'CreateLiteTokenAccount',
    category: 'account',
    name: 'Create Lite Token Account',
    description: 'Create a lite token account (implicit from key)',
    icon: 'wallet-minimal',
    color: '#10B981',
    transactionType: 'CreateLiteTokenAccount',
    inputs: [
      { id: 'keypair', name: 'Keypair', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'liteIdentityUrl', name: 'Lite Identity URL', type: 'url', required: true },
      { id: 'liteTokenAccountUrl', name: 'Lite Token Account URL', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Token Operations
  SendTokens: {
    type: 'SendTokens',
    category: 'token',
    name: 'Send Tokens',
    description: 'Transfer tokens between accounts',
    icon: 'send',
    color: '#F59E0B',
    transactionType: 'SendTokens',
    inputs: [
      { id: 'principal', name: 'From Account', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source token account URL (defaults to lite token account from GenerateKeys)' },
        to: { type: 'string', description: 'Destination account URL (auto-resolved from upstream CreateTokenAccount if empty)' },
        amount: { type: 'string', description: 'Amount to send in whole tokens, e.g. "1.5" (defaults to 1)' },
        recipients: {
          type: 'array',
          description: 'Multiple recipients (advanced — overrides to/amount)',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              amount: { type: 'string' },
            },
          },
        },
      },
      required: [],
    },
  },

  IssueTokens: {
    type: 'IssueTokens',
    category: 'token',
    name: 'Issue Tokens',
    description: 'Mint new tokens (issuer only)',
    icon: 'badge-plus',
    color: '#F59E0B',
    transactionType: 'IssueTokens',
    inputs: [
      { id: 'principal', name: 'Token Issuer', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient token account' },
        amount: { type: 'string', description: 'Amount to issue' },
      },
      required: ['recipient', 'amount'],
    },
  },

  BurnTokens: {
    type: 'BurnTokens',
    category: 'token',
    name: 'Burn Tokens',
    description: 'Destroy tokens permanently',
    icon: 'flame',
    color: '#F59E0B',
    transactionType: 'BurnTokens',
    inputs: [
      { id: 'principal', name: 'Token Account', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Token account URL (auto-resolved from upstream)' },
        tokenUrl: { type: 'string', description: 'Token URL (e.g. acc://ACME or custom token URL)' },
        amount: { type: 'string', description: 'Amount to burn (e.g. 12 ACME)' },
      },
      required: ['amount'],
    },
  },

  // Credit Operations
  AddCredits: {
    type: 'AddCredits',
    category: 'credit',
    name: 'Add Credits',
    description: 'Purchase credits with ACME tokens',
    icon: 'credit-card',
    color: '#3B82F6',
    transactionType: 'AddCredits',
    inputs: [
      { id: 'principal', name: 'ACME Account', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Key page or lite identity to credit (auto-resolved from upstream if empty)' },
        amount: { type: 'string', description: 'ACME amount to spend (default: 5)' },
        oracle: { type: 'number', description: 'Oracle price (optional, auto-fetched)' },
      },
      required: [],
    },
  },

  TransferCredits: {
    type: 'TransferCredits',
    category: 'credit',
    name: 'Transfer Credits',
    description: 'Move credits between key pages',
    icon: 'arrow-right-left',
    color: '#3B82F6',
    transactionType: 'TransferCredits',
    inputs: [
      { id: 'principal', name: 'Source Key Page', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source key page (defaults to book/1)' },
        recipient: { type: 'string', description: 'Destination key page' },
        amount: { type: 'number', description: 'Credits to transfer' },
      },
      required: ['recipient', 'amount'],
    },
  },

  BurnCredits: {
    type: 'BurnCredits',
    category: 'credit',
    name: 'Burn Credits',
    description: 'Destroy credits permanently',
    icon: 'flame',
    color: '#3B82F6',
    transactionType: 'BurnCredits',
    inputs: [
      { id: 'principal', name: 'Key Page', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Credits to burn' },
      },
      required: ['amount'],
    },
  },

  // Data Operations
  WriteData: {
    type: 'WriteData',
    category: 'data',
    name: 'Write Data',
    description: 'Write data entries to account',
    icon: 'file-text',
    color: '#EC4899',
    transactionType: 'WriteData',
    inputs: [
      { id: 'principal', name: 'Data Account', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
      { id: 'entryHash', name: 'Entry Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Data account URL to write to (auto-resolved from upstream CreateDataAccount if empty)' },
        entries: { type: 'array', items: { type: 'string' }, description: 'Data entries (plain text strings, uses doubleHash encoding)' },
        scratch: { type: 'boolean', description: 'Use scratch space' },
        writeToState: { type: 'boolean', description: 'Write to account state' },
      },
      required: [],
    },
  },

  WriteDataTo: {
    type: 'WriteDataTo',
    category: 'data',
    name: 'Write Data To',
    description: 'Write data to a lite data account',
    icon: 'file-output',
    color: '#EC4899',
    transactionType: 'WriteDataTo',
    inputs: [
      { id: 'principal', name: 'Principal', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
      { id: 'recipient', name: 'Lite Data Account', type: 'url', required: false },
    ],
    configSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Lite data account URL (auto-computed from entries + keypair if omitted)' },
        entries: { type: 'array', items: { type: 'string' }, description: 'Data entries (plain text)' },
      },
      required: [],
    },
  },

  // Key Management
  UpdateKeyPage: {
    type: 'UpdateKeyPage',
    category: 'key-management',
    name: 'Update Key Page',
    description: 'Add/remove keys, set thresholds',
    icon: 'key-round',
    color: '#6366F1',
    transactionType: 'UpdateKeyPage',
    inputs: [
      { id: 'principal', name: 'Key Page', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['add', 'remove', 'update', 'setThreshold', 'updateAllowed', 'setRejectThreshold', 'setResponseThreshold'],
              },
              key: { type: 'string', description: 'Public key hash (hex)', visibleFor: ['add', 'remove'] },
              delegate: { type: 'string', description: 'Delegate authority URL', visibleFor: ['add'] },
              oldKey: { type: 'string', description: 'Old key hash', visibleFor: ['update'] },
              newKey: { type: 'string', description: 'New key hash', visibleFor: ['update'] },
              threshold: { type: 'number', description: 'Threshold value', visibleFor: ['setThreshold', 'setRejectThreshold', 'setResponseThreshold'] },
              allow: { type: 'string', description: 'Comma-separated tx types to allow', visibleFor: ['updateAllowed'] },
              deny: { type: 'string', description: 'Comma-separated tx types to deny', visibleFor: ['updateAllowed'] },
            },
          },
        },
      },
      required: [],
    },
  },

  UpdateKey: {
    type: 'UpdateKey',
    category: 'key-management',
    name: 'Update Key',
    description: 'Replace key on key page',
    icon: 'key',
    color: '#6366F1',
    transactionType: 'UpdateKey',
    inputs: [
      { id: 'principal', name: 'Key Page', type: 'url', required: true },
      { id: 'signer', name: 'Old Signer', type: 'keypair', required: true },
      { id: 'newKey', name: 'New Key', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        newKey: { type: 'string', description: 'New public key (hex) — hash is auto-computed' },
        timestamp: { type: 'number', description: 'Optional timestamp' },
      },
      required: ['newKey'],
    },
  },

  LockAccount: {
    type: 'LockAccount',
    category: 'key-management',
    name: 'Lock Account',
    description: 'Lock lite token account until major block height',
    icon: 'lock',
    color: '#6366F1',
    transactionType: 'LockAccount',
    inputs: [
      { id: 'principal', name: 'Account', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Lite token account URL to lock (auto-resolved from upstream)' },
        height: { type: 'number', description: 'Major block height to lock until' },
      },
      required: ['height'],
    },
  },

  // Authority Operations
  UpdateAccountAuth: {
    type: 'UpdateAccountAuth',
    category: 'authority',
    name: 'Update Account Auth',
    description: 'Modify account authorities',
    icon: 'shield',
    color: '#EF4444',
    transactionType: 'UpdateAccountAuth',
    inputs: [
      { id: 'principal', name: 'Account', type: 'url', required: true },
      { id: 'signer', name: 'Signer', type: 'keypair', required: true },
    ],
    outputs: [
      { id: 'txHash', name: 'Transaction Hash', type: 'string', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Account to modify (auto-resolved from upstream)' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['add', 'remove', 'enable', 'disable'] },
              authority: { type: 'string', description: 'Authority URL (key book)' },
            },
          },
        },
      },
      required: [],
    },
  },

  // Utility Blocks
  Faucet: {
    type: 'Faucet',
    category: 'utility',
    name: 'Faucet',
    description: 'Request testnet tokens',
    icon: 'droplets',
    color: '#64748B',
    inputs: [
      { id: 'account', name: 'Account', type: 'url', required: true },
    ],
    outputs: [
      { id: 'success', name: 'Success', type: 'bool', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Lite token account to fund (auto-resolved from upstream if empty)' },
        times: { type: 'number', description: 'Number of faucet calls (default: 2)' },
      },
      required: [],
    },
  },

  QueryAccount: {
    type: 'QueryAccount',
    category: 'utility',
    name: 'Query Account',
    description: 'Get account state',
    icon: 'search',
    color: '#64748B',
    inputs: [
      { id: 'url', name: 'URL', type: 'url', required: true },
    ],
    outputs: [
      { id: 'account', name: 'Account Data', type: 'any', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Account URL to query' },
      },
      required: ['url'],
    },
  },

  WaitForBalance: {
    type: 'WaitForBalance',
    category: 'utility',
    name: 'Wait for Balance',
    description: 'Poll until minimum balance reached',
    icon: 'clock',
    color: '#64748B',
    inputs: [
      { id: 'account', name: 'Account', type: 'url', required: true },
    ],
    outputs: [
      { id: 'balance', name: 'Balance', type: 'decimal', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Token account to check (auto-resolved from upstream if empty)' },
        minBalance: { type: 'string', description: 'Minimum balance to wait for (default: 0.01 ACME)' },
        maxAttempts: { type: 'number', description: 'Max polling attempts (default: 30)' },
        delayMs: { type: 'number', description: 'Delay between attempts (default: 2000)' },
      },
      required: [],
    },
  },

  WaitForCredits: {
    type: 'WaitForCredits',
    category: 'utility',
    name: 'Wait for Credits',
    description: 'Poll until credit balance reached',
    icon: 'clock',
    color: '#64748B',
    inputs: [
      { id: 'account', name: 'Account', type: 'url', required: true },
    ],
    outputs: [
      { id: 'credits', name: 'Credits', type: 'int', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Key page or lite identity to check (auto-resolved from upstream if empty)' },
        minCredits: { type: 'number', description: 'Minimum credits to wait for (default: 100)' },
        maxAttempts: { type: 'number', description: 'Max polling attempts (default: 30)' },
        delayMs: { type: 'number', description: 'Delay between attempts (default: 2000)' },
      },
      required: [],
    },
  },

  GenerateKeys: {
    type: 'GenerateKeys',
    category: 'utility',
    name: 'Generate Keys',
    description: 'Create keypair for signing',
    icon: 'key-round',
    color: '#64748B',
    inputs: [],
    outputs: [
      { id: 'keypair', name: 'Keypair', type: 'keypair', required: true },
      { id: 'publicKey', name: 'Public Key', type: 'bytes', required: true },
      { id: 'publicKeyHash', name: 'Public Key Hash', type: 'string', required: true },
      { id: 'liteIdentity', name: 'Lite Identity', type: 'url', required: true },
      { id: 'liteTokenAccount', name: 'Lite Token Account', type: 'url', required: true },
    ],
    configSchema: {
      type: 'object',
      properties: {
        algorithm: { type: 'string', enum: ['Ed25519', 'RCD1', 'BTC', 'ETH'], default: 'Ed25519' },
      },
    },
  },

  Comment: {
    type: 'Comment',
    category: 'utility',
    name: 'Comment',
    description: 'Add a comment to the flow',
    icon: 'message-square',
    color: '#94A3B8',
    inputs: [],
    outputs: [],
    configSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Comment text' },
      },
      required: ['text'],
    },
  },
};

// =============================================================================
// Category Metadata
// =============================================================================

export const CATEGORY_METADATA: Record<BlockCategory, { name: string; icon: string; color: string }> = {
  identity: { name: 'Identity', icon: 'user', color: '#8B5CF6' },
  account: { name: 'Accounts', icon: 'wallet', color: '#10B981' },
  token: { name: 'Tokens', icon: 'coins', color: '#F59E0B' },
  credit: { name: 'Credits', icon: 'credit-card', color: '#3B82F6' },
  data: { name: 'Data', icon: 'database', color: '#EC4899' },
  'key-management': { name: 'Key Management', icon: 'key', color: '#6366F1' },
  authority: { name: 'Authority', icon: 'shield', color: '#EF4444' },
  utility: { name: 'Utility', icon: 'wrench', color: '#64748B' },
};

// =============================================================================
// Helper Functions
// =============================================================================

export function getBlocksByCategory(category: BlockCategory): BlockDefinition[] {
  return Object.values(BLOCK_CATALOG).filter((block) => block.category === category);
}

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return BLOCK_CATALOG[type];
}

export function isTransactionBlock(type: BlockType): type is TransactionType {
  const block = BLOCK_CATALOG[type];
  return block?.transactionType !== undefined;
}
