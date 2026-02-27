import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  BackgroundVariant,
  type ReactFlowInstance,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LayoutGrid } from 'lucide-react';
import { BlockNode } from './BlockNode';
import { useFlowStore, useUIStore } from '../../store';
import { BLOCK_CATALOG, type BlockType } from '@accumulate-studio/types';
import { getPrerequisiteRecipe, findBestAttachmentNode } from '../../services/prerequisite-engine';
import { cn } from '../ui';

// Custom node types
const nodeTypes = {
  block: BlockNode,
};

// Convert store flow to React Flow nodes
function toReactFlowNodes(flow: ReturnType<typeof useFlowStore.getState>['flow']): Node[] {
  return flow.nodes.map((node) => ({
    id: node.id,
    type: 'block',
    position: node.position,
    data: {
      type: node.type,
      label: node.label,
      config: node.config,
    },
    selected: false,
  }));
}

// Default edge options with arrow markers
const defaultEdgeOptions = {
  animated: true,
  style: { strokeWidth: 2, stroke: '#6366f1' },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: '#6366f1',
  },
};

// Convert store flow to React Flow edges
function toReactFlowEdges(flow: ReturnType<typeof useFlowStore.getState>['flow']): Edge[] {
  return flow.connections.map((conn) => ({
    id: conn.id,
    source: conn.sourceNodeId,
    sourceHandle: conn.sourcePortId,
    target: conn.targetNodeId,
    targetHandle: conn.targetPortId,
    ...defaultEdgeOptions,
  }));
}

// Auto-layout: Arrange nodes in a top-to-bottom tree layout
function autoLayoutNodes(
  nodes: Node[],
  edges: Edge[]
): Node[] {
  if (nodes.length === 0) return nodes;

  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 120;
  const HORIZONTAL_GAP = 60;
  const VERTICAL_GAP = 80;

  // Build adjacency map
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();

  for (const node of nodes) {
    children.set(node.id, []);
    parents.set(node.id, []);
  }

  for (const edge of edges) {
    children.get(edge.source)?.push(edge.target);
    parents.get(edge.target)?.push(edge.source);
  }

  // Find root nodes (no parents)
  const rootNodes = nodes.filter((n) => (parents.get(n.id)?.length ?? 0) === 0);

  // If no root nodes found, use all nodes as roots
  const roots = rootNodes.length > 0 ? rootNodes : nodes;

  // Calculate levels using BFS
  const levels = new Map<string, number>();
  const queue: { id: string; level: number }[] = roots.map((n) => ({ id: n.id, level: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const existingLevel = levels.get(id);
    levels.set(id, Math.max(existingLevel ?? 0, level));

    const nodeChildren = children.get(id) ?? [];
    for (const childId of nodeChildren) {
      if (!visited.has(childId)) {
        queue.push({ id: childId, level: level + 1 });
      }
    }
  }

  // Handle unvisited nodes (disconnected)
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, 0);
    }
  }

  // Group nodes by level
  const nodesByLevel = new Map<number, Node[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    if (!nodesByLevel.has(level)) {
      nodesByLevel.set(level, []);
    }
    nodesByLevel.get(level)!.push(node);
  }

  // Position nodes
  const maxLevel = Math.max(...Array.from(levels.values()));
  const positionedNodes: Node[] = [];

  for (let level = 0; level <= maxLevel; level++) {
    const levelNodes = nodesByLevel.get(level) ?? [];
    const levelWidth = levelNodes.length * NODE_WIDTH + (levelNodes.length - 1) * HORIZONTAL_GAP;
    const startX = -levelWidth / 2;

    levelNodes.forEach((node, index) => {
      positionedNodes.push({
        ...node,
        position: {
          x: startX + index * (NODE_WIDTH + HORIZONTAL_GAP),
          y: level * (NODE_HEIGHT + VERTICAL_GAP),
        },
      });
    });
  }

  return positionedNodes;
}

