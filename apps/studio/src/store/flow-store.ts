import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  Flow,
  FlowNode,
  FlowConnection,
  FlowVariable,
  FlowExecutionState,
  NodeExecutionState,
  ExecutionLog,
} from '@accumulate-studio/types';
import { createEmptyFlow, generateNodeId, generateConnectionId } from '@accumulate-studio/types';
import type { BlockType, BlockConfig } from '@accumulate-studio/types';
import { analyzeFlow, computePrerequisitePositions } from '../services/prerequisite-engine';
import type {
  FlowValidationResult,
  NodeValidationResult,
  NodeValidationSeverity,
} from '../services/prerequisite-engine';

// =============================================================================
// Store State Types
// =============================================================================

interface FlowState {
  // Current flow
  flow: Flow;

  // Selection state
  selectedNodeIds: string[];
  selectedConnectionIds: string[];

  // Execution state
  execution: FlowExecutionState | null;

  // Prerequisite validation
  validationResult: FlowValidationResult | null;

  // UI state
  isDragging: boolean;
  draggedBlockType: BlockType | null;

  // History for undo/redo
  past: Flow[];
  future: Flow[];
}

interface FlowActions {
  // Flow management
  newFlow: (name?: string) => void;
  clearCanvas: () => void;
  loadFlow: (flow: Flow) => void;
  setFlowName: (name: string) => void;
  setFlowDescription: (description: string) => void;

  // Node operations
  addNode: (type: BlockType, position: { x: number; y: number }, config?: BlockConfig) => string;
  updateNode: (nodeId: string, updates: Partial<FlowNode>) => void;
  updateNodeConfig: (nodeId: string, config: BlockConfig) => void;
  removeNode: (nodeId: string) => void;
  removeNodes: (nodeIds: string[]) => void;

  // Connection operations
  addConnection: (
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string
  ) => string | null;
  removeConnection: (connectionId: string) => void;
  removeConnections: (connectionIds: string[]) => void;

  // Variable operations
  addVariable: (variable: FlowVariable) => void;
  updateVariable: (name: string, updates: Partial<FlowVariable>) => void;
  removeVariable: (name: string) => void;

