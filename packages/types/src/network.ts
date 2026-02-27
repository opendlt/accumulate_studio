/**
 * Network Types - Network configuration and execution
 */

// =============================================================================
// Network Definitions
// =============================================================================

export type NetworkId = 'mainnet' | 'testnet' | 'devnet' | 'kermit' | 'local';

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  description: string;
  v2Endpoint: string;
  v3Endpoint: string;
  proxyEndpoint: string;
  faucetAvailable: boolean;
  explorerUrl?: string;
  readOnly?: boolean;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  mainnet: {
    id: 'mainnet',
    name: 'MainNet',
    description: 'Production network (view-only in Studio)',
    v2Endpoint: 'https://mainnet.accumulatenetwork.io/v2',
    v3Endpoint: 'https://mainnet.accumulatenetwork.io/v3',
    proxyEndpoint: '',
    faucetAvailable: false,
    explorerUrl: 'https://explorer.accumulatenetwork.io',
    readOnly: true,
  },
  testnet: {
    id: 'testnet',
    name: 'TestNet',
    description: 'Public test network',
    v2Endpoint: 'https://testnet.accumulatenetwork.io/v2',
    v3Endpoint: 'https://testnet.accumulatenetwork.io/v3',
    proxyEndpoint: '',
    faucetAvailable: true,
    explorerUrl: 'https://testnet.explorer.accumulatenetwork.io',
  },
  devnet: {
    id: 'devnet',
    name: 'DevNet',
    description: 'Development network',
    v2Endpoint: 'https://devnet.accumulatenetwork.io/v2',
    v3Endpoint: 'https://devnet.accumulatenetwork.io/v3',
    proxyEndpoint: '',
    faucetAvailable: true,
  },
  kermit: {
    id: 'kermit',
    name: 'Kermit (TestNet)',
    description: 'Kermit test network',
    v2Endpoint: 'https://kermit.accumulatenetwork.io/v2',
    v3Endpoint: 'https://kermit.accumulatenetwork.io/v3',
    proxyEndpoint: '',
    faucetAvailable: true,
  },
  local: {
    id: 'local',
    name: 'Local DevNet',
    description: 'Local development node',
    v2Endpoint: 'http://localhost:26660/v2',
    v3Endpoint: 'http://localhost:26660/v3',
    proxyEndpoint: '',
    faucetAvailable: true,
  },
};

// =============================================================================
// Transaction Status
// =============================================================================

export type TransactionStatus =
  | 'pending'
  | 'delivered'
  | 'confirmed'
  | 'failed'
  | 'unknown';

export interface TransactionResult {
  txHash: string;
  status: TransactionStatus;
  blockHeight?: number;
  timestamp?: string;
  error?: {
    code: string;
    message: string;
  };
  receipt?: TransactionReceipt;
  synthetics?: SyntheticMessage[];
}

// =============================================================================
// Receipt Verification
// =============================================================================

export interface MerkleProofEntry {
  hash: string;
  right: boolean;
}

export interface TransactionReceipt {
  txHash: string;
  localBlock: number;
  localTimestamp: string;
  majorBlock?: number;
  majorTimestamp?: string;
  proof: MerkleProofEntry[];
  anchorChain?: {
    start: string;
    end: string;
    anchor: string;
  };
  verified: boolean;
}

// =============================================================================
// Synthetic Messages
// =============================================================================

export type SyntheticMessageType =
  | 'SyntheticCreateIdentity'
  | 'SyntheticWriteData'
  | 'SyntheticDepositTokens'
  | 'SyntheticDepositCredits'
  | 'SyntheticBurnTokens'
  | 'SyntheticMirror'
  | 'SyntheticSequenced'
  | 'SyntheticAnchor';

export interface SyntheticMessage {
  type: SyntheticMessageType;
  hash: string;
  source: string;
  destination: string;
  status: TransactionStatus;
  cause?: string;
}

// =============================================================================
// State Diff
// =============================================================================

export interface AccountStateDiff {
  url: string;
  accountType: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  changes: StateDiffEntry[];
}

export interface StateDiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

// =============================================================================
// Oracle
// =============================================================================

export interface OraclePrice {
  price: number;
  timestamp: string;
}

// =============================================================================
// Network Status
// =============================================================================

export interface NetworkStatus {
  networkId: NetworkId;
  connected: boolean;
  lastBlock?: number;
  lastBlockTime?: string;
  oracle?: OraclePrice;
  error?: string;
}
