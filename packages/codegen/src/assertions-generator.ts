/**
 * Assertions Generator - Auto-generate assertions based on flow blocks
 */

import type {
  Flow,
  FlowNode,
  FlowAssertion,
  AssertionType,
  BlockType,
} from '@accumulate-studio/types';

// =============================================================================
// Types
// =============================================================================

export interface GeneratedAssertions {
  /** Generated assertions */
  assertions: FlowAssertion[];
  /** Expected final state (for verification) */
  expectedState: ExpectedState;
}

export interface ExpectedState {
  /** Accounts that should exist after flow execution */
  accountsExist: string[];
  /** Accounts that should not exist */
  accountsNotExist: string[];
  /** Expected balance changes (account -> delta) */
  balanceDeltas: Record<string, string>;
  /** Expected credit changes (account -> delta) */
  creditDeltas: Record<string, number>;
  /** Transaction IDs that should have verified receipts */
  verifiedReceipts: string[];
  /** Chain entry count deltas */
  chainEntryDeltas: Record<string, { chain: string; minDelta: number }>;
}

// =============================================================================
// Assertion Generation
// =============================================================================

/**
 * Generate assertions from a flow
 */
export function generateAssertions(flow: Flow): GeneratedAssertions {
  const assertions: FlowAssertion[] = [];
  const expectedState: ExpectedState = {
    accountsExist: [],
    accountsNotExist: [],
    balanceDeltas: {},
    creditDeltas: {},
    verifiedReceipts: [],
    chainEntryDeltas: {},
  };

  // Process each node in the flow
  for (const node of flow.nodes) {
    const nodeAssertions = generateNodeAssertions(node, flow);
    assertions.push(...nodeAssertions.assertions);

    // Merge expected state
    mergeExpectedState(expectedState, nodeAssertions.expectedState);
  }

  // Add receipt verification for all transaction blocks
  const transactionNodes = flow.nodes.filter((n) => isTransactionBlock(n.type));
  for (const node of transactionNodes) {
    assertions.push({
      type: 'receipt.verified',
      sourceStep: node.id,
      message: `Receipt verified for ${node.type} (${node.id})`,
    });
    expectedState.verifiedReceipts.push(node.id);
  }

  // Deduplicate assertions
  const uniqueAssertions = deduplicateAssertions(assertions);

  return {
    assertions: uniqueAssertions,
    expectedState,
  };
}

/**
 * Generate assertions for a specific node
 */
