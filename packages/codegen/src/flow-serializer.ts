/**
 * Flow Serializer - Convert studio Flow to canonical flow.yaml format
 */

import yaml from 'js-yaml';
import type {
  Flow,
  FlowNode,
  FlowConnection,
  FlowYaml,
  FlowYamlBlock,
  FlowVariable,
  FlowAssertion,
  BlockType,
} from '@accumulate-studio/types';

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Build a dependency map from flow connections
 */
function buildDependencyMap(
  nodes: FlowNode[],
  connections: FlowConnection[]
): Map<string, string[]> {
  const dependsOn = new Map<string, string[]>();

  // Initialize all nodes with empty dependency arrays
  for (const node of nodes) {
    dependsOn.set(node.id, []);
  }

  // Add dependencies from connections
  for (const conn of connections) {
    const deps = dependsOn.get(conn.targetNodeId) ?? [];
    if (!deps.includes(conn.sourceNodeId)) {
      deps.push(conn.sourceNodeId);
    }
    dependsOn.set(conn.targetNodeId, deps);
  }

  return dependsOn;
}

/**
 * Topologically sort nodes based on dependencies
 */
function topologicalSort(
  nodes: FlowNode[],
  dependsOn: Map<string, string[]>
): FlowNode[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, dependsOn.get(node.id)?.length ?? 0);
    adjacency.set(node.id, []);
  }

  // Build adjacency (reverse of dependsOn)
  for (const [nodeId, deps] of dependsOn) {
    for (const depId of deps) {
      const adj = adjacency.get(depId) ?? [];
      adj.push(nodeId);
      adjacency.set(depId, adj);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId);
  }

  const sorted: FlowNode[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

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
 * Convert a flow node to YAML block format
 */
function nodeToYamlBlock(
  node: FlowNode,
  dependencies: string[]
): FlowYamlBlock {
  const block: FlowYamlBlock = {
    id: node.id,
    type: node.type,
  };

  // Add dependencies if present
  if (dependencies.length > 0) {
    block.depends_on = dependencies;
  }

  // Add config based on block type
  const config = node.config as Record<string, unknown>;

  // For transaction blocks, format as transaction object
  if (isTransactionBlock(node.type)) {
    block.transaction = {
      type: node.type,
      principal: extractPrincipal(node),
      body: formatTransactionBody(node.type, config),
    };
  } else {
    // Utility blocks use config directly
    block.config = config;
  }

  // Extract outputs for special blocks
  const outputs = extractOutputs(node);
  if (outputs.length > 0) {
    block.outputs = outputs;
  }

  return block;
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
 * Extract principal URL from node config
 */
function extractPrincipal(node: FlowNode): string {
  const config = node.config as Record<string, unknown>;

  // Most blocks use 'url' as principal
  if ('url' in config && typeof config.url === 'string') {
    return config.url;
  }

  // Faucet uses 'account'
  if ('account' in config && typeof config.account === 'string') {
    return config.account;
  }

  return '${PRINCIPAL}';
}

/**
 * Format transaction body based on block type
 */
function formatTransactionBody(
  type: BlockType,
  config: Record<string, unknown>
): Record<string, unknown> {
  // Remove principal from body (it's in the transaction envelope)
  const body = { ...config };
  delete body.url;
  delete body.principal;

  return body;
}

/**
 * Extract outputs from node
 */
function extractOutputs(node: FlowNode): string[] {
  const outputs: string[] = [];

  switch (node.type) {
    case 'CreateIdentity':
      outputs.push('adiUrl', 'keyBookUrl', 'keyPageUrl');
      break;
    case 'CreateKeyBook':
      outputs.push('keyBookUrl');
      break;
    case 'CreateKeyPage':
      outputs.push('keyPageUrl');
      break;
    case 'CreateTokenAccount':
      outputs.push('tokenAccountUrl');
      break;
    case 'CreateDataAccount':
      outputs.push('dataAccountUrl');
      break;
    case 'CreateToken':
      outputs.push('tokenUrl');
      break;
    case 'GenerateKeys':
      outputs.push('keypair', 'publicKey', 'publicKeyHash', 'liteIdentity', 'liteTokenAccount');
      break;
    case 'SendTokens':
    case 'IssueTokens':
    case 'BurnTokens':
    case 'AddCredits':
    case 'TransferCredits':
    case 'WriteData':
      outputs.push('txHash');
      break;
  }

  return outputs;
}

/**
 * Convert flow variables to YAML format
 */
function variablesToYaml(variables: FlowVariable[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const variable of variables) {
    let typeStr = variable.type;
    if (variable.secret) {
      typeStr = `secret:${typeStr}`;
    }
    if (variable.required === false) {
      typeStr = `optional:${typeStr}`;
    }
    if (variable.default !== undefined) {
      typeStr = `${typeStr}=${String(variable.default)}`;
    }
    result[variable.name] = typeStr;
  }

  return result;
}

/**
 * Convert flow assertions to YAML format
 */
function assertionsToYaml(assertions: FlowAssertion[]): FlowAssertion[] {
  // Assertions are already in the correct format
  return assertions.map((a) => ({
    type: a.type,
    ...(a.account && { account: a.account }),
    ...(a.delta && { delta: a.delta }),
    ...(a.equals && { equals: a.equals }),
    ...(a.url && { url: a.url }),
    ...(a.chain && { chain: a.chain }),
    ...(a.minDelta !== undefined && { minDelta: a.minDelta }),
    ...(a.sourceStep && { sourceStep: a.sourceStep }),
    ...(a.txid && { txid: a.txid }),
    ...(a.status && { status: a.status }),
    ...(a.message && { message: a.message }),
  }));
}

// =============================================================================
// Main Serialization Function
// =============================================================================

/**
 * Serialize a Flow to canonical YAML format
 */
export function serializeFlowToYaml(flow: Flow): string {
  // Build dependency map
  const dependsOn = buildDependencyMap(flow.nodes, flow.connections);

  // Sort nodes topologically
  const sortedNodes = topologicalSort(flow.nodes, dependsOn);

  // Convert nodes to YAML blocks
  const blocks: FlowYamlBlock[] = sortedNodes.map((node) =>
    nodeToYamlBlock(node, dependsOn.get(node.id) ?? [])
  );

  // Build the YAML structure
  const flowYaml: FlowYaml = {
    version: '1.0',
    name: flow.name,
    ...(flow.description && { description: flow.description }),
    ...(flow.variables.length > 0 && { variables: variablesToYaml(flow.variables) }),
    blocks,
    ...(flow.assertions && flow.assertions.length > 0 && {
      assertions: assertionsToYaml(flow.assertions),
    }),
  };

  // Serialize to YAML with custom options
  return yaml.dump(flowYaml, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}

/**
 * Parse a YAML flow file back to FlowYaml structure
 */
export function parseFlowYaml(yamlContent: string): FlowYaml {
  return yaml.load(yamlContent) as FlowYaml;
}

/**
 * Convert FlowYaml to studio Flow format
 */
export function deserializeYamlToFlow(flowYaml: FlowYaml): Flow {
  // Parse variables
  const variables: FlowVariable[] = [];
  if (flowYaml.variables) {
    for (const [name, typeStr] of Object.entries(flowYaml.variables)) {
      const variable = parseVariableType(name, typeStr);
      variables.push(variable);
    }
  }

  // Convert blocks to nodes (position them in a grid)
  const nodes: FlowNode[] = flowYaml.blocks.map((block, index) => {
    const baseConfig = block.config ?? block.transaction?.body ?? {};
    // Merge transaction.principal into config so code generators can access it
    const principal = block.transaction?.principal;
    const config = principal && !('principal' in baseConfig)
      ? { ...baseConfig, principal }
      : baseConfig;
    return {
      id: block.id,
      type: block.type,
      config,
      position: {
        x: 100 + (index % 3) * 300,
        y: 100 + Math.floor(index / 3) * 200,
      },
    };
  });

  // Build connections from depends_on
  const connections: FlowConnection[] = [];
  for (const block of flowYaml.blocks) {
    if (block.depends_on) {
      for (const depId of block.depends_on) {
        connections.push({
          id: `conn_${depId}_${block.id}`,
          sourceNodeId: depId,
          sourcePortId: 'output',
          targetNodeId: block.id,
          targetPortId: 'input',
        });
      }
    }
  }

  return {
    version: '1.0',
    name: flowYaml.name,
    description: flowYaml.description,
    variables,
    nodes,
    connections,
    assertions: flowYaml.assertions,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Parse variable type string
 */
function parseVariableType(name: string, typeStr: string): FlowVariable {
  let type = typeStr;
  let secret = false;
  let required = true;
  let defaultValue: unknown = undefined;

  // Check for secret prefix
  if (type.startsWith('secret:')) {
    secret = true;
    type = type.substring(7);
  }

  // Check for optional prefix
  if (type.startsWith('optional:')) {
    required = false;
    type = type.substring(9);
  }

  // Check for default value
  const eqIndex = type.indexOf('=');
  if (eqIndex !== -1) {
    defaultValue = type.substring(eqIndex + 1);
    type = type.substring(0, eqIndex);
  }

  return {
    name,
    type: type as FlowVariable['type'],
    secret,
    required,
    default: defaultValue,
  };
}

// =============================================================================
// Export Types
// =============================================================================

export type { FlowYaml, FlowYamlBlock };
