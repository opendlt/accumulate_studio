/**
 * Transaction Tools
 * MCP tools for building, validating, and submitting transactions
 */

import {
  NETWORKS,
  NetworkId,
  TransactionStatus,
  TransactionResult,
} from '@accumulate-studio/types';

import {
  OperationCategory,
  ToolResponse,
  successResponse,
  errorResponse,
  errorFromException,
  requirePermission,
  getPermissionMode,
  PermissionMode,
} from '../permissions.js';

import { getCurrentNetwork, getCurrentNetworkConfig } from './network.js';

// =============================================================================
// Types
// =============================================================================

export interface TransactionBody {
  type: string;
  payload: Record<string, unknown>;
}

export interface BuiltTransaction {
  body: TransactionBody;
  header: {
    principal: string;
    initiator?: string;
    memo?: string;
    metadata?: Record<string, unknown>;
  };
  hash?: string;
  estimatedCredits?: number;
}

export interface CreditEstimate {
  baseCredits: number;
  dataCredits: number;
  totalCredits: number;
  breakdown: {
    description: string;
    credits: number;
  }[];
}

export interface PrerequisiteCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface SubmitResult {
  txHash: string;
  status: TransactionStatus;
  message: string;
}

// =============================================================================
// Tool: tx.build
// =============================================================================

export interface TxBuildArgs {
  type: string;
  principal: string;
  payload: Record<string, unknown>;
  initiator?: string;
  memo?: string;
  metadata?: Record<string, unknown>;
}

export interface TxBuildResult {
  transaction: BuiltTransaction;
  encodedBody?: string;
  warnings: string[];
}

/**
 * Build a transaction body
 */
export async function txBuild(args: TxBuildArgs): Promise<ToolResponse<TxBuildResult>> {
  try {
    requirePermission(OperationCategory.BUILD);

    const { type, principal, payload, initiator, memo, metadata } = args;

    // Validate principal URL
    if (!principal || !principal.startsWith('acc://')) {
      return errorResponse([
        {
          code: 'INVALID_PRINCIPAL',
          message: 'Principal must be a valid Accumulate URL starting with acc://',
        },
      ]);
    }

    // Validate transaction type
    const validTypes = [
      'createIdentity',
      'createTokenAccount',
      'createDataAccount',
      'createKeyBook',
      'createKeyPage',
      'createToken',
      'issueTokens',
      'burnTokens',
      'sendTokens',
      'addCredits',
      'updateKeyPage',
      'updateAccountAuth',
      'writeData',
      'writeDataTo',
      'lockAccount',
      'acmeFaucet',
    ];

    if (!validTypes.includes(type)) {
      return errorResponse([
        {
          code: 'INVALID_TRANSACTION_TYPE',
          message: `Unknown transaction type: ${type}`,
          details: { validTypes },
        },
      ]);
    }

    const warnings: string[] = [];

    // Validate payload based on type
    const payloadValidation = validatePayload(type, payload);
    if (payloadValidation.errors.length > 0) {
      return errorResponse(
        payloadValidation.errors.map((e) => ({
          code: 'INVALID_PAYLOAD',
          message: e,
        }))
      );
    }
    warnings.push(...payloadValidation.warnings);

    // Build the transaction
    const transaction: BuiltTransaction = {
      body: {
        type,
        payload,
      },
      header: {
        principal,
        initiator,
        memo,
        metadata,
      },
    };

    // Calculate a rough hash (in real implementation this would be proper hashing)
    transaction.hash = `pending-${Date.now().toString(16)}`;

    // Estimate credits
    transaction.estimatedCredits = estimateCreditsForType(type, payload);

    // Encode the body (simplified)
    const encodedBody = Buffer.from(JSON.stringify(transaction.body)).toString('base64');

    return successResponse(
      {
        transaction,
        encodedBody,
        warnings,
      },
      warnings
    );
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * tx.build tool definition
 */
export const txBuildTool = {
  name: 'tx.build',
  description: 'Build a transaction body for Accumulate',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string' as const,
        description: 'Transaction type (e.g., sendTokens, createIdentity, addCredits)',
      },
      principal: {
        type: 'string' as const,
        description: 'Principal account URL that will execute this transaction',
      },
      payload: {
        type: 'object' as const,
        description: 'Transaction-specific payload data',
      },
      initiator: {
        type: 'string' as const,
        description: 'Initiator URL (defaults to principal)',
      },
      memo: {
        type: 'string' as const,
        description: 'Optional memo field',
      },
      metadata: {
        type: 'object' as const,
        description: 'Optional metadata',
      },
    },
    required: ['type', 'principal', 'payload'],
  },
  handler: txBuild,
};

