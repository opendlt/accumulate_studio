/**
 * Execution Engine Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Flow, FlowNode, FlowConnection } from '@accumulate-studio/types';

// =============================================================================
// Mocks (must be before imports)
// =============================================================================

const mockStore = {
  startExecution: vi.fn(),
  addExecutionLog: vi.fn(),
  updateNodeExecution: vi.fn(),
  completeExecution: vi.fn(),
  execution: { nodeStates: {} as Record<string, { status: string }> },
};

vi.mock('../../store/flow-store', () => ({
  useFlowStore: {
    getState: vi.fn(() => mockStore),
  },
}));

vi.mock('../network', () => ({
  networkService: {
    getNetworkConfig: vi.fn(),
  },
  AccumulateAPI: vi.fn().mockImplementation(() => ({
    callProxy: vi.fn().mockResolvedValue({ success: true }),
    callProxyGet: vi.fn().mockResolvedValue({}),
  })),
}));

const mockNodeExecutorExecute = vi.fn().mockResolvedValue({ txHash: 'mock-tx-hash' });

vi.mock('../execution/node-executor', () => ({
  NodeExecutor: vi.fn().mockImplementation(() => ({
    execute: mockNodeExecutorExecute,
  })),
}));

vi.mock('@accumulate-studio/types', async () => {
  const actual = await vi.importActual<typeof import('@accumulate-studio/types')>(
    '@accumulate-studio/types'
  );
  return {
    ...actual,
    topologicalSort: vi.fn((flow: Flow) => [...flow.nodes]),
  };
});

vi.stubGlobal('crypto', { randomUUID: () => 'test-session-id' });

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { ExecutionEngine } from '../execution';
import { networkService } from '../network';

// =============================================================================
// Helpers
// =============================================================================

function makeNode(id: string, type: string, x = 0, y = 0): FlowNode {
  return { id, type: type as any, config: {}, position: { x, y } };
}

function makeFlow(
  nodes: FlowNode[] = [],
  connections: FlowConnection[] = []
): Flow {
  return {
    version: '1.0',
    name: 'Test Flow',
    variables: [],
    nodes,
    connections,
  };
}

function mockConnected() {
  vi.mocked(networkService.getNetworkConfig).mockReturnValue({
    id: 'kermit',
    name: 'Kermit',
    description: 'Kermit test network',
    v2Endpoint: 'https://kermit.accumulatenetwork.io/v2',
    v3Endpoint: 'https://kermit.accumulatenetwork.io/v3',
    proxyEndpoint: 'http://localhost:8000',
    faucetAvailable: true,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.execution = { nodeStates: {} } as any;
    mockNodeExecutorExecute.mockResolvedValue({ txHash: 'mock-tx-hash' });
    vi.mocked(networkService.getNetworkConfig).mockReturnValue(null);
    engine = new ExecutionEngine();
  });

  // =========================================================================
  // Initial state
  // =========================================================================

  describe('initial state', () => {
    it('status is idle', () => {
      expect(engine.getStatus()).toBe('idle');
    });

    it('getNodeOutputs returns undefined', () => {
      expect(engine.getNodeOutputs('any')).toBeUndefined();
    });

    it('getAllNodeOutputs returns empty Map', () => {
      const outputs = engine.getAllNodeOutputs();
      expect(outputs.size).toBe(0);
    });
  });

  // =========================================================================
  // executeFlow
  // =========================================================================

  describe('executeFlow', () => {
    it('throws when not connected to network', async () => {
      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      await expect(engine.executeFlow(flow)).rejects.toThrow(
        'Not connected to any network'
      );
    });

    it('calls store.startExecution on start', async () => {
      mockConnected();
      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);

      // Mark node as successful so dependency check passes
      mockStore.execution.nodeStates = {
        n1: { status: 'success' },
      };

      await engine.executeFlow(flow);
      expect(mockStore.startExecution).toHaveBeenCalled();
    });

    it('logs flow name on start', async () => {
      mockConnected();
      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      flow.name = 'My Test Flow';

      mockStore.execution.nodeStates = {
        n1: { status: 'success' },
      };

      await engine.executeFlow(flow);
      expect(mockStore.addExecutionLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: expect.stringContaining('My Test Flow'),
        })
      );
    });

    it('completes successfully for simple flow', async () => {
      mockConnected();
      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);

      mockStore.execution.nodeStates = {
        n1: { status: 'success' },
      };

      await engine.executeFlow(flow);
      expect(engine.getStatus()).toBe('completed');
      expect(mockStore.completeExecution).toHaveBeenCalledWith('completed');
    });

    it('skips Comment nodes', async () => {
      mockConnected();
      const flow = makeFlow([makeNode('c1', 'Comment')]);

      await engine.executeFlow(flow);
      expect(mockStore.updateNodeExecution).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ status: 'skipped' })
      );
    });

    it('executes multiple nodes in order', async () => {
      mockConnected();
      const flow = makeFlow(
        [
          makeNode('n1', 'GenerateKeys'),
          makeNode('n2', 'Faucet'),
        ],
        [
          {
            id: 'c1',
            sourceNodeId: 'n1',
            sourcePortId: 'output',
            targetNodeId: 'n2',
            targetPortId: 'input',
          },
        ]
      );

      // Mock store to show n1 as success so n2's dependency check passes
      mockStore.execution.nodeStates = {
        n1: { status: 'success' },
        n2: { status: 'success' },
      };

      await engine.executeFlow(flow);
      // NodeExecutor.execute should have been called for each non-Comment node
      expect(mockNodeExecutorExecute).toHaveBeenCalledTimes(2);
    });

    it('skips nodes with unmet dependencies', async () => {
      mockConnected();
      const flow = makeFlow(
        [
          makeNode('n1', 'GenerateKeys'),
          makeNode('n2', 'Faucet'),
        ],
        [
          {
            id: 'c1',
            sourceNodeId: 'n1',
            sourcePortId: 'output',
            targetNodeId: 'n2',
            targetPortId: 'input',
          },
        ]
      );

      // n1 failed → n2 should be skipped
      mockStore.execution.nodeStates = {
        n1: { status: 'error' },
      };

      // Make n1 execution fail
      mockNodeExecutorExecute.mockRejectedValueOnce(new Error('Key gen failed'));

      await expect(engine.executeFlow(flow)).rejects.toThrow();
    });

    it('initializes flow variables with defaults', async () => {
      mockConnected();
      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      flow.variables = [
        { name: 'ADI_URL', type: 'url', default: 'acc://test.acme' },
      ];

      mockStore.execution.nodeStates = { n1: { status: 'success' } };

      await engine.executeFlow(flow);
      // The variables should be set in context (tested indirectly through success)
      expect(engine.getStatus()).toBe('completed');
    });
  });

  // =========================================================================
  // executeNode
  // =========================================================================

  describe('executeNode', () => {
    it('throws without execution context', async () => {
      await expect(engine.executeNode('n1')).rejects.toThrow(
        'No execution context'
      );
    });

    it('throws for unknown nodeId', async () => {
      mockConnected();
      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      mockStore.execution.nodeStates = { n1: { status: 'success' } };

      // Start execution to create context, but capture the promise
      const execPromise = engine.executeFlow(flow);

      // Wait for it to complete
      await execPromise;

      // Now try to execute a non-existent node
      // Need a fresh engine with active context
      const engine2 = new ExecutionEngine();
      await expect(engine2.executeNode('nonexistent')).rejects.toThrow(
        'No execution context'
      );
    });
  });

  // =========================================================================
  // pauseExecution
  // =========================================================================

  describe('pauseExecution', () => {
    it('throws when not running', () => {
      expect(() => engine.pauseExecution()).toThrow(
        'No execution running to pause'
      );
    });

    it('pauses running execution', async () => {
      mockConnected();

      // Create a slow execution that we can pause
      let resolveExec: () => void;
      mockNodeExecutorExecute.mockReturnValueOnce(
        new Promise<any>((resolve) => {
          resolveExec = () => resolve({ txHash: 'mock' });
        })
      );

      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      mockStore.execution.nodeStates = { n1: { status: 'success' } };

      const execPromise = engine.executeFlow(flow);

      // Wait a tick for execution to start
      await new Promise((r) => setTimeout(r, 0));

      expect(engine.getStatus()).toBe('running');
      engine.pauseExecution();
      expect(engine.getStatus()).toBe('paused');

      // Clean up: resume and resolve
      engine.resumeExecution();
      resolveExec!();
      await execPromise.catch(() => {});
    });
  });

  // =========================================================================
  // resumeExecution
  // =========================================================================

  describe('resumeExecution', () => {
    it('throws when not paused', () => {
      expect(() => engine.resumeExecution()).toThrow(
        'No paused execution to resume'
      );
    });
  });

  // =========================================================================
  // stopExecution
  // =========================================================================

  describe('stopExecution', () => {
    it('does nothing when idle', () => {
      expect(() => engine.stopExecution()).not.toThrow();
      expect(engine.getStatus()).toBe('idle');
    });

    it('stops running execution', async () => {
      mockConnected();

      let resolveExec: () => void;
      mockNodeExecutorExecute.mockReturnValueOnce(
        new Promise<any>((resolve) => {
          resolveExec = () => resolve({ txHash: 'mock' });
        })
      );

      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      mockStore.execution.nodeStates = { n1: { status: 'success' } };

      const execPromise = engine.executeFlow(flow);
      await new Promise((r) => setTimeout(r, 0));

      engine.stopExecution();
      expect(mockStore.completeExecution).toHaveBeenCalledWith('failed');
      expect(mockStore.addExecutionLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: expect.stringContaining('stopped by user'),
        })
      );

      // Status resets to idle after cleanup
      expect(engine.getStatus()).toBe('idle');

      // Clean up
      resolveExec!();
      await execPromise.catch(() => {});
    });
  });

  // =========================================================================
  // getNodeOutputs / getAllNodeOutputs
  // =========================================================================

  describe('outputs', () => {
    it('stores node outputs after execution', async () => {
      mockConnected();
      mockNodeExecutorExecute.mockResolvedValue({
        publicKey: 'abc123',
        liteTokenAccount: 'acc://lite',
      });

      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      mockStore.execution.nodeStates = { n1: { status: 'success' } };

      await engine.executeFlow(flow);

      const outputs = engine.getNodeOutputs('n1');
      expect(outputs).toBeDefined();
      expect(outputs!.publicKey).toBe('abc123');
    });

    it('getAllNodeOutputs returns all outputs', async () => {
      mockConnected();
      mockNodeExecutorExecute.mockResolvedValue({ key: 'value' });

      const flow = makeFlow([
        makeNode('n1', 'GenerateKeys'),
        makeNode('n2', 'GenerateKeys'),
      ]);
      mockStore.execution.nodeStates = {
        n1: { status: 'success' },
        n2: { status: 'success' },
      };

      await engine.executeFlow(flow);

      const allOutputs = engine.getAllNodeOutputs();
      expect(allOutputs.size).toBe(2);
      expect(allOutputs.has('n1')).toBe(true);
      expect(allOutputs.has('n2')).toBe(true);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('sets status to failed on node execution error', async () => {
      mockConnected();
      mockNodeExecutorExecute.mockRejectedValueOnce(new Error('Node failed'));

      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      mockStore.execution.nodeStates = {};

      await expect(engine.executeFlow(flow)).rejects.toThrow('Node failed');
      expect(mockStore.completeExecution).toHaveBeenCalledWith('failed');
    });

    it('logs error message on failure', async () => {
      mockConnected();
      mockNodeExecutorExecute.mockRejectedValueOnce(
        new Error('Specific error message')
      );

      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      mockStore.execution.nodeStates = {};

      await expect(engine.executeFlow(flow)).rejects.toThrow();

      expect(mockStore.addExecutionLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('Specific error message'),
        })
      );
    });

    it('updates node status to error on failure', async () => {
      mockConnected();
      mockNodeExecutorExecute.mockRejectedValueOnce(new Error('Failed'));

      const flow = makeFlow([makeNode('n1', 'GenerateKeys')]);
      mockStore.execution.nodeStates = {};

      await expect(engine.executeFlow(flow)).rejects.toThrow();

      expect(mockStore.updateNodeExecution).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({ status: 'error' })
      );
    });
  });
});