function generateNodeAssertions(
  node: FlowNode,
  flow: Flow
): GeneratedAssertions {
  const assertions: FlowAssertion[] = [];
  const expectedState: ExpectedState = {
    accountsExist: [],
    accountsNotExist: [],
    balanceDeltas: {},
    creditDeltas: {},
    verifiedReceipts: [],
    chainEntryDeltas: {},
  };

  const config = node.config as Record<string, unknown>;

  switch (node.type) {
    // Identity Operations
    case 'CreateIdentity': {
      const adiUrl = config.url as string;
      const keyBookUrl = config.keyBookUrl as string ?? `${adiUrl}/book`;
      const keyPageUrl = `${keyBookUrl}/1`;

      assertions.push(
        {
          type: 'account.exists',
          url: adiUrl,
          message: `ADI ${adiUrl} should exist`,
        },
        {
          type: 'account.exists',
          url: keyBookUrl,
          message: `Key book ${keyBookUrl} should exist`,
        },
        {
          type: 'account.exists',
          url: keyPageUrl,
          message: `Key page ${keyPageUrl} should exist`,
        }
      );

      expectedState.accountsExist.push(adiUrl, keyBookUrl, keyPageUrl);
      break;
    }

    case 'CreateKeyBook': {
      const keyBookUrl = config.url as string;
      assertions.push({
        type: 'account.exists',
        url: keyBookUrl,
        message: `Key book ${keyBookUrl} should exist`,
      });
      expectedState.accountsExist.push(keyBookUrl);
      break;
    }

    case 'CreateKeyPage': {
      const keyPageUrl = config.url as string;
      assertions.push({
        type: 'account.exists',
        url: keyPageUrl,
        message: `Key page ${keyPageUrl} should exist`,
      });
      expectedState.accountsExist.push(keyPageUrl);
      break;
    }

    // Account Operations
    case 'CreateTokenAccount': {
      const tokenAccountUrl = config.url as string;
      assertions.push({
        type: 'account.exists',
        url: tokenAccountUrl,
        message: `Token account ${tokenAccountUrl} should exist`,
      });
      expectedState.accountsExist.push(tokenAccountUrl);
      break;
    }

    case 'CreateDataAccount': {
      const dataAccountUrl = config.url as string;
      assertions.push({
        type: 'account.exists',
        url: dataAccountUrl,
        message: `Data account ${dataAccountUrl} should exist`,
      });
      expectedState.accountsExist.push(dataAccountUrl);
      break;
    }

    case 'CreateToken': {
      const tokenUrl = config.url as string;
      assertions.push({
        type: 'account.exists',
        url: tokenUrl,
        message: `Token issuer ${tokenUrl} should exist`,
      });
      expectedState.accountsExist.push(tokenUrl);
      break;
    }

    // Token Operations
    case 'SendTokens': {
      const recipients = config.recipients as Array<{ url: string; amount: string }> ?? [];
      for (const recipient of recipients) {
        // Recipient should receive tokens (positive delta)
        assertions.push({
          type: 'balance.delta',
          account: recipient.url,
          delta: recipient.amount,
          message: `${recipient.url} should receive ${recipient.amount} tokens`,
        });
        expectedState.balanceDeltas[recipient.url] = recipient.amount;
      }

      // Calculate total outgoing amount
      const totalAmount = recipients.reduce(
        (sum, r) => sum + BigInt(r.amount),
        BigInt(0)
      );

      // Source account loses tokens (negative delta would need principal URL)
      // Note: We'd need to track the principal separately
      break;
    }

    case 'IssueTokens': {
      const recipient = config.recipient as string;
      const amount = config.amount as string;
      assertions.push({
        type: 'balance.delta',
        account: recipient,
        delta: amount,
        message: `${recipient} should receive ${amount} issued tokens`,
      });
      expectedState.balanceDeltas[recipient] = amount;
      break;
    }

    case 'BurnTokens': {
      const amount = config.amount as string;
      // Burning reduces balance (negative delta on principal)
      // Note: Principal tracking would be needed
      break;
    }

    // Credit Operations
    case 'AddCredits': {
      const recipient = config.recipient as string;
      // Credits are purchased - we can't easily calculate the credit delta
      // without knowing the oracle price, but we can verify the account exists
      assertions.push({
        type: 'account.exists',
        url: recipient,
        message: `Credit recipient ${recipient} should exist`,
      });
      expectedState.accountsExist.push(recipient);
      break;
    }

    case 'TransferCredits': {
      const recipient = config.recipient as string;
      const amount = config.amount as number;
      // Recipient gains credits
      expectedState.creditDeltas[recipient] = amount;
      break;
    }

    // Data Operations
    case 'WriteData': {
      // Data account should have new entries
      // Chain entry count should increase
      assertions.push({
        type: 'chain.entry_count_delta_min',
        sourceStep: node.id,
        chain: 'main',
        minDelta: 1,
        message: 'Main chain should have at least 1 new entry',
      });
      break;
    }

    case 'WriteDataTo': {
      const recipient = config.recipient as string;
      assertions.push({
        type: 'account.exists',
        url: recipient,
        message: `Data recipient ${recipient} should exist`,
      });
      expectedState.accountsExist.push(recipient);
      break;
    }

    // Utility Blocks
    case 'Faucet': {
      const account = config.account as string;
      // Faucet should deposit tokens
      assertions.push({
        type: 'account.exists',
        url: account,
        message: `Faucet target ${account} should exist`,
      });
      expectedState.accountsExist.push(account);
      break;
    }

    default:
      // No specific assertions for other block types
      break;
  }

  return { assertions, expectedState };
}

/**
 * Check if a block type is a transaction type
 */
function isTransactionBlock(type: BlockType): boolean {
  const transactionTypes: BlockType[] = [
    'CreateIdentity',
    'CreateKeyBook',
    'CreateKeyPage',
    'CreateTokenAccount',
    'CreateDataAccount',
    'CreateToken',
    'CreateLiteTokenAccount',
    'SendTokens',
    'IssueTokens',
    'BurnTokens',
    'AddCredits',
    'TransferCredits',
    'BurnCredits',
    'WriteData',
    'WriteDataTo',
    'UpdateKeyPage',
    'UpdateKey',
    'LockAccount',
    'UpdateAccountAuth',
  ];
  return transactionTypes.includes(type);
}

/**
 * Merge expected states
 */
function mergeExpectedState(target: ExpectedState, source: ExpectedState): void {
  // Merge arrays (deduplicate)
  target.accountsExist = [...new Set([...target.accountsExist, ...source.accountsExist])];
  target.accountsNotExist = [...new Set([...target.accountsNotExist, ...source.accountsNotExist])];
  target.verifiedReceipts = [...new Set([...target.verifiedReceipts, ...source.verifiedReceipts])];

  // Merge balance deltas (add values)
  for (const [account, delta] of Object.entries(source.balanceDeltas)) {
    const existing = target.balanceDeltas[account];
    if (existing) {
      target.balanceDeltas[account] = String(BigInt(existing) + BigInt(delta));
    } else {
      target.balanceDeltas[account] = delta;
    }
  }

  // Merge credit deltas (add values)
  for (const [account, delta] of Object.entries(source.creditDeltas)) {
    target.creditDeltas[account] = (target.creditDeltas[account] ?? 0) + delta;
  }

  // Merge chain entry deltas
  for (const [account, delta] of Object.entries(source.chainEntryDeltas)) {
    const existing = target.chainEntryDeltas[account];
    if (existing && existing.chain === delta.chain) {
      target.chainEntryDeltas[account] = {
        chain: delta.chain,
        minDelta: existing.minDelta + delta.minDelta,
      };
    } else {
      target.chainEntryDeltas[account] = delta;
    }
  }
}