// =============================================================================
// Tool: tx.estimate_credits
// =============================================================================

export interface TxEstimateCreditsArgs {
  type: string;
  payload: Record<string, unknown>;
  dataSize?: number;
}

export interface TxEstimateCreditsResult {
  estimate: CreditEstimate;
  oraclePrice?: number;
  acmeEquivalent?: string;
}

/**
 * Estimate credits required for a transaction
 */
export async function txEstimateCredits(
  args: TxEstimateCreditsArgs
): Promise<ToolResponse<TxEstimateCreditsResult>> {
  try {
    requirePermission(OperationCategory.ESTIMATE);

    const { type, payload, dataSize } = args;

    // Calculate base credits for transaction type
    const baseCredits = getBaseCredits(type);

    // Calculate data credits if applicable
    let dataCredits = 0;
    if (dataSize && dataSize > 0) {
      // 1 credit per 256 bytes of data
      dataCredits = Math.ceil(dataSize / 256);
    } else if (payload.data && typeof payload.data === 'string') {
      const size = Buffer.from(payload.data).length;
      dataCredits = Math.ceil(size / 256);
    }

    const totalCredits = baseCredits + dataCredits;

    const breakdown: CreditEstimate['breakdown'] = [
      { description: `Base cost for ${type}`, credits: baseCredits },
    ];

    if (dataCredits > 0) {
      breakdown.push({ description: 'Data storage cost', credits: dataCredits });
    }

    const estimate: CreditEstimate = {
      baseCredits,
      dataCredits,
      totalCredits,
      breakdown,
    };

    // Try to get oracle price for ACME equivalent
    let oraclePrice: number | undefined;
    let acmeEquivalent: string | undefined;

    try {
      const config = getCurrentNetworkConfig();
      const response = await fetch(config.v2Endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'describe',
          params: {},
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.result?.values?.oracle) {
          oraclePrice = result.result.values.oracle;
          // Credits are 1/100th of a cent, oracle is ACME per $1
          const creditsPerAcme = oraclePrice * 100;
          const acmeNeeded = totalCredits / creditsPerAcme;
          acmeEquivalent = acmeNeeded.toFixed(8);
        }
      }
    } catch {
      // Oracle fetch failed, continue without it
    }

    return successResponse({
      estimate,
      oraclePrice,
      acmeEquivalent,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * tx.estimate_credits tool definition
 */
export const txEstimateCreditsTool = {
  name: 'tx.estimate_credits',
  description: 'Estimate credits required for a transaction',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string' as const,
        description: 'Transaction type',
      },
      payload: {
        type: 'object' as const,
        description: 'Transaction payload',
      },
      dataSize: {
        type: 'number' as const,
        description: 'Size of data in bytes (optional)',
      },
    },
    required: ['type', 'payload'],
  },
  handler: txEstimateCredits,
};

// =============================================================================
// Tool: tx.validate_prereqs
// =============================================================================

export interface TxValidatePrereqsArgs {
  type: string;
  principal: string;
  payload: Record<string, unknown>;
  network?: NetworkId;
}

export interface TxValidatePrereqsResult {
  valid: boolean;
  checks: PrerequisiteCheck[];
  missingPrerequisites: string[];
}

/**
 * Validate prerequisites for a transaction
 */
