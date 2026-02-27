/**
 * Network Tools
 * MCP tools for network management and status
 */

import {
  NetworkId,
  NetworkConfig,
  NETWORKS,
  NetworkStatus,
} from '@accumulate-studio/types';

import {
  OperationCategory,
  ToolResponse,
  successResponse,
  errorResponse,
  errorFromException,
  requirePermission,
  getPermissionMode,
} from '../permissions.js';

// =============================================================================
// State
// =============================================================================

let currentNetwork: NetworkId = 'testnet';
let networkStatus: NetworkStatus | null = null;

// =============================================================================
// Tool: net.list
// =============================================================================

export interface NetListArgs {
  // No arguments needed
}

export interface NetListResult {
  networks: Array<{
    id: NetworkId;
    name: string;
    description: string;
    faucetAvailable: boolean;
    readOnly: boolean;
    isCurrent: boolean;
  }>;
  current: NetworkId;
}

/**
 * List all available networks
 */
export async function netList(_args: NetListArgs): Promise<ToolResponse<NetListResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const networks = Object.values(NETWORKS).map((network) => ({
      id: network.id,
      name: network.name,
      description: network.description,
      faucetAvailable: network.faucetAvailable,
      readOnly: network.readOnly ?? false,
      isCurrent: network.id === currentNetwork,
    }));

    return successResponse({
      networks,
      current: currentNetwork,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * net.list tool definition
 */
export const netListTool = {
  name: 'net.list',
  description: 'List all available Accumulate networks and their configurations',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  handler: netList,
};

// =============================================================================
// Tool: net.select
// =============================================================================

export interface NetSelectArgs {
  network: NetworkId;
}

export interface NetSelectResult {
  previous: NetworkId;
  current: NetworkId;
  config: NetworkConfig;
  status: NetworkStatus | null;
}

/**
 * Select and connect to a network
 */
export async function netSelect(args: NetSelectArgs): Promise<ToolResponse<NetSelectResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const { network } = args;

    // Validate network ID
    if (!NETWORKS[network]) {
      return errorResponse([
        {
          code: 'INVALID_NETWORK',
          message: `Unknown network: ${network}`,
          details: {
            validNetworks: Object.keys(NETWORKS),
          },
        },
      ]);
    }

    const previous = currentNetwork;
    currentNetwork = network;

    // Attempt to get network status
    const warnings: string[] = [];
    try {
      networkStatus = await fetchNetworkStatus(network);
    } catch (error) {
      networkStatus = {
        networkId: network,
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
      warnings.push(`Failed to connect to ${network}: ${networkStatus.error}`);
    }

    const config = NETWORKS[network];

    // Warn if network is read-only
    if (config.readOnly && getPermissionMode() !== 'READ_ONLY') {
      warnings.push(
        `Network '${network}' is read-only. Transaction submission is disabled.`
      );
    }

    return successResponse(
      {
        previous,
        current: network,
        config,
        status: networkStatus,
      },
      warnings
    );
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * net.select tool definition
 */
export const netSelectTool = {
  name: 'net.select',
  description: 'Select and connect to an Accumulate network',
  inputSchema: {
    type: 'object' as const,
    properties: {
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to connect to',
      },
    },
    required: ['network'],
  },
  handler: netSelect,
};

// =============================================================================
// Tool: net.status
// =============================================================================

export interface NetStatusArgs {
  network?: NetworkId;
  refresh?: boolean;
}

export interface NetStatusResult {
  network: NetworkId;
  status: NetworkStatus;
  config: NetworkConfig;
}

/**
 * Get network health and status
 */
export async function netStatus(args: NetStatusArgs): Promise<ToolResponse<NetStatusResult>> {
  try {
    requirePermission(OperationCategory.READ);

    const network = args.network ?? currentNetwork;
    const refresh = args.refresh ?? false;

    // Validate network ID
    if (!NETWORKS[network]) {
      return errorResponse([
        {
          code: 'INVALID_NETWORK',
          message: `Unknown network: ${network}`,
          details: {
            validNetworks: Object.keys(NETWORKS),
          },
        },
      ]);
    }

    // Get or refresh status
    let status: NetworkStatus;
    if (refresh || !networkStatus || networkStatus.networkId !== network) {
      try {
        status = await fetchNetworkStatus(network);
        if (network === currentNetwork) {
          networkStatus = status;
        }
      } catch (error) {
        status = {
          networkId: network,
          connected: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      status = networkStatus;
    }

    return successResponse({
      network,
      status,
      config: NETWORKS[network],
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * net.status tool definition
 */
export const netStatusTool = {
  name: 'net.status',
  description: 'Get network health and status information',
  inputSchema: {
    type: 'object' as const,
    properties: {
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to check (defaults to current)',
      },
      refresh: {
        type: 'boolean' as const,
        description: 'Force refresh status (default: false)',
      },
    },
    required: [] as string[],
  },
  handler: netStatus,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Fetch network status from the network
 */
async function fetchNetworkStatus(networkId: NetworkId): Promise<NetworkStatus> {
  const config = NETWORKS[networkId];

  try {
    // Try v3 endpoint first for network status
    const response = await fetch(`${config.v3Endpoint}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      networkId,
      connected: true,
      lastBlock: data.lastBlock?.height,
      lastBlockTime: data.lastBlock?.time,
      oracle: data.oracle
        ? {
            price: data.oracle.price,
            timestamp: data.oracle.timestamp,
          }
        : undefined,
    };
  } catch (error) {
    // Try a simpler health check using v2 endpoint
    try {
      const v2Response = await fetch(`${config.v2Endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'version',
          params: {},
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (v2Response.ok) {
        return {
          networkId,
          connected: true,
        };
      }
    } catch {
      // Both endpoints failed
    }

    return {
      networkId,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Current Network Accessor
// =============================================================================

/**
 * Get the currently selected network
 */
export function getCurrentNetwork(): NetworkId {
  return currentNetwork;
}

/**
 * Get the current network configuration
 */
export function getCurrentNetworkConfig(): NetworkConfig {
  return NETWORKS[currentNetwork];
}

// =============================================================================
// Export all tools
// =============================================================================

export const networkTools = [netListTool, netSelectTool, netStatusTool];