export const FlowCanvas: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);

  // Store state
  const flow = useFlowStore((state) => state.flow);
  const addNode = useFlowStore((state) => state.addNode);
  const updateNode = useFlowStore((state) => state.updateNode);
  const removeNodes = useFlowStore((state) => state.removeNodes);
  const addConnection = useFlowStore((state) => state.addConnection);
  const removeConnections = useFlowStore((state) => state.removeConnections);
  const selectNode = useFlowStore((state) => state.selectNode);
  const clearSelection = useFlowStore((state) => state.clearSelection);
  const isDragging = useFlowStore((state) => state.isDragging);
  const draggedBlockType = useFlowStore((state) => state.draggedBlockType);
  const setDragging = useFlowStore((state) => state.setDragging);
  const openModal = useUIStore((state) => state.openModal);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(toReactFlowNodes(flow));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toReactFlowEdges(flow));

  // Sync store changes to React Flow
  React.useEffect(() => {
    setNodes(toReactFlowNodes(flow));
    setEdges(toReactFlowEdges(flow));
  }, [flow, setNodes, setEdges]);

  // Handle node position changes
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);

      // Sync position changes back to store
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNode(change.id, { position: change.position });
        }
        if (change.type === 'remove') {
          removeNodes([change.id]);
        }
      }
    },
    [onNodesChange, updateNode, removeNodes]
  );

  // Handle edge changes
  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);

      for (const change of changes) {
        if (change.type === 'remove') {
          removeConnections([change.id]);
        }
      }
    },
    [onEdgesChange, removeConnections]
  );

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const connectionId = addConnection(
          connection.source,
          connection.sourceHandle || 'output',
          connection.target,
          connection.targetHandle || 'input'
        );
        if (connectionId) {
          setEdges((eds) =>
            addEdge(
              {
                ...connection,
                id: connectionId,
                ...defaultEdgeOptions,
              },
              eds
            )
          );
        }
      }
    },
    [addConnection, setEdges]
  );

  // Auto-layout handler
  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;

    const layoutedNodes = autoLayoutNodes(nodes, edges);
    setNodes(layoutedNodes);

    // Sync positions back to store
    for (const node of layoutedNodes) {
      updateNode(node.id, { position: node.position });
    }

    // Fit view after layout
    setTimeout(() => {
      reactFlowInstance?.fitView({ padding: 0.2 });
    }, 50);
  }, [nodes, edges, setNodes, updateNode, reactFlowInstance]);

  // ---- Edge-proximity detection for drop-to-insert ----
  const findNearestEdge = useCallback(
    (dropPos: { x: number; y: number }, threshold = 80) => {
      let bestDist = threshold;
      let bestConn: (typeof flow.connections)[0] | null = null;

      for (const conn of flow.connections) {
        const srcNode = flow.nodes.find((n) => n.id === conn.sourceNodeId);
        const tgtNode = flow.nodes.find((n) => n.id === conn.targetNodeId);
        if (!srcNode || !tgtNode) continue;

        // Approximate edge as line from source center-bottom to target center-top
        const NODE_W = 240;
        const NODE_H = 60;
        const ax = srcNode.position.x + NODE_W / 2;
        const ay = srcNode.position.y + NODE_H;
        const bx = tgtNode.position.x + NODE_W / 2;
        const by = tgtNode.position.y;

        // Point-to-segment distance
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;
        const t = Math.max(0, Math.min(1, ((dropPos.x - ax) * dx + (dropPos.y - ay) * dy) / lenSq));
        const px = ax + t * dx;
        const py = ay + t * dy;
        const dist = Math.sqrt((dropPos.x - px) ** 2 + (dropPos.y - py) ** 2);

        if (dist < bestDist) {
          bestDist = dist;
          bestConn = conn;
        }
      }

      return bestConn;
    },
    [flow]
  );

  // Handle drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const blockType = event.dataTransfer.getData('application/accumulate-block') as BlockType;

      if (!blockType || !reactFlowInstance || !reactFlowWrapper.current) {
        return;
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const rawPosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const VERTICAL_GAP = 160;

      // ---- Priority 1: Edge-drop insertion ----
      // If dropped near an existing connection, split it and insert the new node
      const nearestEdge = findNearestEdge(rawPosition);
      if (nearestEdge) {
        const srcNode = flow.nodes.find((n) => n.id === nearestEdge.sourceNodeId);
        const tgtNode = flow.nodes.find((n) => n.id === nearestEdge.targetNodeId);

        if (srcNode && tgtNode) {
          // Position the new node between source and target
          const insertPosition = {
            x: (srcNode.position.x + tgtNode.position.x) / 2,
            y: (srcNode.position.y + tgtNode.position.y) / 2,
          };

          // Push the target node (and everything below it) down to make room
          const shiftAmount = VERTICAL_GAP;
          const belowY = insertPosition.y;
          for (const node of flow.nodes) {
            if (node.position.y >= belowY && node.id !== srcNode.id) {
              updateNode(node.id, {
                position: { x: node.position.x, y: node.position.y + shiftAmount },
              });
            }
          }

          const nodeId = addNode(blockType, insertPosition);

          // Remove old connection, wire source→new→target
          removeConnections([nearestEdge.id]);
          addConnection(nearestEdge.sourceNodeId, 'output', nodeId, 'input');
          addConnection(nodeId, 'output', nearestEdge.targetNodeId, 'input');

          // Open config if the block has configurable properties
          const blockDef = BLOCK_CATALOG[blockType];
          if (blockDef && Object.keys(blockDef.configSchema.properties || {}).length > 0) {
            openModal('block-config', { nodeId, blockType });
          }

          setDragging(false);
          return;
        }
      }

      // ---- Priority 2: Smart attachment to tail nodes ----
      const attachment = findBestAttachmentNode(blockType, flow);

      if (attachment.score > 0 && attachment.attachToNodeId) {
        const attachNode = flow.nodes.find((n) => n.id === attachment.attachToNodeId);
        const attachPosition = attachNode?.position ?? rawPosition;

        // Position the new node below the attachment chain
        const targetPosition = {
          x: attachPosition.x,
          y: attachPosition.y + (attachment.remainingRecipe.length + 1) * VERTICAL_GAP,
        };

        const nodeId = addNode(blockType, targetPosition);

        if (attachment.remainingRecipe.length === 0) {
          // All prereqs satisfied — wire directly and optionally open config
          addConnection(attachment.attachToNodeId, 'output', nodeId, 'input');
          const blockDef = BLOCK_CATALOG[blockType];
          if (blockDef && Object.keys(blockDef.configSchema.properties || {}).length > 0) {
            openModal('block-config', { nodeId, blockType });
          }
        } else {
          // Some prereqs missing — open modal with attachment context
          openModal('prerequisite-assistant', {
            targetNodeId: nodeId,
            targetBlockType: blockType,
            recipe: attachment.remainingRecipe,
            targetPosition,
            attachToNodeId: attachment.attachToNodeId,
            attachmentPosition: attachPosition,
          });
        }
      } else {
        // No attachment found — fall back to original behavior
        const recipe = getPrerequisiteRecipe(blockType, flow);
        const nodeId = addNode(blockType, rawPosition);

        if (recipe.length > 0) {
          openModal('prerequisite-assistant', {
            targetNodeId: nodeId,
            targetBlockType: blockType,
            recipe,
            targetPosition: rawPosition,
            attachToNodeId: null,
            attachmentPosition: null,
          });
        } else {
          const blockDef = BLOCK_CATALOG[blockType];
          if (blockDef && Object.keys(blockDef.configSchema.properties || {}).length > 0) {
            openModal('block-config', { nodeId, blockType });
          }
        }
      }

      setDragging(false);
    },
    [reactFlowInstance, addNode, addConnection, removeConnections, updateNode, setDragging, openModal, flow, findNearestEdge]
  );

  // Handle node click
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  // Handle node double-click (open config)
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const nodeData = node.data as { type: BlockType };
      openModal('block-config', { nodeId: node.id, blockType: nodeData.type });
    },
    [openModal]
  );

  // Handle pane click (clear selection)
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return (
    <div
      ref={reactFlowWrapper}
      className="flex-1 h-full bg-gray-100 dark:bg-gray-950"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        connectionLineStyle={{ strokeWidth: 2, stroke: '#6366f1' }}
        className={isDragging ? 'cursor-copy' : ''}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#d1d5db"
          className="dark:opacity-30"
        />
        <Controls className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg" />

        {/* Auto-layout button */}
        <Panel position="top-right" className="m-2">
          <button
            onClick={handleAutoLayout}
            disabled={nodes.length === 0}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg shadow-md',
              'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
              'text-sm font-medium transition-colors',
              nodes.length > 0
                ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
            )}
            title="Auto-arrange nodes in a top-to-bottom flow"
          >
            <LayoutGrid className="w-4 h-4" />
            Auto Layout
          </button>
        </Panel>

        <MiniMap
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
          style={{ width: 140, height: 100 }}
          nodeColor={(node) => {
            const nodeData = node.data as { type: BlockType };
            const blockDef = BLOCK_CATALOG[nodeData.type];
            return blockDef?.color || '#64748b';
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>

      {/* Drop zone indicator */}
      {isDragging && draggedBlockType && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="bg-accumulate-500/10 border-2 border-dashed border-accumulate-500 rounded-xl p-8 text-accumulate-600 dark:text-accumulate-400 font-medium">
            Drop to add {BLOCK_CATALOG[draggedBlockType]?.name}
          </div>
        </div>
      )}
    </div>
  );
};
