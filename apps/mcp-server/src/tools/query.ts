/**
 * Query Tools
 * MCP tools for querying Accumulate accounts and chains
 */

import { NETWORKS, NetworkId } from '@accumulate-studio/types';

import {
  OperationCategory,
  ToolResponse,
  successResponse,
  errorResponse,
  errorFromException,
  requirePermission,
} from '../permissions.js';

import { getCurrentNetwork, getCurrentNetworkConfig } from './network.js';

// =============================================================================
// Types
// =============================================================================

export interface AccountData {
  url: string;
  type: string;
  data: Record<string, unknown>;
  chains?: string[];
  directory?: string[];
}

export interface ChainEntry {
  index: number;
  entry: string;
  hash: string;
}

export interface TokenBalance {
  url: string;
  tokenUrl: string;
  balance: string;
  symbol: string;
  precision: number;
  formattedBalance: string;
}

// =============================================================================
// Tool: acc.query
// =============================================================================

export interface AccQueryArgs {
  url: string;
  expand?: boolean;
  network?: NetworkId;
}

export interface AccQueryResult {
  account: AccountData;
  network: NetworkId;
}

/**
 * Query any Accumulate account
 */
export async function accQuery(args: AccQueryArgs): Promise<ToolResponse<AccQueryResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const { url, expand = false, network } = args;

    // Validate URL format
    if (!url || !url.startsWith('acc://')) {
      return errorResponse([
        {
          code: 'INVALID_URL',
          message: 'URL must start with acc://',
          details: { providedUrl: url },
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

    // Query the account using v2 JSON-RPC
    const response = await fetch(config.v2Endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query',
        params: {
          url,
          expand,
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

    const accountData: AccountData = {
      url: result.result.data?.url ?? url,
      type: result.result.type ?? 'unknown',
      data: result.result.data ?? {},
      chains: result.result.chains,
      directory: result.result.directory,
    };

    return successResponse({
      account: accountData,
      network: targetNetwork,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * acc.query tool definition
 */
export const accQueryTool = {
  name: 'acc.query',
  description: 'Query any Accumulate account by URL',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string' as const,
        description: 'Account URL (e.g., acc://myadi.acme/tokens)',
      },
      expand: {
        type: 'boolean' as const,
        description: 'Include expanded data (chains, directory entries)',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to query (defaults to current)',
      },
    },
    required: ['url'],
  },
  handler: accQuery,
};

// =============================================================================
// Tool: acc.get_chain
// =============================================================================

export interface AccGetChainArgs {
  url: string;
  chain: string;
  start?: number;
  count?: number;
  expand?: boolean;
  network?: NetworkId;
}

export interface AccGetChainResult {
  url: string;
  chain: string;
  entries: ChainEntry[];
  total: number;
  start: number;
  count: number;
  network: NetworkId;
}

/**
 * Get chain entries from an account
 */
export async function accGetChain(args: AccGetChainArgs): Promise<ToolResponse<AccGetChainResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const { url, chain, start = 0, count = 10, expand = false, network } = args;

    // Validate URL format
    if (!url || !url.startsWith('acc://')) {
      return errorResponse([
        {
          code: 'INVALID_URL',
          message: 'URL must start with acc://',
          details: { providedUrl: url },
        },
      ]);
    }

    // Validate count
    if (count < 1 || count > 100) {
      return errorResponse([
        {
          code: 'INVALID_COUNT',
          message: 'Count must be between 1 and 100',
          details: { providedCount: count },
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

    // Query chain entries using v2 JSON-RPC
    const response = await fetch(config.v2Endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query-chain',
        params: {
          url,
          chain,
          start,
          count,
          expand,
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

    const entries: ChainEntry[] = (result.result.items ?? []).map(
      (item: Record<string, unknown>, index: number) => ({
        index: start + index,
        entry: item.entry ?? item.data ?? '',
        hash: item.hash ?? '',
      })
    );

    return successResponse({
      url,
      chain,
      entries,
      total: result.result.total ?? entries.length,
      start,
      count: entries.length,
      network: targetNetwork,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * acc.get_chain tool definition
 */
export const accGetChainTool = {
  name: 'acc.get_chain',
  description: 'Get chain entries from an Accumulate account',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string' as const,
        description: 'Account URL',
      },
      chain: {
        type: 'string' as const,
        description: 'Chain name (e.g., main, pending, signature)',
      },
      start: {
        type: 'number' as const,
        description: 'Start index (default: 0)',
      },
      count: {
        type: 'number' as const,
        description: 'Number of entries to fetch (default: 10, max: 100)',
      },
      expand: {
        type: 'boolean' as const,
        description: 'Include full entry data',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to query (defaults to current)',
      },
    },
    required: ['url', 'chain'],
  },
  handler: accGetChain,
};

// =============================================================================
// Tool: acc.get_balance
// =============================================================================

export interface AccGetBalanceArgs {
  url: string;
  network?: NetworkId;
}

export interface AccGetBalanceResult {
  balance: TokenBalance;
  network: NetworkId;
}

/**
 * Get token balance for a token account
 */
export async function accGetBalance(args: AccGetBalanceArgs): Promise<ToolResponse<AccGetBalanceResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const { url, network } = args;

    // Validate URL format
    if (!url || !url.startsWith('acc://')) {
      return errorResponse([
        {
          code: 'INVALID_URL',
          message: 'URL must start with acc://',
          details: { providedUrl: url },
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

    // Query the token account
    const response = await fetch(config.v2Endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'query',
        params: {
          url,
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

    const data = result.result.data ?? {};
    const accountType = result.result.type;

    // Check if this is a token account
    if (accountType !== 'tokenAccount' && accountType !== 'liteTokenAccount') {
      return errorResponse([
        {
          code: 'NOT_TOKEN_ACCOUNT',
          message: `Account is not a token account (type: ${accountType})`,
          details: { actualType: accountType },
        },
      ]);
    }

    // Get token metadata
    const tokenUrl = data.tokenUrl ?? 'acc://ACME';
    let symbol = 'ACME';
    let precision = 8;

    // Try to fetch token metadata
    if (tokenUrl !== 'acc://ACME') {
      try {
        const tokenResponse = await fetch(config.v2Endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'query',
            params: { url: tokenUrl },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (tokenResponse.ok) {
          const tokenResult = await tokenResponse.json();
          if (!tokenResult.error && tokenResult.result?.data) {
            symbol = tokenResult.result.data.symbol ?? 'UNKNOWN';
            precision = tokenResult.result.data.precision ?? 8;
          }
        }
      } catch {
        // Use defaults if token metadata fetch fails
      }
    }

    const balance = data.balance?.toString() ?? '0';
    const balanceNum = BigInt(balance);
    const divisor = BigInt(10 ** precision);
    const wholePart = balanceNum / divisor;
    const fractionalPart = balanceNum % divisor;
    const formattedBalance = `${wholePart}.${fractionalPart.toString().padStart(precision, '0')}`.replace(/\.?0+$/, '');

    const tokenBalance: TokenBalance = {
      url,
      tokenUrl,
      balance,
      symbol,
      precision,
      formattedBalance: `${formattedBalance || '0'} ${symbol}`,
    };

    return successResponse({
      balance: tokenBalance,
      network: targetNetwork,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * acc.get_balance tool definition
 */
export const accGetBalanceTool = {
  name: 'acc.get_balance',
  description: 'Get token balance for a token account',
  inputSchema: {
    type: 'object' as const,
    properties: {
      url: {
        type: 'string' as const,
        description: 'Token account URL',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to query (defaults to current)',
      },
    },
    required: ['url'],
  },
  handler: accGetBalance,
};

// =============================================================================
// Export all tools
// =============================================================================

export const queryTools = [accQueryTool, accGetChainTool, accGetBalanceTool];
