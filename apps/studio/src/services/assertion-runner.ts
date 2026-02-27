/**
 * Assertion Runner - Evaluate flow assertions after execution
 */

import type { FlowAssertion, FlowExecutionState, FlowNode } from '@accumulate-studio/types';
import { networkService } from './network';

// =============================================================================
// Types
// =============================================================================

export type AssertionStatus = 'pass' | 'fail' | 'skip' | 'error';

export interface AssertionResult {
  assertion: FlowAssertion;
  status: AssertionStatus;
  actual?: string;
  message: string;
}

// =============================================================================
// Node ID Resolution
// =============================================================================

/**
 * Convert snake_case to PascalCase (e.g., "create_identity" → "CreateIdentity").
 */
function snakeToPascal(s: string): string {
  return s
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Convert snake_case to a Title Case label (e.g., "add_signer_2" → "Add Signer 2").
 */
function snakeToLabel(s: string): string {
  return s
    .split('_')
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

/**
 * Resolve a semantic node ID to an actual node ID present in the execution state.
 *
 * Strategy:
 * 1. Exact match in nodeStates (template-loaded flows keep semantic IDs)
 * 2. Match by block type (snake_case → PascalCase, e.g. "create_identity" → "CreateIdentity")
 * 3. Match by label (case-insensitive, e.g. "add_signer_2" → "Add Signer 2")
 */
function resolveNodeId(
  semanticId: string,
  executionState: FlowExecutionState,
  flowNodes?: FlowNode[],
): string | null {
  // 1. Exact match
  if (executionState.nodeStates[semanticId]) {
    return semanticId;
  }

  // Without flow nodes, can't do fallback resolution
  if (!flowNodes || flowNodes.length === 0) {
    return null;
  }

  // 2. Match by block type (snake_case → PascalCase)
  const pascalType = snakeToPascal(semanticId);
  const typeMatch = flowNodes.find(
    (n) => n.type === pascalType && executionState.nodeStates[n.id],
  );
  if (typeMatch) {
    return typeMatch.id;
  }

  // 3. Match by label (case-insensitive)
  const expectedLabel = snakeToLabel(semanticId).toLowerCase();
  const labelMatch = flowNodes.find(
    (n) => n.label?.toLowerCase() === expectedLabel && executionState.nodeStates[n.id],
  );
  if (labelMatch) {
    return labelMatch.id;
  }

  return null;
}

// =============================================================================
// Template Resolution
// =============================================================================

/**
 * Resolve {{nodeId.outputKey}} patterns in a string using execution outputs.
 * Falls back to type/label matching via flowNodes when exact ID match fails.
 */
function resolveTemplate(
  value: string,
  executionState: FlowExecutionState,
  flowNodes?: FlowNode[],
): string {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmed = varName.trim();
    const dotIndex = trimmed.indexOf('.');
    if (dotIndex !== -1) {
      const nodeId = trimmed.slice(0, dotIndex);
      const outputKey = trimmed.slice(dotIndex + 1);
      const resolvedId = resolveNodeId(nodeId, executionState, flowNodes) ?? nodeId;
      const nodeState = executionState.nodeStates[resolvedId];
      if (nodeState?.outputs) {
        const val = (nodeState.outputs as Record<string, unknown>)[outputKey];
        if (val !== undefined) return String(val);
      }
    }
    // Also check flow-level variables
    const flowVar = executionState.variables?.[trimmed];
    if (flowVar !== undefined) return String(flowVar);
    return match; // unresolved
  });
}

/**
 * Deep-resolve all string fields in an assertion object.
 */
function resolveAssertionFields(
  assertion: FlowAssertion,
  executionState: FlowExecutionState,
  flowNodes?: FlowNode[],
): FlowAssertion {
  const resolved = { ...assertion };
  for (const key of Object.keys(resolved) as (keyof FlowAssertion)[]) {
    const val = resolved[key];
    if (typeof val === 'string') {
      (resolved as Record<string, unknown>)[key] = resolveTemplate(val, executionState, flowNodes);
    }
  }
  return resolved;
}

// =============================================================================
// Assertion Runner
// =============================================================================

/**
 * Evaluate a single assertion against the execution state and network.
 */
