/**
 * Flow Schema - Canonical representation of visual flows
 * Based on flow.yaml specification from the implementation plan
 */

import type { BlockType, BlockConfig } from './blocks';

// =============================================================================
// Flow Node (Individual block instance in a flow)
// =============================================================================

export interface FlowNode {
  /** Unique identifier for this node instance */
  id: string;
  /** Block type from the catalog */
  type: BlockType;
  /** User-defined label for this node */
  label?: string;
  /** Block-specific configuration */
  config: BlockConfig;
  /** Position in the visual canvas */
  position: {
    x: number;
    y: number;
  };
  /** Node dimensions (auto-calculated or custom) */
  dimensions?: {
    width: number;
    height: number;
  };
}

// =============================================================================
// Flow Connection (Edge between nodes)
// =============================================================================

export interface FlowConnection {
  /** Unique identifier for this connection */
  id: string;
  /** Source node ID */
  sourceNodeId: string;
  /** Source port ID */
  sourcePortId: string;
  /** Target node ID */
  targetNodeId: string;
  /** Target port ID */
  targetPortId: string;
  /** Connection label (optional) */
  label?: string;
}

// =============================================================================
// Flow Variable
// =============================================================================

export type VariableType = 'url' | 'string' | 'decimal' | 'int' | 'bool' | 'bytes' | 'object';

export interface FlowVariable {
  /** Variable name (convention: UPPER_SNAKE_CASE) */
  name: string;
  /** Variable type */
  type: VariableType;
  /** Default value (if any) */
  default?: unknown;
  /** Human-readable description */
  description?: string;
  /** Is this a secret value (e.g., private key) */
  secret?: boolean;
  /** Is this variable required */
  required?: boolean;
}

// =============================================================================
// Flow Assertion
// =============================================================================

export type AssertionType =
  | 'balance.delta'
  | 'balance.equals'
  | 'account.exists'
  | 'account.not_exists'
  | 'chain.entry_count_delta_min'
  | 'receipt.verified'
  | 'tx.status.equals'
  | 'synthetic.delivered';

export interface FlowAssertion {
  /** Assertion type */
  type: AssertionType;
  /** Account URL (for balance/account assertions) */
  account?: string;
  /** Delta value (for balance.delta) */
  delta?: string;
  /** Expected value (for balance.equals) */
  equals?: string;
  /** URL (for account.exists/not_exists) */
  url?: string;
  /** Chain name (for chain assertions) */
  chain?: string;
  /** Minimum delta (for chain.entry_count_delta_min) */
  minDelta?: number;
  /** Source step ID (for receipt/tx assertions) */
  sourceStep?: string;
  /** Transaction ID (for receipt/tx assertions) */
  txid?: string;
  /** Expected status (for tx.status.equals) */
  status?: string;
  /** Human-readable message */
  message?: string;
}

// =============================================================================
// Flow Definition
// =============================================================================

export interface Flow {
  /** Flow schema version */
  version: '1.0';
  /** Flow name */
  name: string;
  /** Flow description */
  description?: string;
  /** Author information */
  author?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Target network */
  network?: 'mainnet' | 'testnet' | 'devnet' | 'kermit' | 'local';
  /** Flow variables */
  variables: FlowVariable[];
  /** Flow nodes */
  nodes: FlowNode[];
  /** Flow connections */
  connections: FlowConnection[];
  /** Post-execution assertions */
  assertions?: FlowAssertion[];
  /** Metadata */
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
    studioVersion?: string;
    [key: string]: unknown;
  };
}

// =============================================================================
// Flow YAML Block Format (for serialization)
// =============================================================================

export interface FlowYamlBlock {
  id: string;
  type: BlockType;
  depends_on?: string[];
  config?: Record<string, unknown>;
  transaction?: {
    type: string;
    principal: string;
    body: Record<string, unknown>;
  };
  outputs?: string[];
}

export interface FlowYaml {
  version: '1.0';
  name: string;
  description?: string;
  variables?: Record<string, string>;
  blocks: FlowYamlBlock[];
  assertions?: FlowAssertion[];
}

// =============================================================================
// Execution State
// =============================================================================

export type NodeExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';

export interface NodeExecutionState {
  nodeId: string;
  status: NodeExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  outputs?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  txHash?: string;
  receipt?: unknown;
}

export interface FlowExecutionState {
  flowId: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  currentNodeId?: string;
  nodeStates: Record<string, NodeExecutionState>;
  variables: Record<string, unknown>;
  logs: ExecutionLog[];
}

export interface ExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  nodeId?: string;
  message: string;
  data?: unknown;
}

// =============================================================================
// Flow Template (Golden Path)
// =============================================================================

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  tags: string[];
  thumbnail?: string;
  flow: Flow;
  instructions?: string[];
  prerequisites?: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

export function createEmptyFlow(name: string): Flow {
  return {
    version: '1.0',
    name,
    variables: [],
    nodes: [],
    connections: [],
    assertions: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Topologically sort nodes based on connections
 */
export function topologicalSort(flow: Flow): FlowNode[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of flow.nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build graph
  for (const conn of flow.connections) {
    const targets = adjacency.get(conn.sourceNodeId) ?? [];
    targets.push(conn.targetNodeId);
    adjacency.set(conn.sourceNodeId, targets);
    inDegree.set(conn.targetNodeId, (inDegree.get(conn.targetNodeId) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  const sorted: FlowNode[] = [];
  const nodeMap = new Map(flow.nodes.map((n) => [n.id, n]));

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) sorted.push(node);

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

/**
 * Validate flow structure
 */
export function validateFlow(flow: Flow): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of flow.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // Check connections reference valid nodes
  for (const conn of flow.connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent source node: ${conn.sourceNodeId}`);
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent target node: ${conn.targetNodeId}`);
    }
  }

  // Check for cycles
  const sorted = topologicalSort(flow);
  if (sorted.length !== flow.nodes.length) {
    errors.push('Flow contains cycles');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
