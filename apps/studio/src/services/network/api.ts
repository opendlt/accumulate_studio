/**
 * Accumulate API - Low-level API methods for Accumulate network
 */

import type {
  NetworkConfig,
  TransactionResult,
  TransactionReceipt,
  TransactionStatus,
} from '@accumulate-studio/types';

// =============================================================================
// API Types
// =============================================================================

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AccountInfo {
  type: string;
  url: string;
  balance?: string;
  creditBalance?: number;
  tokenUrl?: string;
  authorities?: string[];
  data?: Record<string, unknown>;
}

export interface FaucetResponse {
  success: boolean;
  txHash?: string;
  simpleHash?: string;
}

export interface SubmitResponse {
  txHash: string;
  simpleHash: string;
  envelope?: {
    status: string;
  };
}

// =============================================================================
// Accumulate API
// =============================================================================

export class AccumulateAPI {
  private config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  /**
   * Get the SDK proxy endpoint URL
   */
  private get proxyEndpoint(): string {
    return (
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SDK_PROXY_URL) ||
      this.config.proxyEndpoint ||
      ''
    );
  }

  /**
   * Call the SDK proxy service
   */
  async callProxy<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.proxyEndpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Proxy error ${response.status}: ${text}`);
    }
    return response.json();
  }

  /**
   * Call the SDK proxy service with GET
   */
  async callProxyGet<T = unknown>(path: string): Promise<T> {
    const response = await fetch(`${this.proxyEndpoint}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Query account state
   */
  async query(url: string): Promise<APIResponse<AccountInfo>> {
    try {
      const response = await this.callV2('query', { url });

      if (response.error) {
        return {
          success: false,
          error: {
            code: String(response.error.code),
            message: response.error.message,
          },
        };
      }

      const data = response.result?.data || response.result;

      return {
        success: true,
        data: {
          type: data?.type || 'unknown',
          url: data?.url || url,
          balance: data?.balance,
          creditBalance: data?.creditBalance,
          tokenUrl: data?.tokenUrl,
          authorities: data?.authorities,
          data: data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to query account',
        },
      };
    }
  }

  /**
   * Request testnet tokens from faucet
   */
  async faucet(account: string): Promise<APIResponse<FaucetResponse>> {
    if (!this.config.faucetAvailable) {
      return {
        success: false,
        error: {
          code: 'FAUCET_UNAVAILABLE',
          message: `Faucet is not available on ${this.config.name}`,
        },
      };
    }

    try {
      const response = await this.callV2('faucet', { url: account });

      if (response.error) {
        // Include detailed error info for debugging
        const detail = response.error.data
          ? ` (${JSON.stringify(response.error.data)})`
          : '';
        return {
          success: false,
          error: {
            code: String(response.error.code),
            message: `${response.error.message}${detail} [account=${account}]`,
          },
        };
      }

      return {
        success: true,
        data: {
          success: true,
          txHash: response.result?.txid,
          simpleHash: response.result?.simpleHash,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to call faucet',
        },
      };
    }
  }

  /**
   * Submit a transaction envelope
   */
  async submit(envelope: object): Promise<APIResponse<SubmitResponse>> {
    try {
      const response = await this.callV2('execute', { envelope });

      if (response.error) {
        return {
          success: false,
          error: {
            code: String(response.error.code),
            message: response.error.message,
            details: response.error.data,
          },
        };
      }

      const result = response.result;

      return {
        success: true,
        data: {
          txHash: result?.txid,
          simpleHash: result?.simpleHash,
          envelope: {
            status: result?.status?.delivered ? 'delivered' : 'pending',
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to submit transaction',
        },
      };
    }
  }

  /**
   * Get transaction status
   */
  async getTxStatus(txHash: string): Promise<APIResponse<TransactionResult>> {
    try {
      const response = await this.callV2('query-tx', { txid: txHash, wait: false });

      if (response.error) {
        return {
          success: false,
          error: {
            code: String(response.error.code),
            message: response.error.message,
          },
        };
      }

      const result = response.result;
      const status = this.parseTransactionStatus(result?.status);

      return {
        success: true,
        data: {
          txHash,
          status,
          blockHeight: result?.status?.blockHeight,
          timestamp: result?.status?.timestamp,
          error: result?.status?.error ? {
            code: String(result.status.error.code),
            message: result.status.error.message,
          } : undefined,
          synthetics: result?.synthetics?.map((s: Record<string, unknown>) => ({
            type: s.type,
            hash: s.hash,
            source: s.source,
            destination: s.destination,
            status: this.parseTransactionStatus(s.status),
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get transaction status',
        },
      };
    }
  }

  /**
   * Get transaction receipt (with proof)
   */
  async getReceipt(txHash: string): Promise<APIResponse<TransactionReceipt>> {
    try {
      const response = await this.callV2('query-tx', {
        txid: txHash,
        wait: true,
        prove: true,
      });

      if (response.error) {
        return {
          success: false,
          error: {
            code: String(response.error.code),
            message: response.error.message,
          },
        };
      }

      const result = response.result;
      const receipt = result?.receipt || result?.status?.receipt;

      if (!receipt) {
        return {
          success: false,
          error: {
            code: 'NO_RECEIPT',
            message: 'Receipt not yet available',
          },
        };
      }

      return {
        success: true,
        data: {
          txHash,
          localBlock: receipt.localBlock,
          localTimestamp: receipt.localTimestamp,
          majorBlock: receipt.majorBlock,
          majorTimestamp: receipt.majorTimestamp,
          proof: receipt.proof || [],
          anchorChain: receipt.anchorChain,
          verified: !!receipt.anchor,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get receipt',
        },
      };
    }
  }

  /**
   * Wait for transaction to be delivered
   */
  async waitForTransaction(
    txHash: string,
    maxAttempts = 30,
    delayMs = 2000
  ): Promise<APIResponse<TransactionResult>> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await this.getTxStatus(txHash);

      if (!result.success) {
        return result;
      }

      if (result.data) {
        const { status } = result.data;
        if (status === 'delivered' || status === 'confirmed' || status === 'failed') {
          return result;
        }
      }

      // Wait before next attempt
      await this.delay(delayMs);
    }

    return {
      success: false,
      error: {
        code: 'TIMEOUT',
        message: `Transaction not confirmed after ${maxAttempts} attempts`,
      },
    };
  }

  /**
   * Query multiple accounts in batch
   */
  async queryBatch(urls: string[]): Promise<Map<string, APIResponse<AccountInfo>>> {
    const results = new Map<string, APIResponse<AccountInfo>>();

    // Execute queries in parallel with concurrency limit
    const concurrencyLimit = 5;
    for (let i = 0; i < urls.length; i += concurrencyLimit) {
      const batch = urls.slice(i, i + concurrencyLimit);
      const promises = batch.map((url) => this.query(url));
      const batchResults = await Promise.all(promises);

      batch.forEach((url, index) => {
        results.set(url, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * Get directory entries for an ADI
   */
  async queryDirectory(
    url: string,
    start = 0,
    count = 100
  ): Promise<APIResponse<{ total: number; entries: string[] }>> {
    try {
      const response = await this.callV2('query-directory', {
        url,
        start,
        count,
        expandChains: false,
      });

      if (response.error) {
        return {
          success: false,
          error: {
            code: String(response.error.code),
            message: response.error.message,
          },
        };
      }

      return {
        success: true,
        data: {
          total: response.result?.total || 0,
          entries: response.result?.entries || [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to query directory',
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private async callV2(
    method: string,
    params: Record<string, unknown>
  ): Promise<{
    result?: Record<string, unknown>;
    error?: { code: number; message: string; data?: unknown };
  }> {
    const response = await fetch(this.config.v2Endpoint, {
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

  private parseTransactionStatus(
    status: Record<string, unknown> | undefined
  ): TransactionStatus {
    if (!status) return 'unknown';

    if (status.failed) return 'failed';
    if (status.confirmed || status.received) return 'confirmed';
    if (status.delivered) return 'delivered';
    if (status.pending) return 'pending';

    return 'unknown';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