  // Selection
  selectNode: (nodeId: string, multi?: boolean) => void;
  selectConnection: (connectionId: string, multi?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Drag state
  setDragging: (isDragging: boolean, blockType?: BlockType | null) => void;

  // Execution
  startExecution: () => void;
  updateNodeExecution: (nodeId: string, state: Partial<NodeExecutionState>) => void;
  addExecutionLog: (log: Omit<ExecutionLog, 'timestamp'>) => void;
  completeExecution: (status: 'completed' | 'failed') => void;
  resetExecution: () => void;

  // Prerequisite chain insertion
  insertPrerequisiteChain: (
    recipe: BlockType[],
    targetNodeId: string,
    targetPosition: { x: number; y: number },
    attachToNodeId?: string | null,
    attachmentPosition?: { x: number; y: number } | null
  ) => void;

  // History
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: FlowState = {
  flow: createEmptyFlow('Untitled Flow'),
  selectedNodeIds: [],
  selectedConnectionIds: [],
  execution: null,
  validationResult: null,
  isDragging: false,
  draggedBlockType: null,
  past: [],
  future: [],
};

// Module-scoped debounce timer for auto-validation
let validationTimer: ReturnType<typeof setTimeout> | null = null;

// =============================================================================
// Store Implementation
// =============================================================================

export const useFlowStore = create<FlowState & FlowActions>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      // Flow management
      newFlow: (name = 'Untitled Flow') => {
        set((state) => {
          state.flow = createEmptyFlow(name);
          state.selectedNodeIds = [];
          state.selectedConnectionIds = [];
          state.execution = null;
          state.past = [];
          state.future = [];
        });
      },

      clearCanvas: () => {
        get().saveToHistory();
        set((state) => {
          state.flow.nodes = [];
          state.flow.connections = [];
          state.selectedNodeIds = [];
          state.selectedConnectionIds = [];
          state.execution = null;
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      loadFlow: (flow) => {
        set((state) => {
          state.flow = flow;
          state.selectedNodeIds = [];
          state.selectedConnectionIds = [];
          state.execution = null;
          state.past = [];
          state.future = [];
        });
      },

      setFlowName: (name) => {
        get().saveToHistory();
        set((state) => {
          state.flow.name = name;
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      setFlowDescription: (description) => {
        get().saveToHistory();
        set((state) => {
          state.flow.description = description;
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      // Node operations
      addNode: (type, position, config) => {
        const nodeId = generateNodeId();
        get().saveToHistory();
        set((state) => {
          const newNode: FlowNode = {
            id: nodeId,
            type,
            position,
            config: config ?? ({} as BlockConfig),
          };
          state.flow.nodes.push(newNode);
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
        return nodeId;
      },

      updateNode: (nodeId, updates) => {
        get().saveToHistory();
        set((state) => {
          const nodeIndex = state.flow.nodes.findIndex((n) => n.id === nodeId);
          if (nodeIndex !== -1) {
            state.flow.nodes[nodeIndex] = {
              ...state.flow.nodes[nodeIndex],
              ...updates,
            };
            state.flow.metadata = {
              ...state.flow.metadata,
              updatedAt: new Date().toISOString(),
            };
          }
        });
      },

      updateNodeConfig: (nodeId, config) => {
        get().saveToHistory();
        set((state) => {
          const nodeIndex = state.flow.nodes.findIndex((n) => n.id === nodeId);
          if (nodeIndex !== -1) {
            state.flow.nodes[nodeIndex].config = config;
            state.flow.metadata = {
              ...state.flow.metadata,
              updatedAt: new Date().toISOString(),
            };
          }
        });
      },

      removeNode: (nodeId) => {
        get().saveToHistory();
        set((state) => {
          state.flow.nodes = state.flow.nodes.filter((n) => n.id !== nodeId);
          state.flow.connections = state.flow.connections.filter(
            (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
          );
          state.selectedNodeIds = state.selectedNodeIds.filter((id) => id !== nodeId);
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      removeNodes: (nodeIds) => {
        get().saveToHistory();
        set((state) => {
          const nodeIdSet = new Set(nodeIds);
          state.flow.nodes = state.flow.nodes.filter((n) => !nodeIdSet.has(n.id));
          state.flow.connections = state.flow.connections.filter(
            (c) => !nodeIdSet.has(c.sourceNodeId) && !nodeIdSet.has(c.targetNodeId)
          );
          state.selectedNodeIds = state.selectedNodeIds.filter((id) => !nodeIdSet.has(id));
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      // Connection operations
      addConnection: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
        // Validate connection doesn't create a cycle or duplicate
        const { flow } = get();

        // Check for duplicate
        const exists = flow.connections.some(
          (c) =>
            c.sourceNodeId === sourceNodeId &&
            c.sourcePortId === sourcePortId &&
            c.targetNodeId === targetNodeId &&
            c.targetPortId === targetPortId
        );
        if (exists) return null;

        // Check for self-connection
        if (sourceNodeId === targetNodeId) return null;

        const connectionId = generateConnectionId();
        get().saveToHistory();
        set((state) => {
          const newConnection: FlowConnection = {
            id: connectionId,
            sourceNodeId,
            sourcePortId,
            targetNodeId,
            targetPortId,
          };
          state.flow.connections.push(newConnection);
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
        return connectionId;
      },

      removeConnection: (connectionId) => {
        get().saveToHistory();
        set((state) => {
          state.flow.connections = state.flow.connections.filter((c) => c.id !== connectionId);
          state.selectedConnectionIds = state.selectedConnectionIds.filter((id) => id !== connectionId);
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      removeConnections: (connectionIds) => {
        get().saveToHistory();
        set((state) => {
          const connIdSet = new Set(connectionIds);
          state.flow.connections = state.flow.connections.filter((c) => !connIdSet.has(c.id));
          state.selectedConnectionIds = state.selectedConnectionIds.filter((id) => !connIdSet.has(id));
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      // Variable operations
      addVariable: (variable) => {
        get().saveToHistory();
        set((state) => {
          state.flow.variables.push(variable);
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      updateVariable: (name, updates) => {
        get().saveToHistory();
        set((state) => {
          const varIndex = state.flow.variables.findIndex((v) => v.name === name);
          if (varIndex !== -1) {
            state.flow.variables[varIndex] = {
              ...state.flow.variables[varIndex],
              ...updates,
            };
            state.flow.metadata = {
              ...state.flow.metadata,
              updatedAt: new Date().toISOString(),
            };
          }
        });
      },

      removeVariable: (name) => {
        get().saveToHistory();
        set((state) => {
          state.flow.variables = state.flow.variables.filter((v) => v.name !== name);
          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      // Selection
      selectNode: (nodeId, multi = false) => {
        set((state) => {
          if (multi) {
            if (state.selectedNodeIds.includes(nodeId)) {
              state.selectedNodeIds = state.selectedNodeIds.filter((id) => id !== nodeId);
            } else {
              state.selectedNodeIds.push(nodeId);
            }
          } else {
            state.selectedNodeIds = [nodeId];
            state.selectedConnectionIds = [];
          }
        });
      },

      selectConnection: (connectionId, multi = false) => {
        set((state) => {
          if (multi) {
            if (state.selectedConnectionIds.includes(connectionId)) {
              state.selectedConnectionIds = state.selectedConnectionIds.filter((id) => id !== connectionId);
            } else {
              state.selectedConnectionIds.push(connectionId);
            }
          } else {
            state.selectedConnectionIds = [connectionId];
            state.selectedNodeIds = [];
          }
        });
      },

      selectAll: () => {
        set((state) => {
          state.selectedNodeIds = state.flow.nodes.map((n) => n.id);
          state.selectedConnectionIds = state.flow.connections.map((c) => c.id);
        });
      },

      clearSelection: () => {
        set((state) => {
          state.selectedNodeIds = [];
          state.selectedConnectionIds = [];
        });
      },

      // Drag state
      setDragging: (isDragging, blockType = null) => {
        set((state) => {
          state.isDragging = isDragging;
          state.draggedBlockType = blockType;
        });
      },

      // Execution
      startExecution: () => {
        set((state) => {
          // Populate execution variables from flow variable defaults
          const variables: Record<string, unknown> = {};
          for (const v of state.flow.variables) {
            if (v.default !== undefined) {
              variables[v.name] = v.default;
            }
          }
          state.execution = {
            flowId: state.flow.name,
            status: 'running',
            startedAt: new Date().toISOString(),
            nodeStates: {},
            variables,
            logs: [],
          };
          // Initialize all nodes as pending
          for (const node of state.flow.nodes) {
            state.execution.nodeStates[node.id] = {
              nodeId: node.id,
              status: 'pending',
            };
          }
        });
      },

      updateNodeExecution: (nodeId, nodeState) => {
        set((state) => {
          if (state.execution) {
            state.execution.nodeStates[nodeId] = {
              ...state.execution.nodeStates[nodeId],
              ...nodeState,
            };
            if (nodeState.status === 'running') {
              state.execution.currentNodeId = nodeId;
            }
          }
        });
      },

      addExecutionLog: (log) => {
        set((state) => {
          if (state.execution) {
            state.execution.logs.push({
              ...log,
              timestamp: new Date().toISOString(),
            });
          }
        });
      },

      completeExecution: (status) => {
        set((state) => {
          if (state.execution) {
            state.execution.status = status;
            state.execution.completedAt = new Date().toISOString();
            state.execution.currentNodeId = undefined;
          }
        });
      },

      resetExecution: () => {
        set((state) => {
          state.execution = null;
        });
      },

      // Prerequisite chain insertion
      insertPrerequisiteChain: (recipe, targetNodeId, targetPosition, attachToNodeId, attachmentPosition) => {
        if (recipe.length === 0) return;
        get().saveToHistory();

        set((state) => {
          const VERTICAL_GAP = 160;
          const newNodeIds: string[] = [];

          if (attachToNodeId && attachmentPosition) {
            // === Attachment mode: position prereqs BELOW the attachment point ===

            // Create prerequisite nodes below attachment
            for (let i = 0; i < recipe.length; i++) {
              const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const newNode: FlowNode = {
                id: nodeId,
                type: recipe[i],
                position: {
                  x: attachmentPosition.x,
                  y: attachmentPosition.y + (i + 1) * VERTICAL_GAP,
                },
                config: {} as BlockConfig,
              };
              state.flow.nodes.push(newNode);
              newNodeIds.push(nodeId);
            }

            // Reposition target node below the last prerequisite
            const targetNode = state.flow.nodes.find((n) => n.id === targetNodeId);
            if (targetNode) {
              targetNode.position = {
                x: attachmentPosition.x,
                y: attachmentPosition.y + (recipe.length + 1) * VERTICAL_GAP,
              };
            }

            // Remove any existing direct connection from attachToNodeId to targetNodeId
            state.flow.connections = state.flow.connections.filter(
              (c) => !(c.sourceNodeId === attachToNodeId && c.targetNodeId === targetNodeId)
            );

            // Connect: attachmentNode → prereq[0]
            const firstConnId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_attach`;
            state.flow.connections.push({
              id: firstConnId,
              sourceNodeId: attachToNodeId,
              sourcePortId: 'output',
              targetNodeId: newNodeIds[0],
              targetPortId: 'input',
            });

            // Connect prerequisite nodes in sequence
            for (let i = 0; i < newNodeIds.length - 1; i++) {
              const connId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}`;
              state.flow.connections.push({
                id: connId,
                sourceNodeId: newNodeIds[i],
                sourcePortId: 'output',
                targetNodeId: newNodeIds[i + 1],
                targetPortId: 'input',
              });
            }

            // Connect last prereq → target
            const lastConnId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_last`;
            state.flow.connections.push({
              id: lastConnId,
              sourceNodeId: newNodeIds[newNodeIds.length - 1],
              sourcePortId: 'output',
              targetNodeId,
              targetPortId: 'input',
            });
          } else {
            // === Original mode: stack above target, no upstream connection ===
            const positions = computePrerequisitePositions(recipe, targetPosition);

            for (const { type, position } of positions) {
              const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const newNode: FlowNode = {
                id: nodeId,
                type,
                position,
                config: {} as BlockConfig,
              };
              state.flow.nodes.push(newNode);
              newNodeIds.push(nodeId);
            }

            // Connect prerequisite nodes in sequence
            for (let i = 0; i < newNodeIds.length - 1; i++) {
              const connId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}`;
              state.flow.connections.push({
                id: connId,
                sourceNodeId: newNodeIds[i],
                sourcePortId: 'output',
                targetNodeId: newNodeIds[i + 1],
                targetPortId: 'input',
              });
            }

            // Connect last prerequisite to target node
            if (newNodeIds.length > 0) {
              const connId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_last`;
              state.flow.connections.push({
                id: connId,
                sourceNodeId: newNodeIds[newNodeIds.length - 1],
                sourcePortId: 'output',
                targetNodeId,
                targetPortId: 'input',
              });
            }
          }

          state.flow.metadata = {
            ...state.flow.metadata,
            updatedAt: new Date().toISOString(),
          };
        });
      },

      // History
      undo: () => {
        set((state) => {
          if (state.past.length > 0) {
            const previous = state.past[state.past.length - 1];
            state.future.unshift(state.flow);
            state.flow = previous;
            state.past.pop();
          }
        });
      },

      redo: () => {
        set((state) => {
          if (state.future.length > 0) {
            const next = state.future[0];
            state.past.push(state.flow);
            state.flow = next;
            state.future.shift();
          }
        });
      },

      saveToHistory: () => {
        set((state) => {
          // Deep clone current flow
          const snapshot = JSON.parse(JSON.stringify(state.flow));
          state.past.push(snapshot);
          // Limit history size
          if (state.past.length > 50) {
            state.past.shift();
          }
          // Clear redo stack on new action
          state.future = [];
        });
      },
    })),
    {
      name: 'accumulate-studio-flow',
      partialize: (state) => ({
        flow: state.flow,
      }),
    }
  )
);

// =============================================================================
// Debounced Auto-Validation
// =============================================================================

let lastFlowRef: Flow | null = null;

useFlowStore.subscribe((state) => {
  if (state.flow !== lastFlowRef) {
    lastFlowRef = state.flow;
    if (validationTimer) clearTimeout(validationTimer);
    validationTimer = setTimeout(() => {
      const result = analyzeFlow(state.flow);
      useFlowStore.setState({ validationResult: result });
    }, 300);
  }
});

// Run initial validation
setTimeout(() => {
  const result = analyzeFlow(useFlowStore.getState().flow);
  useFlowStore.setState({ validationResult: result });
}, 0);

// =============================================================================
// Selectors
// =============================================================================

export const selectSelectedNodes = (state: FlowState & FlowActions) =>
  state.flow.nodes.filter((n) => state.selectedNodeIds.includes(n.id));

export const selectSelectedConnections = (state: FlowState & FlowActions) =>
  state.flow.connections.filter((c) => state.selectedConnectionIds.includes(c.id));

export const selectNodeById = (nodeId: string) => (state: FlowState & FlowActions) =>
  state.flow.nodes.find((n) => n.id === nodeId);

export const selectConnectionById = (connectionId: string) => (state: FlowState & FlowActions) =>
  state.flow.connections.find((c) => c.id === connectionId);

export const selectNodeExecutionState = (nodeId: string) => (state: FlowState & FlowActions) =>
  state.execution?.nodeStates[nodeId];

export const selectCanUndo = (state: FlowState & FlowActions) => state.past.length > 0;
export const selectCanRedo = (state: FlowState & FlowActions) => state.future.length > 0;

// Prerequisite validation selectors
export const selectNodeValidation =
  (nodeId: string) =>
  (state: FlowState & FlowActions): NodeValidationResult | null =>
    state.validationResult?.nodeResults[nodeId] ?? null;

export const selectFlowValidationSeverity = (state: FlowState & FlowActions): NodeValidationSeverity =>
  state.validationResult?.severity ?? 'valid';

export const selectTotalCreditCost = (state: FlowState & FlowActions): number =>
  state.validationResult?.totalCreditCost ?? 0;