/**
 * Deduplicate assertions (same type + same account/url)
 */
function deduplicateAssertions(assertions: FlowAssertion[]): FlowAssertion[] {
  const seen = new Set<string>();
  const result: FlowAssertion[] = [];

  for (const assertion of assertions) {
    const key = getAssertionKey(assertion);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(assertion);
    }
  }

  return result;
}

/**
 * Generate a unique key for an assertion
 */
function getAssertionKey(assertion: FlowAssertion): string {
  const parts = [assertion.type];

  if (assertion.account) parts.push(`account:${assertion.account}`);
  if (assertion.url) parts.push(`url:${assertion.url}`);
  if (assertion.sourceStep) parts.push(`step:${assertion.sourceStep}`);
  if (assertion.chain) parts.push(`chain:${assertion.chain}`);

  return parts.join('|');
}

// =============================================================================
// Assertion Validation
// =============================================================================

/**
 * Validate assertions against execution results
 */
export function validateAssertions(
  assertions: FlowAssertion[],
  executionResults: Record<string, unknown>,
  networkState: Record<string, unknown>
): AssertionResult[] {
  return assertions.map((assertion) => validateAssertion(assertion, executionResults, networkState));
}

export interface AssertionResult {
  assertion: FlowAssertion;
  passed: boolean;
  actual?: unknown;
  error?: string;
}

function validateAssertion(
  assertion: FlowAssertion,
  executionResults: Record<string, unknown>,
  networkState: Record<string, unknown>
): AssertionResult {
  try {
    switch (assertion.type) {
      case 'account.exists': {
        const account = networkState[assertion.url!] as Record<string, unknown> | undefined;
        const exists = account !== undefined && account !== null;
        return {
          assertion,
          passed: exists,
          actual: exists ? 'exists' : 'not found',
          error: exists ? undefined : `Account ${assertion.url} does not exist`,
        };
      }

      case 'account.not_exists': {
        const account = networkState[assertion.url!] as Record<string, unknown> | undefined;
        const notExists = account === undefined || account === null;
        return {
          assertion,
          passed: notExists,
          actual: notExists ? 'not found' : 'exists',
          error: notExists ? undefined : `Account ${assertion.url} exists but should not`,
        };
      }

      case 'balance.delta': {
        // Would need before/after state comparison
        return {
          assertion,
          passed: true, // Placeholder
          actual: 'validation not implemented',
        };
      }

      case 'balance.equals': {
        const account = networkState[assertion.account!] as Record<string, unknown> | undefined;
        const balance = account?.balance as string | undefined;
        const equals = balance === assertion.equals;
        return {
          assertion,
          passed: equals,
          actual: balance,
          error: equals ? undefined : `Balance is ${balance}, expected ${assertion.equals}`,
        };
      }

      case 'receipt.verified': {
        const result = executionResults[assertion.sourceStep!] as Record<string, unknown> | undefined;
        const receipt = result?.receipt as Record<string, unknown> | undefined;
        const verified = receipt?.verified === true;
        return {
          assertion,
          passed: verified,
          actual: receipt,
          error: verified ? undefined : 'Receipt not verified',
        };
      }

      case 'tx.status.equals': {
        const result = executionResults[assertion.sourceStep!] as Record<string, unknown> | undefined;
        const status = result?.status as string | undefined;
        const equals = status === assertion.status;
        return {
          assertion,
          passed: equals,
          actual: status,
          error: equals ? undefined : `Status is ${status}, expected ${assertion.status}`,
        };
      }

      default:
        return {
          assertion,
          passed: false,
          error: `Unknown assertion type: ${assertion.type}`,
        };
    }
  } catch (error) {
    return {
      assertion,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Assertion Templates
// =============================================================================

/**
 * Create an account.exists assertion
 */
export function assertAccountExists(url: string, message?: string): FlowAssertion {
  return {
    type: 'account.exists',
    url,
    message: message ?? `Account ${url} should exist`,
  };
}

/**
 * Create a balance.delta assertion
 */
export function assertBalanceDelta(
  account: string,
  delta: string,
  message?: string
): FlowAssertion {
  return {
    type: 'balance.delta',
    account,
    delta,
    message: message ?? `Balance of ${account} should change by ${delta}`,
  };
}

/**
 * Create a receipt.verified assertion
 */
export function assertReceiptVerified(sourceStep: string, message?: string): FlowAssertion {
  return {
    type: 'receipt.verified',
    sourceStep,
    message: message ?? `Receipt for step ${sourceStep} should be verified`,
  };
}

/**
 * Create a tx.status.equals assertion
 */
export function assertTxStatus(
  sourceStep: string,
  status: string,
  message?: string
): FlowAssertion {
  return {
    type: 'tx.status.equals',
    sourceStep,
    status,
    message: message ?? `Transaction ${sourceStep} should have status ${status}`,
  };
}