export async function txValidatePrereqs(
  args: TxValidatePrereqsArgs
): Promise<ToolResponse<TxValidatePrereqsResult>> {
  try {
    requirePermission(OperationCategory.VALIDATE);

    const { type, principal, payload, network } = args;

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

    const checks: PrerequisiteCheck[] = [];
    const missingPrerequisites: string[] = [];

    // Check 1: Principal exists
    try {
      const principalResponse = await fetch(config.v2Endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'query',
          params: { url: principal },
        }),
        signal: AbortSignal.timeout(10000),
      });

      const principalResult = await principalResponse.json();

      if (principalResult.error) {
        checks.push({
          name: 'principal_exists',
          passed: false,
          message: `Principal account not found: ${principal}`,
          details: { error: principalResult.error.message },
        });
        missingPrerequisites.push('Principal account must exist');
      } else {
        checks.push({
          name: 'principal_exists',
          passed: true,
          message: `Principal account exists: ${principalResult.result?.type}`,
          details: { accountType: principalResult.result?.type },
        });

        // Check 2: Principal has sufficient credits
        const credits = principalResult.result?.data?.creditBalance ?? 0;
        const requiredCredits = estimateCreditsForType(type, payload);

        if (credits < requiredCredits) {
          checks.push({
            name: 'sufficient_credits',
            passed: false,
            message: `Insufficient credits: ${credits} < ${requiredCredits} required`,
            details: { available: credits, required: requiredCredits },
          });
          missingPrerequisites.push(
            `Need ${requiredCredits - credits} more credits on ${principal}`
          );
        } else {
          checks.push({
            name: 'sufficient_credits',
            passed: true,
            message: `Sufficient credits: ${credits} >= ${requiredCredits} required`,
            details: { available: credits, required: requiredCredits },
          });
        }
      }
    } catch (error) {
      checks.push({
        name: 'principal_exists',
        passed: false,
        message: `Failed to query principal: ${error instanceof Error ? error.message : String(error)}`,
      });
      missingPrerequisites.push('Unable to verify principal account');
    }

    // Type-specific checks
    const typeChecks = await validateTypeSpecificPrereqs(type, payload, config);
    checks.push(...typeChecks.checks);
    missingPrerequisites.push(...typeChecks.missing);

    const valid = checks.every((c) => c.passed);

    return successResponse({
      valid,
      checks,
      missingPrerequisites,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * tx.validate_prereqs tool definition
 */
export const txValidatePrereqsTool = {
  name: 'tx.validate_prereqs',
  description: 'Validate prerequisites before submitting a transaction',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string' as const,
        description: 'Transaction type',
      },
      principal: {
        type: 'string' as const,
        description: 'Principal account URL',
      },
      payload: {
        type: 'object' as const,
        description: 'Transaction payload',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to validate against',
      },
    },
    required: ['type', 'principal', 'payload'],
  },
  handler: txValidatePrereqs,
};

// =============================================================================
// Tool: tx.submit
// =============================================================================

export interface TxSubmitArgs {
  transaction: BuiltTransaction;
  signature?: string;
  signer?: string;
  network?: NetworkId;
}

export interface TxSubmitResult {
  result: SubmitResult;
  network: NetworkId;
}

/**
 * Submit a transaction to the network
 */
