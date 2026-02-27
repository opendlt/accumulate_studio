/**
 * Network Service - Connect to Accumulate networks
 */

import type {
  NetworkId,
  NetworkConfig,
  NetworkStatus,
  OraclePrice,
} from '@accumulate-studio/types';
import { NETWORKS } from '@accumulate-studio/types';

// =============================================================================
// Network Service
// =============================================================================

export class NetworkService {
  private currentNetwork: NetworkConfig | null = null;
  private status: NetworkStatus | null = null;
  private statusCheckInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(status: NetworkStatus) => void> = new Set();

  /**
   * Connect to a network
   */
  async connect(networkId: NetworkId): Promise<NetworkStatus> {
    const config = NETWORKS[networkId];
    if (!config) {
      throw new Error(`Unknown network: ${networkId}`);
    }

    this.currentNetwork = config;

    // Initialize status
    this.status = {
      networkId,
      connected: false,
    };

    try {
      // Test connection by fetching network status (v3 — v2 is unsupported on Kermit)
      const response = await this.fetchApi('v3', 'network-status', {});

      if (response && !response.error) {
        this.status = {
          networkId,
          connected: true,
          lastBlock: response.result?.directoryHeight ?? response.result?.majorBlockHeight,
          lastBlockTime: response.result?.majorBlockTime,
        };

        // Fetch oracle price
        try {
          const oracle = await this.getOraclePrice();
          this.status.oracle = oracle;
        } catch {
          // Oracle fetch is optional
        }

        // Start periodic status checks
        this.startStatusCheck();
      } else {
        this.status.error = response?.error?.message || 'Failed to connect';
      }
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Connection failed';
    }

    this.notifyListeners();
    return this.status;
  }

  /**
   * Disconnect from current network
   */
  disconnect(): void {
    this.stopStatusCheck();
    this.currentNetwork = null;
    this.status = null;
    this.notifyListeners();
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus | null {
    return this.status;
  }

  /**
   * Get current network configuration
   */
  getNetworkConfig(): NetworkConfig | null {
    return this.currentNetwork;
  }

  /**
   * Get oracle price
   */
  async getOraclePrice(): Promise<OraclePrice> {
    if (!this.currentNetwork) {
      throw new Error('Not connected to any network');
    }

    const response = await this.fetchApi('v2', 'oracle', {});

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch oracle price');
    }

    return {
      price: response.result?.price || 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: NetworkStatus) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Make API request to current network
   */
  async fetchApi(
    version: 'v2' | 'v3',
    method: string,
    params: Record<string, unknown>
  ): Promise<{
    result?: Record<string, unknown>;
    error?: { code: number; message: string };
  }> {
    if (!this.currentNetwork) {
      throw new Error('Not connected to any network');
    }

    const endpoint = version === 'v2'
      ? this.currentNetwork.v2Endpoint
      : this.currentNetwork.v3Endpoint;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return response.json();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private startStatusCheck(): void {
    this.stopStatusCheck();

    // Check status every 30 seconds
    this.statusCheckInterval = setInterval(async () => {
      if (!this.currentNetwork || !this.status) return;

      try {
        const response = await this.fetchApi('v3', 'network-status', {});

        if (response && !response.error) {
          this.status = {
            ...this.status,
            connected: true,
            lastBlock: (response.result?.directoryHeight ?? response.result?.majorBlockHeight) as number | undefined,
            lastBlockTime: response.result?.majorBlockTime as string | undefined,
            error: undefined,
          };
        }
      } catch (error) {
        if (this.status) {
          this.status.connected = false;
          this.status.error = error instanceof Error ? error.message : 'Connection lost';
        }
      }

      this.notifyListeners();
    }, 30000);
  }

  private stopStatusCheck(): void {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
      this.statusCheckInterval = null;
    }
  }

  private notifyListeners(): void {
    if (this.status) {
      for (const listener of this.listeners) {
        listener(this.status);
      }
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const networkService = new NetworkService();

// =============================================================================
// Re-exports
// =============================================================================

export { AccumulateAPI } from './api';