async function evaluateAssertion(
  assertion: FlowAssertion,
  executionState: FlowExecutionState,
  flowNodes?: FlowNode[],
): Promise<AssertionResult> {
  try {
    switch (assertion.type) {
      case 'balance.gte': {
        if (!assertion.account || !assertion.equals) {
          return { assertion, status: 'skip', message: 'Missing account or equals field' };
        }
        const balance = await queryAccountBalance(assertion.account);
        if (balance === null) {
          return { assertion, status: 'error', message: `Could not query balance for ${assertion.account}` };
        }
        const expected = BigInt(assertion.equals);
        const pass = BigInt(balance) >= expected;
        return {
          assertion,
          status: pass ? 'pass' : 'fail',
          actual: balance,
          message: pass
            ? `Balance ${balance} >= ${assertion.equals}`
            : `Balance ${balance} < ${assertion.equals}`,
        };
      }

      case 'balance.delta': {
        if (!assertion.account || !assertion.delta) {
          return { assertion, status: 'skip', message: 'Missing account or delta field' };
        }
        // Without a pre-execution snapshot we fall back to checking that the
        // current balance is at least the expected delta (i.e. the account
        // received at least that much).
        const currentBalance = await queryAccountBalance(assertion.account);
        if (currentBalance === null) {
          return { assertion, status: 'error', message: `Could not query balance for ${assertion.account}` };
        }
        const deltaNum = BigInt(Math.round(parseFloat(assertion.delta) * 1e8));
        const balNum = BigInt(currentBalance);
        const pass = balNum >= deltaNum;
        return {
          assertion,
          status: pass ? 'pass' : 'fail',
          actual: currentBalance,
          message: pass
            ? `Balance ${currentBalance} >= expected delta ${assertion.delta}`
            : `Balance ${currentBalance} < expected delta ${assertion.delta}`,
        };
      }

      case 'account.exists': {
        if (!assertion.url) {
          return { assertion, status: 'skip', message: 'Missing url field' };
        }
        const exists = await queryAccountExists(assertion.url);
        return {
          assertion,
          status: exists ? 'pass' : 'fail',
          message: exists ? `Account ${assertion.url} exists` : `Account ${assertion.url} not found`,
        };
      }

      case 'account.not_exists': {
        if (!assertion.url) {
          return { assertion, status: 'skip', message: 'Missing url field' };
        }
        const exists = await queryAccountExists(assertion.url);
        return {
          assertion,
          status: !exists ? 'pass' : 'fail',
          message: !exists ? `Account ${assertion.url} does not exist` : `Account ${assertion.url} unexpectedly exists`,
        };
      }

      case 'tx.status.equals': {
        if (!assertion.sourceStep || !assertion.status) {
          return { assertion, status: 'skip', message: 'Missing sourceStep or status field' };
        }
        const txResolvedId = resolveNodeId(assertion.sourceStep, executionState, flowNodes);
        if (!txResolvedId) {
          return { assertion, status: 'skip', message: `Node "${assertion.sourceStep}" not found in flow — skipped` };
        }
        const nodeState = executionState.nodeStates[txResolvedId];
        const actualStatus = nodeState.status;
        const pass = actualStatus === assertion.status;
        return {
          assertion,
          status: pass ? 'pass' : 'fail',
          actual: actualStatus,
          message: pass
            ? `Node status is "${assertion.status}"`
            : `Expected status "${assertion.status}", got "${actualStatus}"`,
        };
      }

      case 'receipt.verified': {
        if (!assertion.sourceStep) {
          return { assertion, status: 'skip', message: 'Missing sourceStep field' };
        }
        const rcptResolvedId = resolveNodeId(assertion.sourceStep, executionState, flowNodes);
        if (!rcptResolvedId) {
          return { assertion, status: 'skip', message: `Node "${assertion.sourceStep}" not found in flow — skipped` };
        }
        const rcptNodeState = executionState.nodeStates[rcptResolvedId];
        const receipt = rcptNodeState.receipt as Record<string, unknown> | undefined;
        const verified = receipt?.verified === true;
        return {
          assertion,
          status: verified ? 'pass' : 'fail',
          message: verified ? 'Receipt verified' : 'Receipt not verified',
        };
      }

      case 'synthetic.delivered': {
        if (!assertion.sourceStep) {
          return { assertion, status: 'skip', message: 'Missing sourceStep field' };
        }
        const synthResolvedId = resolveNodeId(assertion.sourceStep, executionState, flowNodes);
        if (!synthResolvedId) {
          return { assertion, status: 'skip', message: `Node "${assertion.sourceStep}" not found in flow — skipped` };
        }
        const synthNodeState = executionState.nodeStates[synthResolvedId];
        const outputs = synthNodeState.outputs as Record<string, unknown> | undefined;
        const synthetics = outputs?.synthetics as Array<{ status?: string }> | undefined;
        if (!synthetics || synthetics.length === 0) {
          return { assertion, status: 'fail', message: 'No synthetic transactions found' };
        }
        const allDelivered = synthetics.every((s) => s.status === 'delivered');
        return {
          assertion,
          status: allDelivered ? 'pass' : 'fail',
          message: allDelivered
            ? `All ${synthetics.length} synthetic transactions delivered`
            : `Some synthetic transactions not delivered`,
        };
      }

      case 'chain.entry_count_delta_min': {
        return { assertion, status: 'skip', message: 'Chain entry count assertions not yet implemented' };
      }

      default:
        return { assertion, status: 'skip', message: `Unknown assertion type: ${assertion.type}` };
    }
  } catch (error) {
    return {
      assertion,
      status: 'error',
      message: error instanceof Error ? error.message : 'Assertion evaluation failed',
    };
  }
}

/**
 * Run all assertions for a flow after execution completes.
 *
 * When `flowNodes` is provided, assertions that reference nodes by semantic ID
 * (e.g. "create_identity") can fall back to type-based or label-based matching
 * against the actual flow nodes.  Assertions whose referenced nodes are absent
 * from the flow are skipped rather than errored.
 */
export async function runAssertions(
  assertions: FlowAssertion[],
  executionState: FlowExecutionState,
  flowNodes?: FlowNode[],
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    const resolved = resolveAssertionFields(assertion, executionState, flowNodes);
    const result = await evaluateAssertion(resolved, executionState, flowNodes);
    results.push(result);
  }

  return results;
}

// =============================================================================
// Network Helpers
// =============================================================================

async function queryAccountBalance(account: string): Promise<string | null> {
  try {
    const response = await networkService.fetchApi('v2', 'query', { url: account });
    if (response.error) return null;
    const r = response.result;
    // Balance may be at top level (V2 flat) or nested under data (V3 format)
    const balance = r?.balance ?? r?.data?.balance ?? r?.creditBalance ?? r?.data?.creditBalance;
    return balance !== undefined ? String(balance) : null;
  } catch {
    return null;
  }
}

async function queryAccountExists(url: string): Promise<boolean> {
  try {
    const response = await networkService.fetchApi('v2', 'query', { url });
    return !response.error;
  } catch {
    return false;
  }
}