export async function txSubmit(args: TxSubmitArgs): Promise<ToolResponse<TxSubmitResult>> {
  try {
    requirePermission(OperationCategory.SUBMIT);

    const { transaction, signature, signer, network } = args;

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

    // Check if network is read-only
    if (config.readOnly) {
      return errorResponse([
        {
          code: 'NETWORK_READ_ONLY',
          message: `Network '${targetNetwork}' is read-only. Transaction submission is disabled.`,
        },
      ]);
    }

    // Check permission mode
    const mode = getPermissionMode();
    if (mode !== PermissionMode.SIGN_AND_SUBMIT) {
      return errorResponse([
        {
          code: 'PERMISSION_DENIED',
          message: `Transaction submission requires SIGN_AND_SUBMIT mode. Current mode: ${mode}`,
        },
      ]);
    }

    // Validate signature is provided
    if (!signature || !signer) {
      return errorResponse([
        {
          code: 'MISSING_SIGNATURE',
          message: 'Transaction submission requires a signature and signer',
        },
      ]);
    }

    // Submit the transaction
    const response = await fetch(config.v2Endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'execute',
        params: {
          envelope: {
            transaction: [
              {
                header: {
                  principal: transaction.header.principal,
                  initiator: transaction.header.initiator ?? signer,
                  memo: transaction.header.memo,
                  metadata: transaction.header.metadata,
                },
                body: transaction.body,
              },
            ],
            signatures: [
              {
                type: 'ed25519',
                publicKey: signer,
                signature,
                signer: transaction.header.initiator ?? signer,
              },
            ],
          },
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

    const txHash = result.result?.txid ?? result.result?.hash ?? transaction.hash;
    const status: TransactionStatus = result.result?.status ?? 'pending';

    return successResponse({
      result: {
        txHash,
        status,
        message: `Transaction submitted successfully. Hash: ${txHash}`,
      },
      network: targetNetwork,
    });
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * tx.submit tool definition
 */
export const txSubmitTool = {
  name: 'tx.submit',
  description: 'Submit a signed transaction to the network',
  inputSchema: {
    type: 'object' as const,
    properties: {
      transaction: {
        type: 'object' as const,
        description: 'Built transaction from tx.build',
      },
      signature: {
        type: 'string' as const,
        description: 'Transaction signature (hex encoded)',
      },
      signer: {
        type: 'string' as const,
        description: 'Signer public key or URL',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to submit to',
      },
    },
    required: ['transaction', 'signature', 'signer'],
  },
  handler: txSubmit,
};

// =============================================================================
// Tool: tx.wait
// =============================================================================

export interface TxWaitArgs {
  txHash: string;
  timeout?: number;
  pollInterval?: number;
  network?: NetworkId;
}

export interface TxWaitResult {
  result: TransactionResult;
  elapsed: number;
}

/**
 * Wait for transaction confirmation
 */
export async function txWait(args: TxWaitArgs): Promise<ToolResponse<TxWaitResult>> {
  try {
    requirePermission(OperationCategory.WAIT);

    const { txHash, timeout = 60000, pollInterval = 2000, network } = args;

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

    const startTime = Date.now();
    let lastStatus: TransactionStatus = 'pending';
    let lastResult: Record<string, unknown> | null = null;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(config.v2Endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'query-tx',
            params: { txid: txHash },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const result = await response.json();

          if (!result.error) {
            lastResult = result.result;
            lastStatus = result.result?.status ?? 'pending';

            // Check for terminal states
            if (lastStatus === 'delivered' || lastStatus === 'confirmed') {
              return successResponse({
                result: {
                  txHash,
                  status: lastStatus,
                  blockHeight: result.result?.blockHeight,
                  timestamp: result.result?.timestamp,
                },
                elapsed: Date.now() - startTime,
              });
            }

            if (lastStatus === 'failed') {
              return successResponse(
                {
                  result: {
                    txHash,
                    status: 'failed',
                    error: {
                      code: result.result?.error?.code ?? 'TRANSACTION_FAILED',
                      message: result.result?.error?.message ?? 'Transaction failed',
                    },
                  },
                  elapsed: Date.now() - startTime,
                },
                ['Transaction failed during execution']
              );
            }
          }
        }
      } catch {
        // Ignore polling errors, continue waiting
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout reached
    return successResponse(
      {
        result: {
          txHash,
          status: lastStatus,
        },
        elapsed: Date.now() - startTime,
      },
      [`Timeout waiting for transaction confirmation. Last status: ${lastStatus}`]
    );
  } catch (error) {
    return errorFromException(error);
  }
}

/**
 * tx.wait tool definition
 */
export const txWaitTool = {
  name: 'tx.wait',
  description: 'Wait for a transaction to be confirmed',
  inputSchema: {
    type: 'object' as const,
    properties: {
      txHash: {
        type: 'string' as const,
        description: 'Transaction hash to wait for',
      },
      timeout: {
        type: 'number' as const,
        description: 'Maximum time to wait in milliseconds (default: 60000)',
      },
      pollInterval: {
        type: 'number' as const,
        description: 'Polling interval in milliseconds (default: 2000)',
      },
      network: {
        type: 'string' as const,
        enum: ['mainnet', 'testnet', 'devnet', 'kermit', 'local'],
        description: 'Network to query',
      },
    },
    required: ['txHash'],
  },
  handler: txWait,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate payload based on transaction type
 */
function validatePayload(
  type: string,
  payload: Record<string, unknown>
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (type) {
    case 'sendTokens':
      if (!payload.to || !Array.isArray(payload.to)) {
        errors.push('sendTokens requires a "to" array of recipients');
      }
      break;

    case 'createIdentity':
      if (!payload.url || typeof payload.url !== 'string') {
        errors.push('createIdentity requires a "url" for the new identity');
      }
      if (!payload.keyHash && !payload.publicKey) {
        errors.push('createIdentity requires a "keyHash" or "publicKey"');
      }
      break;

    case 'addCredits':
      if (!payload.recipient || typeof payload.recipient !== 'string') {
        errors.push('addCredits requires a "recipient" URL');
      }
      if (!payload.amount || typeof payload.amount !== 'number') {
        errors.push('addCredits requires an "amount"');
      }
      break;

    case 'writeData':
      if (!payload.data && !payload.entry) {
        warnings.push('writeData has no data to write');
      }
      break;

    // Add more type-specific validations as needed
  }

  return { errors, warnings };
}

/**
 * Get base credit cost for a transaction type
 */
function getBaseCredits(type: string): number {
  const creditCosts: Record<string, number> = {
    sendTokens: 3,
    createIdentity: 500, // 500 credits for ADI creation
    createTokenAccount: 25,
    createDataAccount: 25,
    createKeyBook: 100,
    createKeyPage: 100,
    createToken: 5000,
    issueTokens: 3,
    burnTokens: 3,
    addCredits: 3,
    updateKeyPage: 3,
    updateAccountAuth: 3,
    writeData: 1, // Plus data credits
    writeDataTo: 1,
    lockAccount: 3,
    acmeFaucet: 0, // Faucet is free
  };

  return creditCosts[type] ?? 10;
}

/**
 * Estimate total credits for a transaction
 */
function estimateCreditsForType(type: string, payload: Record<string, unknown>): number {
  const base = getBaseCredits(type);

  // Add data credits if applicable
  let dataCredits = 0;
  if (payload.data && typeof payload.data === 'string') {
    const size = Buffer.from(payload.data).length;
    dataCredits = Math.ceil(size / 256);
  }

  return base + dataCredits;
}

/**
 * Validate type-specific prerequisites
 */
async function validateTypeSpecificPrereqs(
  type: string,
  payload: Record<string, unknown>,
  config: { v2Endpoint: string }
): Promise<{ checks: PrerequisiteCheck[]; missing: string[] }> {
  const checks: PrerequisiteCheck[] = [];
  const missing: string[] = [];

  switch (type) {
    case 'sendTokens':
      // Verify source account has sufficient balance
      if (payload.from && typeof payload.from === 'string') {
        try {
          const response = await fetch(config.v2Endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'query',
              params: { url: payload.from },
            }),
            signal: AbortSignal.timeout(10000),
          });

          const result = await response.json();
          if (!result.error) {
            const balance = BigInt(result.result?.data?.balance ?? '0');
            const totalToSend = calculateTotalSend(payload.to as Array<{ amount: string }>);

            if (balance < totalToSend) {
              checks.push({
                name: 'sufficient_balance',
                passed: false,
                message: `Insufficient token balance: ${balance} < ${totalToSend}`,
                details: { balance: balance.toString(), required: totalToSend.toString() },
              });
              missing.push('Need more tokens in source account');
            } else {
              checks.push({
                name: 'sufficient_balance',
                passed: true,
                message: 'Sufficient token balance',
              });
            }
          }
        } catch (error) {
          checks.push({
            name: 'sufficient_balance',
            passed: false,
            message: `Failed to verify balance: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      break;

    case 'createIdentity':
      // Check that the URL is available
      if (payload.url && typeof payload.url === 'string') {
        try {
          const response = await fetch(config.v2Endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'query',
              params: { url: payload.url },
            }),
            signal: AbortSignal.timeout(10000),
          });

          const result = await response.json();
          if (!result.error) {
            checks.push({
              name: 'url_available',
              passed: false,
              message: `URL already exists: ${payload.url}`,
            });
            missing.push('Choose a different identity URL');
          } else {
            checks.push({
              name: 'url_available',
              passed: true,
              message: 'URL is available',
            });
          }
        } catch {
          // If query fails, assume URL is available
          checks.push({
            name: 'url_available',
            passed: true,
            message: 'URL appears to be available',
          });
        }
      }
      break;
  }

  return { checks, missing };
}

/**
 * Calculate total amount to send from recipients array
 */
function calculateTotalSend(recipients: Array<{ amount: string }> | undefined): bigint {
  if (!recipients || !Array.isArray(recipients)) {
    return BigInt(0);
  }

  return recipients.reduce((total, recipient) => {
    const amount = BigInt(recipient.amount ?? '0');
    return total + amount;
  }, BigInt(0));
}

// =============================================================================
// Export all tools
// =============================================================================

export const transactionTools = [
  txBuildTool,
  txEstimateCreditsTool,
  txValidatePrereqsTool,
  txSubmitTool,
  txWaitTool,
];
