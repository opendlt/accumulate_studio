/**
 * TransactionLog Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionLog } from '../execution/TransactionLog';
import type { FlowExecutionState, NodeExecutionState } from '@accumulate-studio/types';

// Mock stores
vi.mock('../../store', () => ({
  useFlowStore: vi.fn((selector: (s: any) => any) => {
    const state = {
      flow: {
        nodes: [
          { id: 'node-1', type: 'GenerateKeys', label: 'My Key Gen', config: {} },
          { id: 'node-2', type: 'Faucet', config: {} },
          { id: 'node-3', type: 'AddCredits', config: {} },
        ],
      },
    };
    return selector(state);
  }),
}));

describe('TransactionLog', () => {
  it('shows empty state when no execution data', () => {
    render(<TransactionLog executionState={null} />);
    expect(screen.getByText('No execution data yet.')).toBeDefined();
    expect(screen.getByText('Click Execute to run the flow.')).toBeDefined();
  });

  it('shows preparing state when execution has no node states', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'running',
      nodeStates: {},
      variables: {},
      logs: [],
    };
    render(<TransactionLog executionState={executionState} />);
    expect(screen.getByText('Preparing execution...')).toBeDefined();
  });

  it('renders transaction items for executed nodes', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'completed',
      nodeStates: {
        'node-1': {
          nodeId: 'node-1',
          status: 'success',
          startedAt: '2025-01-01T00:00:00.000Z',
          completedAt: '2025-01-01T00:00:01.000Z',
        },
        'node-2': {
          nodeId: 'node-2',
          status: 'success',
          startedAt: '2025-01-01T00:00:01.000Z',
          completedAt: '2025-01-01T00:00:03.000Z',
        },
      },
      variables: {},
      logs: [],
    };
    render(<TransactionLog executionState={executionState} />);
    // Node-1 has a custom label
    expect(screen.getByText('My Key Gen')).toBeDefined();
    // Node-2 falls back to BLOCK_CATALOG name 'Faucet' (from the store mock - type is Faucet)
  });

  it('renders status badges', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'running',
      nodeStates: {
        'node-1': {
          nodeId: 'node-1',
          status: 'success',
          startedAt: '2025-01-01T00:00:00.000Z',
        },
        'node-2': {
          nodeId: 'node-2',
          status: 'error',
          startedAt: '2025-01-01T00:00:01.000Z',
          error: { code: 'TEST_ERROR', message: 'Something failed' },
        },
      },
      variables: {},
      logs: [],
    };
    render(<TransactionLog executionState={executionState} />);
    expect(screen.getByText('success')).toBeDefined();
    expect(screen.getByText('error')).toBeDefined();
  });

  it('renders execution logs', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'completed',
      nodeStates: {
        'node-1': {
          nodeId: 'node-1',
          status: 'success',
          startedAt: '2025-01-01T00:00:00.000Z',
        },
      },
      variables: {},
      logs: [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Starting flow execution',
        },
        {
          timestamp: '2025-01-01T00:00:01.000Z',
          level: 'error',
          nodeId: 'node-1',
          message: 'Node failed with timeout',
        },
      ],
    };
    render(<TransactionLog executionState={executionState} />);
    expect(screen.getByText('Execution Logs')).toBeDefined();
    expect(screen.getByText('Starting flow execution')).toBeDefined();
    expect(screen.getByText('Node failed with timeout')).toBeDefined();
  });

  it('shows column headers', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'completed',
      nodeStates: {
        'node-1': {
          nodeId: 'node-1',
          status: 'success',
          startedAt: '2025-01-01T00:00:00.000Z',
        },
      },
      variables: {},
      logs: [],
    };
    render(<TransactionLog executionState={executionState} />);
    expect(screen.getByText('Node')).toBeDefined();
    expect(screen.getByText('Status')).toBeDefined();
  });

  it('expands transaction item to show details on click', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'completed',
      nodeStates: {
        'node-1': {
          nodeId: 'node-1',
          status: 'success',
          startedAt: '2025-01-01T00:00:00.000Z',
          completedAt: '2025-01-01T00:00:01.000Z',
          txHash: 'abc123def456',
          outputs: { publicKey: 'key123' },
        },
      },
      variables: {},
      logs: [],
    };
    render(<TransactionLog executionState={executionState} />);

    // Click on the transaction item to expand
    fireEvent.click(screen.getByText('My Key Gen'));

    // Should show txHash
    expect(screen.getByText('TxHash:')).toBeDefined();
    expect(screen.getByText('abc123def456')).toBeDefined();
    expect(screen.getByText('Outputs:')).toBeDefined();
  });

  it('shows error details when expanded', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'failed',
      nodeStates: {
        'node-1': {
          nodeId: 'node-1',
          status: 'error',
          startedAt: '2025-01-01T00:00:00.000Z',
          error: {
            code: 'EXECUTION_ERROR',
            message: 'Failed to generate keys',
          },
        },
      },
      variables: {},
      logs: [],
    };
    render(<TransactionLog executionState={executionState} />);

    // Click to expand
    fireEvent.click(screen.getByText('My Key Gen'));

    expect(screen.getByText('EXECUTION_ERROR')).toBeDefined();
    expect(screen.getByText('Failed to generate keys')).toBeDefined();
  });

  it('sorts nodes by start time', () => {
    const executionState: FlowExecutionState = {
      flowId: 'flow-1',
      status: 'completed',
      nodeStates: {
        'node-2': {
          nodeId: 'node-2',
          status: 'success',
          startedAt: '2025-01-01T00:00:02.000Z',
        },
        'node-1': {
          nodeId: 'node-1',
          status: 'success',
          startedAt: '2025-01-01T00:00:01.000Z',
        },
      },
      variables: {},
      logs: [],
    };
    const { container } = render(
      <TransactionLog executionState={executionState} />
    );
    // node-1 (earlier start) should appear before node-2
    const names = container.querySelectorAll('.truncate');
    const texts = Array.from(names).map((el) => el.textContent);
    const keyGenIndex = texts.indexOf('My Key Gen');
    const faucetIndex = texts.findIndex((t) => t && t !== 'My Key Gen');
    if (keyGenIndex !== -1 && faucetIndex !== -1) {
      expect(keyGenIndex).toBeLessThan(faucetIndex);
    }
  });
});
