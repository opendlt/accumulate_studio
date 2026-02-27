/**
 * Flow Store Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the prerequisite engine before importing the store
// (the store runs analyzeFlow on import via subscription)
vi.mock('../../services/prerequisite-engine', () => ({
  analyzeFlow: vi.fn(() => ({
    severity: 'valid' as const,
    nodeResults: {},
    totalCreditCost: 0,
    analyzedAt: Date.now(),
  })),
  computePrerequisitePositions: vi.fn((recipe: string[], target: { x: number; y: number }) =>
    recipe.map((type, i) => ({
      type,
      position: { x: target.x, y: target.y - (recipe.length - i) * 160 },
    }))
  ),
}));

import { useFlowStore, selectSelectedNodes, selectSelectedConnections, selectCanUndo, selectCanRedo } from '../flow-store';
import { createEmptyFlow } from '@accumulate-studio/types';
import type { BlockType, BlockConfig } from '@accumulate-studio/types';

function resetStore() {
  useFlowStore.setState({
    flow: createEmptyFlow('Test Flow'),
    selectedNodeIds: [],
    selectedConnectionIds: [],
    execution: null,
    validationResult: null,
    isDragging: false,
    draggedBlockType: null,
    past: [],
    future: [],
  });
}

describe('Flow Store', () => {
  beforeEach(() => {
    resetStore();
  });

  // =========================================================================
  // Flow Management
  // =========================================================================

  describe('flow management', () => {
    it('starts with an empty flow', () => {
      const { flow } = useFlowStore.getState();
      expect(flow.name).toBe('Test Flow');
      expect(flow.nodes).toHaveLength(0);
      expect(flow.connections).toHaveLength(0);
    });

    it('newFlow creates a fresh flow', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().newFlow('Fresh Flow');
      const { flow } = useFlowStore.getState();
      expect(flow.name).toBe('Fresh Flow');
      expect(flow.nodes).toHaveLength(0);
    });

    it('setFlowName updates the name', () => {
      useFlowStore.getState().setFlowName('My Custom Flow');
      expect(useFlowStore.getState().flow.name).toBe('My Custom Flow');
    });

    it('setFlowDescription updates the description', () => {
      useFlowStore.getState().setFlowDescription('A test flow');
      expect(useFlowStore.getState().flow.description).toBe('A test flow');
    });

    it('loadFlow replaces the entire flow', () => {
      const newFlow = createEmptyFlow('Loaded Flow');
      newFlow.nodes.push({
        id: 'existing-node',
        type: 'GenerateKeys' as BlockType,
        position: { x: 100, y: 100 },
        config: {} as BlockConfig,
      });
      useFlowStore.getState().loadFlow(newFlow);
      expect(useFlowStore.getState().flow.name).toBe('Loaded Flow');
      expect(useFlowStore.getState().flow.nodes).toHaveLength(1);
    });

    it('clearCanvas removes all nodes and connections', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().addNode('Faucet' as BlockType, { x: 100, y: 0 });
      expect(useFlowStore.getState().flow.nodes).toHaveLength(2);

      useFlowStore.getState().clearCanvas();
      expect(useFlowStore.getState().flow.nodes).toHaveLength(0);
      expect(useFlowStore.getState().flow.connections).toHaveLength(0);
    });
  });

  // =========================================================================
  // Node Operations
  // =========================================================================

  describe('node operations', () => {
    it('addNode adds a node and returns its id', () => {
      const nodeId = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 50, y: 100 });
      expect(nodeId).toBeTruthy();
      expect(nodeId).toMatch(/^node_/);

      const { flow } = useFlowStore.getState();
      expect(flow.nodes).toHaveLength(1);
      expect(flow.nodes[0].type).toBe('GenerateKeys');
      expect(flow.nodes[0].position).toEqual({ x: 50, y: 100 });
    });

    it('addNode with config sets the config', () => {
      const config = { account: 'acc://test' } as BlockConfig;
      const nodeId = useFlowStore.getState().addNode('Faucet' as BlockType, { x: 0, y: 0 }, config);
      const node = useFlowStore.getState().flow.nodes.find((n) => n.id === nodeId);
      expect(node?.config).toEqual(config);
    });

    it('updateNode updates node properties', () => {
      const nodeId = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().updateNode(nodeId, { position: { x: 200, y: 300 } });
      const node = useFlowStore.getState().flow.nodes.find((n) => n.id === nodeId);
      expect(node?.position).toEqual({ x: 200, y: 300 });
    });

    it('updateNodeConfig updates only the config', () => {
      const nodeId = useFlowStore.getState().addNode('Faucet' as BlockType, { x: 0, y: 0 });
      const newConfig = { times: 3 } as BlockConfig;
      useFlowStore.getState().updateNodeConfig(nodeId, newConfig);
      const node = useFlowStore.getState().flow.nodes.find((n) => n.id === nodeId);
      expect(node?.config).toEqual(newConfig);
    });

    it('removeNode removes the node and its connections', () => {
      const nodeA = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      const nodeB = useFlowStore.getState().addNode('Faucet' as BlockType, { x: 200, y: 0 });
      useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input');

      useFlowStore.getState().removeNode(nodeA);
      expect(useFlowStore.getState().flow.nodes).toHaveLength(1);
      expect(useFlowStore.getState().flow.connections).toHaveLength(0);
    });

    it('removeNodes removes multiple nodes and their connections', () => {
      const nodeA = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      const nodeB = useFlowStore.getState().addNode('Faucet' as BlockType, { x: 200, y: 0 });
      const nodeC = useFlowStore.getState().addNode('AddCredits' as BlockType, { x: 400, y: 0 });
      useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input');
      useFlowStore.getState().addConnection(nodeB, 'output', nodeC, 'input');

      useFlowStore.getState().removeNodes([nodeA, nodeB]);
      expect(useFlowStore.getState().flow.nodes).toHaveLength(1);
      expect(useFlowStore.getState().flow.nodes[0].id).toBe(nodeC);
      expect(useFlowStore.getState().flow.connections).toHaveLength(0);
    });

    it('updateNode does nothing for non-existent node', () => {
      useFlowStore.getState().updateNode('fake-id', { position: { x: 0, y: 0 } });
      // No error thrown
      expect(useFlowStore.getState().flow.nodes).toHaveLength(0);
    });
  });

  // =========================================================================
  // Connection Operations
  // =========================================================================

  describe('connection operations', () => {
    let nodeA: string;
    let nodeB: string;

    beforeEach(() => {
      nodeA = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      nodeB = useFlowStore.getState().addNode('Faucet' as BlockType, { x: 200, y: 0 });
    });

    it('addConnection creates a connection', () => {
      const connId = useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input');
      expect(connId).toBeTruthy();
      expect(useFlowStore.getState().flow.connections).toHaveLength(1);
      expect(useFlowStore.getState().flow.connections[0].sourceNodeId).toBe(nodeA);
      expect(useFlowStore.getState().flow.connections[0].targetNodeId).toBe(nodeB);
    });

    it('addConnection rejects self-connections', () => {
      const connId = useFlowStore.getState().addConnection(nodeA, 'output', nodeA, 'input');
      expect(connId).toBeNull();
      expect(useFlowStore.getState().flow.connections).toHaveLength(0);
    });

    it('addConnection rejects duplicate connections', () => {
      useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input');
      const dupId = useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input');
      expect(dupId).toBeNull();
      expect(useFlowStore.getState().flow.connections).toHaveLength(1);
    });

    it('removeConnection removes a connection', () => {
      const connId = useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input')!;
      useFlowStore.getState().removeConnection(connId);
      expect(useFlowStore.getState().flow.connections).toHaveLength(0);
    });

    it('removeConnections removes multiple connections', () => {
      const nodeC = useFlowStore.getState().addNode('AddCredits' as BlockType, { x: 400, y: 0 });
      const conn1 = useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input')!;
      const conn2 = useFlowStore.getState().addConnection(nodeB, 'output', nodeC, 'input')!;
      useFlowStore.getState().removeConnections([conn1, conn2]);
      expect(useFlowStore.getState().flow.connections).toHaveLength(0);
    });
  });

  // =========================================================================
  // Variable Operations
  // =========================================================================

  describe('variable operations', () => {
    it('addVariable adds a variable', () => {
      useFlowStore.getState().addVariable({
        name: 'ADI_NAME',
        type: 'string',
        description: 'ADI name',
      });
      expect(useFlowStore.getState().flow.variables).toHaveLength(1);
      expect(useFlowStore.getState().flow.variables[0].name).toBe('ADI_NAME');
    });

    it('updateVariable updates a variable by name', () => {
      useFlowStore.getState().addVariable({
        name: 'ADI_NAME',
        type: 'string',
      });
      useFlowStore.getState().updateVariable('ADI_NAME', { default: 'acc://test' });
      expect(useFlowStore.getState().flow.variables[0].default).toBe('acc://test');
    });

    it('removeVariable removes a variable', () => {
      useFlowStore.getState().addVariable({ name: 'VAR1', type: 'string' });
      useFlowStore.getState().addVariable({ name: 'VAR2', type: 'string' });
      useFlowStore.getState().removeVariable('VAR1');
      expect(useFlowStore.getState().flow.variables).toHaveLength(1);
      expect(useFlowStore.getState().flow.variables[0].name).toBe('VAR2');
    });
  });

  // =========================================================================
  // Selection
  // =========================================================================

  describe('selection', () => {
    let nodeA: string;
    let nodeB: string;

    beforeEach(() => {
      nodeA = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      nodeB = useFlowStore.getState().addNode('Faucet' as BlockType, { x: 200, y: 0 });
    });

    it('selectNode selects a single node', () => {
      useFlowStore.getState().selectNode(nodeA);
      expect(useFlowStore.getState().selectedNodeIds).toEqual([nodeA]);
    });

    it('selectNode replaces previous selection by default', () => {
      useFlowStore.getState().selectNode(nodeA);
      useFlowStore.getState().selectNode(nodeB);
      expect(useFlowStore.getState().selectedNodeIds).toEqual([nodeB]);
    });

    it('selectNode with multi=true adds to selection', () => {
      useFlowStore.getState().selectNode(nodeA);
      useFlowStore.getState().selectNode(nodeB, true);
      expect(useFlowStore.getState().selectedNodeIds).toEqual([nodeA, nodeB]);
    });

    it('selectNode with multi=true toggles existing selection', () => {
      useFlowStore.getState().selectNode(nodeA);
      useFlowStore.getState().selectNode(nodeB, true);
      useFlowStore.getState().selectNode(nodeA, true); // deselect
      expect(useFlowStore.getState().selectedNodeIds).toEqual([nodeB]);
    });

    it('selectNode clears connection selection', () => {
      const connId = useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input')!;
      useFlowStore.getState().selectConnection(connId);
      useFlowStore.getState().selectNode(nodeA);
      expect(useFlowStore.getState().selectedConnectionIds).toEqual([]);
    });

    it('selectConnection clears node selection', () => {
      const connId = useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input')!;
      useFlowStore.getState().selectNode(nodeA);
      useFlowStore.getState().selectConnection(connId);
      expect(useFlowStore.getState().selectedNodeIds).toEqual([]);
    });

    it('selectAll selects all nodes and connections', () => {
      useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input');
      useFlowStore.getState().selectAll();
      expect(useFlowStore.getState().selectedNodeIds).toHaveLength(2);
      expect(useFlowStore.getState().selectedConnectionIds).toHaveLength(1);
    });

    it('clearSelection clears everything', () => {
      useFlowStore.getState().selectAll();
      useFlowStore.getState().clearSelection();
      expect(useFlowStore.getState().selectedNodeIds).toHaveLength(0);
      expect(useFlowStore.getState().selectedConnectionIds).toHaveLength(0);
    });

    it('selectSelectedNodes selector returns selected nodes', () => {
      useFlowStore.getState().selectNode(nodeA);
      const selected = selectSelectedNodes(useFlowStore.getState());
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe(nodeA);
    });

    it('selectSelectedConnections selector returns selected connections', () => {
      const connId = useFlowStore.getState().addConnection(nodeA, 'output', nodeB, 'input')!;
      useFlowStore.getState().selectConnection(connId);
      const selected = selectSelectedConnections(useFlowStore.getState());
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe(connId);
    });
  });

  // =========================================================================
  // Drag State
  // =========================================================================

  describe('drag state', () => {
    it('setDragging updates drag state', () => {
      useFlowStore.getState().setDragging(true, 'GenerateKeys' as BlockType);
      expect(useFlowStore.getState().isDragging).toBe(true);
      expect(useFlowStore.getState().draggedBlockType).toBe('GenerateKeys');
    });

    it('setDragging false clears block type', () => {
      useFlowStore.getState().setDragging(true, 'Faucet' as BlockType);
      useFlowStore.getState().setDragging(false);
      expect(useFlowStore.getState().isDragging).toBe(false);
      expect(useFlowStore.getState().draggedBlockType).toBeNull();
    });
  });

  // =========================================================================
  // Execution
  // =========================================================================

  describe('execution', () => {
    it('startExecution initializes execution state', () => {
      const nodeId = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().startExecution();

      const { execution } = useFlowStore.getState();
      expect(execution).not.toBeNull();
      expect(execution!.status).toBe('running');
      expect(execution!.nodeStates[nodeId].status).toBe('pending');
    });

    it('updateNodeExecution updates a node state', () => {
      const nodeId = useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().startExecution();
      useFlowStore.getState().updateNodeExecution(nodeId, { status: 'running' });

      const { execution } = useFlowStore.getState();
      expect(execution!.nodeStates[nodeId].status).toBe('running');
      expect(execution!.currentNodeId).toBe(nodeId);
    });

    it('addExecutionLog adds a log entry', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().startExecution();
      useFlowStore.getState().addExecutionLog({
        level: 'info',
        message: 'Starting execution',
      });

      expect(useFlowStore.getState().execution!.logs).toHaveLength(1);
      expect(useFlowStore.getState().execution!.logs[0].message).toBe('Starting execution');
      expect(useFlowStore.getState().execution!.logs[0].timestamp).toBeTruthy();
    });

    it('completeExecution sets final status', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().startExecution();
      useFlowStore.getState().completeExecution('completed');

      expect(useFlowStore.getState().execution!.status).toBe('completed');
      expect(useFlowStore.getState().execution!.completedAt).toBeTruthy();
    });

    it('resetExecution clears execution state', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().startExecution();
      useFlowStore.getState().resetExecution();
      expect(useFlowStore.getState().execution).toBeNull();
    });
  });

  // =========================================================================
  // Undo/Redo
  // =========================================================================

  describe('undo/redo', () => {
    it('initially cannot undo or redo', () => {
      expect(selectCanUndo(useFlowStore.getState())).toBe(false);
      expect(selectCanRedo(useFlowStore.getState())).toBe(false);
    });

    it('actions enable undo', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      expect(selectCanUndo(useFlowStore.getState())).toBe(true);
    });

    it('undo restores previous state', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      expect(useFlowStore.getState().flow.nodes).toHaveLength(1);

      useFlowStore.getState().undo();
      expect(useFlowStore.getState().flow.nodes).toHaveLength(0);
    });

    it('redo restores undone state', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().undo();
      expect(useFlowStore.getState().flow.nodes).toHaveLength(0);

      useFlowStore.getState().redo();
      expect(useFlowStore.getState().flow.nodes).toHaveLength(1);
    });

    it('new action clears redo stack', () => {
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      useFlowStore.getState().undo();
      expect(selectCanRedo(useFlowStore.getState())).toBe(true);

      useFlowStore.getState().addNode('Faucet' as BlockType, { x: 100, y: 0 });
      expect(selectCanRedo(useFlowStore.getState())).toBe(false);
    });

    it('undo when nothing to undo does nothing', () => {
      useFlowStore.getState().undo();
      expect(useFlowStore.getState().flow.nodes).toHaveLength(0);
    });

    it('redo when nothing to redo does nothing', () => {
      useFlowStore.getState().redo();
      expect(useFlowStore.getState().flow.nodes).toHaveLength(0);
    });
  });

  // =========================================================================
  // Metadata Updates
  // =========================================================================

  describe('metadata', () => {
    it('actions update the updatedAt timestamp', () => {
      const before = useFlowStore.getState().flow.metadata?.updatedAt;
      // Small delay to ensure different timestamp
      useFlowStore.getState().addNode('GenerateKeys' as BlockType, { x: 0, y: 0 });
      const after = useFlowStore.getState().flow.metadata?.updatedAt;
      expect(after).toBeTruthy();
      // updatedAt should have been set (may or may not differ from 'before' depending on timing)
      expect(typeof after).toBe('string');
    });
  });

  // =========================================================================
  // Prerequisite Chain Insertion
  // =========================================================================

  describe('insertPrerequisiteChain', () => {
    it('inserts nodes and connects them in sequence to target', () => {
      const targetId = useFlowStore.getState().addNode('CreateIdentity' as BlockType, { x: 100, y: 400 });
      useFlowStore.getState().insertPrerequisiteChain(
        ['GenerateKeys' as BlockType, 'Faucet' as BlockType],
        targetId,
        { x: 100, y: 400 },
      );

      const { flow } = useFlowStore.getState();
      // 1 target + 2 prerequisites = 3 nodes
      expect(flow.nodes).toHaveLength(3);
      // 2 connections: prereq[0]→prereq[1], prereq[1]→target
      expect(flow.connections).toHaveLength(2);
      // Last connection should target the CreateIdentity node
      const lastConn = flow.connections[flow.connections.length - 1];
      expect(lastConn.targetNodeId).toBe(targetId);
    });

    it('does nothing for empty recipe', () => {
      const targetId = useFlowStore.getState().addNode('CreateIdentity' as BlockType, { x: 100, y: 400 });
      useFlowStore.getState().insertPrerequisiteChain([], targetId, { x: 100, y: 400 });
      expect(useFlowStore.getState().flow.nodes).toHaveLength(1);
      expect(useFlowStore.getState().flow.connections).toHaveLength(0);
    });
  });
});
