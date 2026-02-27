/**
 * Assertion Runner Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAssertions } from '../assertion-runner';
import type { FlowAssertion, FlowExecutionState } from '@accumulate-studio/types';

// Mock network service
vi.mock('../network', () => ({
  networkService: {
    fetchApi: vi.fn(),
  },
}));

import { networkService } from '../network';
const mockFetchApi = vi.mocked(networkService.fetchApi);

function makeExecution(overrides?: Partial<FlowExecutionState>): FlowExecutionState {
  return {
    flowId: 'test-flow',
    status: 'completed',
    startedAt: '2025-01-01T00:00:00Z',
    completedAt: '2025-01-01T00:01:00Z',
    nodeStates: {},
    variables: {},
    logs: [],
    ...overrides,
  };
}

describe('Assertion Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('balance.gte', () => {
    it('passes when balance >= expected', async () => {
      mockFetchApi.mockResolvedValue({
        result: { balance: '1000000' },
      });

      const assertions: FlowAssertion[] = [
        { type: 'balance.gte', account: 'acc://lite-account/ACME', equals: '500000' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('pass');
      expect(results[0].actual).toBe('1000000');
    });

    it('fails when balance < expected', async () => {
      mockFetchApi.mockResolvedValue({
        result: { balance: '100' },
      });

      const assertions: FlowAssertion[] = [
        { type: 'balance.gte', account: 'acc://lite-account/ACME', equals: '500000' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('fail');
    });

    it('returns error when query fails', async () => {
      mockFetchApi.mockResolvedValue({
        error: { code: -1, message: 'not found' },
      });

      const assertions: FlowAssertion[] = [
        { type: 'balance.gte', account: 'acc://lite-account/ACME', equals: '500000' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('error');
    });

    it('skips when missing fields', async () => {
      const assertions: FlowAssertion[] = [
        { type: 'balance.gte' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('skip');
    });
  });

  describe('balance.delta', () => {
    it('returns error when account cannot be queried', async () => {
      const assertions: FlowAssertion[] = [
        { type: 'balance.delta', account: 'acc://test/ACME', delta: '100' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('error');
    });

    it('skips when account or delta is missing', async () => {
      const assertions: FlowAssertion[] = [
        { type: 'balance.delta' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('skip');
    });
  });

  describe('account.exists', () => {
    it('passes when account exists', async () => {
      mockFetchApi.mockResolvedValue({
        result: { type: 'liteTokenAccount', url: 'acc://test' },
      });

      const assertions: FlowAssertion[] = [
        { type: 'account.exists', url: 'acc://test' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('pass');
    });

    it('fails when account does not exist', async () => {
      mockFetchApi.mockResolvedValue({
        error: { code: -1, message: 'not found' },
      });

      const assertions: FlowAssertion[] = [
        { type: 'account.exists', url: 'acc://missing' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('fail');
    });

    it('skips when url missing', async () => {
      const assertions: FlowAssertion[] = [
        { type: 'account.exists' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('skip');
    });
  });

  describe('account.not_exists', () => {
    it('passes when account does not exist', async () => {
      mockFetchApi.mockResolvedValue({
        error: { code: -1, message: 'not found' },
      });

      const assertions: FlowAssertion[] = [
        { type: 'account.not_exists', url: 'acc://missing' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('pass');
    });

    it('fails when account exists', async () => {
      mockFetchApi.mockResolvedValue({
        result: { type: 'liteTokenAccount' },
      });

      const assertions: FlowAssertion[] = [
        { type: 'account.not_exists', url: 'acc://test' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('fail');
    });
  });

  describe('tx.status.equals', () => {
    it('passes when node status matches', async () => {
      const execution = makeExecution({
        nodeStates: {
          'node-1': { nodeId: 'node-1', status: 'success' },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'tx.status.equals', sourceStep: 'node-1', status: 'success' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('pass');
    });

    it('fails when node status does not match', async () => {
      const execution = makeExecution({
        nodeStates: {
          'node-1': { nodeId: 'node-1', status: 'error' },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'tx.status.equals', sourceStep: 'node-1', status: 'success' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('fail');
      expect(results[0].actual).toBe('error');
    });

    it('skips when node not found in flow', async () => {
      const assertions: FlowAssertion[] = [
        { type: 'tx.status.equals', sourceStep: 'missing', status: 'success' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('skip');
    });

    it('skips when missing fields', async () => {
      const assertions: FlowAssertion[] = [
        { type: 'tx.status.equals' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('skip');
    });
  });

  describe('receipt.verified', () => {
    it('passes when receipt is verified', async () => {
      const execution = makeExecution({
        nodeStates: {
          'node-1': {
            nodeId: 'node-1',
            status: 'success',
            receipt: { txHash: 'abc', verified: true },
          },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'receipt.verified', sourceStep: 'node-1' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('pass');
    });

    it('fails when receipt not verified', async () => {
      const execution = makeExecution({
        nodeStates: {
          'node-1': {
            nodeId: 'node-1',
            status: 'success',
            receipt: { txHash: 'abc', verified: false },
          },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'receipt.verified', sourceStep: 'node-1' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('fail');
    });
  });

  describe('synthetic.delivered', () => {
    it('passes when all synthetics delivered', async () => {
      const execution = makeExecution({
        nodeStates: {
          'node-1': {
            nodeId: 'node-1',
            status: 'success',
            outputs: {
              synthetics: [
                { type: 'deposit', status: 'delivered' },
                { type: 'deposit', status: 'delivered' },
              ],
            },
          },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'synthetic.delivered', sourceStep: 'node-1' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('pass');
    });

    it('fails when some synthetics not delivered', async () => {
      const execution = makeExecution({
        nodeStates: {
          'node-1': {
            nodeId: 'node-1',
            status: 'success',
            outputs: {
              synthetics: [
                { type: 'deposit', status: 'delivered' },
                { type: 'deposit', status: 'pending' },
              ],
            },
          },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'synthetic.delivered', sourceStep: 'node-1' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('fail');
    });

    it('fails when no synthetics found', async () => {
      const execution = makeExecution({
        nodeStates: {
          'node-1': {
            nodeId: 'node-1',
            status: 'success',
            outputs: {},
          },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'synthetic.delivered', sourceStep: 'node-1' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('fail');
    });
  });

  describe('chain.entry_count_delta_min', () => {
    it('skips (not yet implemented)', async () => {
      const assertions: FlowAssertion[] = [
        { type: 'chain.entry_count_delta_min', account: 'acc://test', chain: 'main', minDelta: 1 },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('skip');
    });
  });

  describe('unknown type', () => {
    it('skips unknown assertion types', async () => {
      const assertions = [
        { type: 'unknown.type' as FlowAssertion['type'] },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('skip');
    });
  });

  describe('multiple assertions', () => {
    it('evaluates all assertions in order', async () => {
      mockFetchApi.mockResolvedValue({
        result: { balance: '1000000' },
      });

      const execution = makeExecution({
        nodeStates: {
          'node-1': { nodeId: 'node-1', status: 'success' },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'balance.gte', account: 'acc://test/ACME', equals: '500' },
        { type: 'tx.status.equals', sourceStep: 'node-1', status: 'success' },
        { type: 'tx.status.equals', sourceStep: 'node-1', status: 'error' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('pass');
      expect(results[1].status).toBe('pass');
      expect(results[2].status).toBe('fail');
    });
  });

  describe('template resolution', () => {
    it('resolves {{nodeId.outputKey}} in assertion fields', async () => {
      mockFetchApi.mockResolvedValue({
        result: { type: 'liteTokenAccount', url: 'acc://real-account/ACME' },
      });

      const execution = makeExecution({
        nodeStates: {
          generate_keys: {
            nodeId: 'generate_keys',
            status: 'success',
            outputs: { liteTokenAccount: 'acc://real-account/ACME' },
          },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'account.exists', url: '{{generate_keys.liteTokenAccount}}' },
      ];

      const results = await runAssertions(assertions, execution);
      expect(results[0].status).toBe('pass');
      // Verify the resolved URL was used in the query
      expect(mockFetchApi).toHaveBeenCalledWith('v2', 'query', { url: 'acc://real-account/ACME' });
    });

    it('leaves unresolvable templates as-is', async () => {
      mockFetchApi.mockRejectedValue(new Error('Invalid URL'));

      const assertions: FlowAssertion[] = [
        { type: 'account.exists', url: '{{nonexistent.output}}' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      // The unresolved template URL causes the query to fail
      expect(results[0].status).toBe('fail');
      expect(mockFetchApi).toHaveBeenCalledWith('v2', 'query', { url: '{{nonexistent.output}}' });
    });
  });

  describe('error handling', () => {
    it('catches thrown errors during evaluation', async () => {
      mockFetchApi.mockRejectedValue(new Error('Network error'));

      const assertions: FlowAssertion[] = [
        { type: 'balance.gte', account: 'acc://test/ACME', equals: '100' },
      ];

      const results = await runAssertions(assertions, makeExecution());
      expect(results[0].status).toBe('error');
      expect(results[0].message).toContain('query balance');
    });
  });

  describe('node ID resolution with flowNodes', () => {
    const flowNodes = [
      { id: 'node_abc123', type: 'CreateIdentity' as const, label: 'Create ADI', config: {}, position: { x: 0, y: 0 } },
      { id: 'node_def456', type: 'GenerateKeys' as const, label: 'Generate Keys', config: {}, position: { x: 0, y: 0 } },
      { id: 'node_ghi789', type: 'AddCredits' as const, label: 'Add Credits', config: {}, position: { x: 0, y: 0 } },
    ];

    it('resolves semantic ID to actual node by type match', async () => {
      const execution = makeExecution({
        nodeStates: {
          node_abc123: { nodeId: 'node_abc123', status: 'success' },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'tx.status.equals', sourceStep: 'create_identity', status: 'success' },
      ];

      const results = await runAssertions(assertions, execution, flowNodes);
      expect(results[0].status).toBe('pass');
    });

    it('resolves semantic ID to actual node by label match', async () => {
      const execution = makeExecution({
        nodeStates: {
          node_ghi789: { nodeId: 'node_ghi789', status: 'success' },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'tx.status.equals', sourceStep: 'add_credits', status: 'success' },
      ];

      const results = await runAssertions(assertions, execution, flowNodes);
      expect(results[0].status).toBe('pass');
    });

    it('resolves template variables via type-matched node', async () => {
      mockFetchApi.mockResolvedValue({
        result: { type: 'liteTokenAccount', url: 'acc://real/ACME' },
      });

      const execution = makeExecution({
        nodeStates: {
          node_def456: {
            nodeId: 'node_def456',
            status: 'success',
            outputs: { liteTokenAccount: 'acc://real/ACME' },
          },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'account.exists', url: '{{generate_keys.liteTokenAccount}}' },
      ];

      const results = await runAssertions(assertions, execution, flowNodes);
      expect(results[0].status).toBe('pass');
      expect(mockFetchApi).toHaveBeenCalledWith('v2', 'query', { url: 'acc://real/ACME' });
    });

    it('skips assertions for nodes absent from the flow', async () => {
      const execution = makeExecution({
        nodeStates: {
          node_abc123: { nodeId: 'node_abc123', status: 'success' },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'receipt.verified', sourceStep: 'create_key_book' },
        { type: 'tx.status.equals', sourceStep: 'set_threshold', status: 'success' },
      ];

      const results = await runAssertions(assertions, execution, flowNodes);
      expect(results[0].status).toBe('skip');
      expect(results[0].message).toContain('not found in flow');
      expect(results[1].status).toBe('skip');
      expect(results[1].message).toContain('not found in flow');
    });

    it('prefers exact ID match over type match', async () => {
      const execution = makeExecution({
        nodeStates: {
          create_identity: { nodeId: 'create_identity', status: 'success' },
          node_abc123: { nodeId: 'node_abc123', status: 'error' },
        },
      });

      const assertions: FlowAssertion[] = [
        { type: 'tx.status.equals', sourceStep: 'create_identity', status: 'success' },
      ];

      const results = await runAssertions(assertions, execution, flowNodes);
      // Should use exact match (status: success), not type match (status: error)
      expect(results[0].status).toBe('pass');
    });
  });
});
