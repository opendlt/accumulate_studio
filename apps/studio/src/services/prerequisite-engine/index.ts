/**
 * Prerequisite Analysis Engine
 * Pure functions that analyze a Flow against the prerequisite knowledge graph.
 * No side effects, no store access.
 */

import type { Flow, BlockType } from '@accumulate-studio/types';
import {
  PREREQUISITE_GRAPH,
  type ResourceKind,
  type ResourceRequirement,
  type PrerequisiteSeverity,
} from '@accumulate-studio/types';

// =============================================================================
// Result Types
// =============================================================================

export interface AttachmentResult {
  attachToNodeId: string | null;
  satisfiedResources: Set<ResourceKind>;
  missingResources: ResourceKind[];
  remainingRecipe: BlockType[];
  score: number;
}

export interface NodeValidationIssue {
  /** The unmet requirement */
  requirement: ResourceRequirement;
  /** Human-readable message */
  message: string;
  /** Suggested fix description */
  remediation: string;
  /** Block types that could satisfy this requirement */
  suggestedBlocks: BlockType[];
}

export type NodeValidationSeverity = 'valid' | 'warning' | 'error';

export interface NodeValidationResult {
  nodeId: string;
  nodeType: BlockType;
  severity: NodeValidationSeverity;
  issues: NodeValidationIssue[];
  creditCost: number;
  /** Ordered list of block types to auto-insert to fix all issues */
  autoFixRecipe: BlockType[];
}

export interface FlowValidationResult {
  severity: NodeValidationSeverity;
  nodeResults: Record<string, NodeValidationResult>;
  totalCreditCost: number;
  analyzedAt: number;
}

// =============================================================================
// Core Analysis
// =============================================================================

/**
 * Build a map of nodeId -> set of ancestor nodeIds (BFS backwards through connections).
 */
function buildAncestryMap(flow: Flow): Map<string, Set<string>> {
  // Build reverse adjacency: targetId -> sourceIds
  const reverseAdj = new Map<string, string[]>();
  for (const node of flow.nodes) {
    reverseAdj.set(node.id, []);
  }
  for (const conn of flow.connections) {
    const parents = reverseAdj.get(conn.targetNodeId);
    if (parents) {
      parents.push(conn.sourceNodeId);
    }
  }

  const ancestryMap = new Map<string, Set<string>>();

  for (const node of flow.nodes) {
    const ancestors = new Set<string>();
    const queue = reverseAdj.get(node.id) ?? [];
    const visited = new Set<string>();

    for (const parentId of queue) {
      if (!visited.has(parentId)) {
        visited.add(parentId);
        ancestors.add(parentId);
      }
    }

    // BFS through all ancestors
    let idx = 0;
    const bfsQueue = [...visited];
    while (idx < bfsQueue.length) {
      const current = bfsQueue[idx++];
      for (const grandparent of reverseAdj.get(current) ?? []) {
        if (!visited.has(grandparent)) {
          visited.add(grandparent);
          ancestors.add(grandparent);
          bfsQueue.push(grandparent);
        }
      }
    }

    ancestryMap.set(node.id, ancestors);
  }

  return ancestryMap;
}

/**
 * Collect all ResourceKinds produced by a set of nodes.
 */
function collectProducedResources(
  nodeIds: Set<string>,
  nodeTypeMap: Map<string, BlockType>
): Set<ResourceKind> {
  const resources = new Set<ResourceKind>();
  for (const nodeId of nodeIds) {
    const nodeType = nodeTypeMap.get(nodeId);
    if (nodeType) {
      const rule = PREREQUISITE_GRAPH[nodeType];
      if (rule) {
        for (const r of rule.produces) {
          resources.add(r);
        }
      }
    }
  }
  return resources;
}

/**
 * Merge severities: error > warning > valid
 */
function mergeSeverity(a: NodeValidationSeverity, b: PrerequisiteSeverity): NodeValidationSeverity {
  if (a === 'error' || b === 'error') return 'error';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'valid';
}

/**
 * Analyze a complete flow against the prerequisite knowledge graph.
 * Returns per-node validation results, overall severity, and total credit cost.
 */
export function analyzeFlow(flow: Flow): FlowValidationResult {
  const ancestryMap = buildAncestryMap(flow);
  const nodeTypeMap = new Map<string, BlockType>();
  for (const node of flow.nodes) {
    nodeTypeMap.set(node.id, node.type);
  }

  const nodeResults: Record<string, NodeValidationResult> = {};
  let overallSeverity: NodeValidationSeverity = 'valid';
  let totalCreditCost = 0;

  for (const node of flow.nodes) {
    const rule = PREREQUISITE_GRAPH[node.type];
    if (!rule) {
      // Unknown block type - skip
      nodeResults[node.id] = {
        nodeId: node.id,
        nodeType: node.type,
        severity: 'valid',
        issues: [],
        creditCost: 0,
        autoFixRecipe: [],
      };
      continue;
    }

    const ancestors = ancestryMap.get(node.id) ?? new Set<string>();
    const availableResources = collectProducedResources(ancestors, nodeTypeMap);

    const issues: NodeValidationIssue[] = [];
    let nodeSeverity: NodeValidationSeverity = 'valid';

    for (const req of rule.requires) {
      if (!availableResources.has(req.resource)) {
        nodeSeverity = mergeSeverity(nodeSeverity, req.severity);
        issues.push({
          requirement: req,
          message: `Missing ${req.label}`,
          remediation: `Add a ${req.satisfiedBy.join(' or ')} block upstream`,
          suggestedBlocks: req.satisfiedBy,
        });
      }
    }

    // Compute autofix recipe: filter defaultRecipe to only blocks whose outputs are still needed
    const autoFixRecipe = computeMinimalRecipe(rule.defaultRecipe, availableResources, node.type);

    if (nodeSeverity === 'error') overallSeverity = 'error';
    else if (nodeSeverity === 'warning' && overallSeverity !== 'error') overallSeverity = 'warning';

    totalCreditCost += rule.creditCost;

    nodeResults[node.id] = {
      nodeId: node.id,
      nodeType: node.type,
      severity: nodeSeverity,
      issues,
      creditCost: rule.creditCost,
      autoFixRecipe,
    };
  }

  return {
    severity: overallSeverity,
    nodeResults,
    totalCreditCost,
    analyzedAt: Date.now(),
  };
}

/**
 * Given a default recipe and already-available resources, return only the
 * recipe steps whose produced resources are still needed.
 *
 * Also keeps "confirmation" steps (e.g. WaitForBalance after Faucet) that
 * produce the same resource as a prior recipe step -- these serve as
 * synchronisation points even though the resource is technically already
 * "available" in the simulated set.
 */
function computeMinimalRecipe(
  defaultRecipe: BlockType[],
  availableResources: Set<ResourceKind>,
  _targetType: BlockType
): BlockType[] {
  if (defaultRecipe.length === 0) return [];

  // Simulate the recipe: track what resources become available
  const simulated = new Set(availableResources);
  // Resources freshly added by recipe steps (not pre-existing)
  const addedByRecipe = new Set<ResourceKind>();
  const needed: BlockType[] = [];

  for (const step of defaultRecipe) {
    const stepRule = PREREQUISITE_GRAPH[step];
    if (!stepRule) continue;

    // Check if this step produces anything we don't already have
    const producesNeeded = stepRule.produces.some((r) => !simulated.has(r));

    // Keep confirmation/wait steps: they produce a resource that a prior
    // recipe step also just produced (e.g. WaitForBalance confirms the
    // acme-balance that Faucet created).
    const confirmsRecipeOutput = stepRule.produces.some((r) => addedByRecipe.has(r));

    if (producesNeeded || confirmsRecipeOutput) {
      needed.push(step);
      for (const r of stepRule.produces) {
        if (!availableResources.has(r)) {
          addedByRecipe.add(r);
        }
        simulated.add(r);
      }
    }
  }

  return needed;
}

/**
 * Find the best tail node in the flow to attach a new block to.
 * Scores each tail by how many of the block's required resources are
 * produced by the tail + its ancestors.
 */
export function findBestAttachmentNode(blockType: BlockType, flow: Flow): AttachmentResult {
  const rule = PREREQUISITE_GRAPH[blockType];
  if (!rule || rule.requires.length === 0) {
    return {
      attachToNodeId: null,
      satisfiedResources: new Set(),
      missingResources: [],
      remainingRecipe: [],
      score: 0,
    };
  }

  if (flow.nodes.length === 0) {
    return {
      attachToNodeId: null,
      satisfiedResources: new Set(),
      missingResources: rule.requires.map((r) => r.resource),
      remainingRecipe: computeMinimalRecipe(rule.defaultRecipe, new Set(), blockType),
      score: 0,
    };
  }

  const ancestryMap = buildAncestryMap(flow);
  const nodeTypeMap = new Map<string, BlockType>();
  for (const node of flow.nodes) {
    nodeTypeMap.set(node.id, node.type);
  }

  // Find tail nodes (no outgoing connections)
  const nodesWithOutgoing = new Set(flow.connections.map((c) => c.sourceNodeId));
  const tailNodes = flow.nodes.filter((n) => !nodesWithOutgoing.has(n.id));

  // If no tails (all nodes have outgoing - cycle?), fall back to all nodes
  const candidates = tailNodes.length > 0 ? tailNodes : flow.nodes;

  let bestResult: AttachmentResult = {
    attachToNodeId: null,
    satisfiedResources: new Set(),
    missingResources: rule.requires.map((r) => r.resource),
    remainingRecipe: computeMinimalRecipe(rule.defaultRecipe, new Set(), blockType),
    score: 0,
  };

  for (const tail of candidates) {
    // Resources from tail + all its ancestors
    const ancestorIds = ancestryMap.get(tail.id) ?? new Set<string>();
    const nodeIds = new Set(ancestorIds);
    nodeIds.add(tail.id);
    const resources = collectProducedResources(nodeIds, nodeTypeMap);

    // Score: count how many required resources are satisfied
    const satisfied = new Set<ResourceKind>();
    const missing: ResourceKind[] = [];
    for (const req of rule.requires) {
      if (resources.has(req.resource)) {
        satisfied.add(req.resource);
      } else {
        missing.push(req.resource);
      }
    }

    const score = satisfied.size;

    if (score > bestResult.score || (score === bestResult.score && score > 0 && tail.position.y > (flow.nodes.find((n) => n.id === bestResult.attachToNodeId)?.position.y ?? -Infinity))) {
      bestResult = {
        attachToNodeId: tail.id,
        satisfiedResources: satisfied,
        missingResources: missing,
        remainingRecipe: computeMinimalRecipe(rule.defaultRecipe, resources, blockType),
        score,
      };
    }
  }

  return bestResult;
}

/**
 * Given a block type and the current flow, determine what prerequisite blocks
 * are needed for a new drop of that type.
 * Considers all existing nodes in the flow as potential resource providers.
 */
export function getPrerequisiteRecipe(blockType: BlockType, existingFlow: Flow): BlockType[] {
  const rule = PREREQUISITE_GRAPH[blockType];
  if (!rule || rule.requires.length === 0) return [];

  // Collect all resources produced by all nodes currently in the flow
  const allResources = new Set<ResourceKind>();
  for (const node of existingFlow.nodes) {
    const nodeRule = PREREQUISITE_GRAPH[node.type];
    if (nodeRule) {
      for (const r of nodeRule.produces) {
        allResources.add(r);
      }
    }
  }

  return computeMinimalRecipe(rule.defaultRecipe, allResources, blockType);
}

/**
 * Compute positions for auto-inserted prerequisite blocks.
 * Arranges them vertically above the target node in a chain.
 */
export function computePrerequisitePositions(
  recipe: BlockType[],
  targetPosition: { x: number; y: number }
): Array<{ type: BlockType; position: { x: number; y: number } }> {
  const VERTICAL_GAP = 160;

  return recipe.map((type, index) => ({
    type,
    position: {
      x: targetPosition.x,
      y: targetPosition.y - (recipe.length - index) * VERTICAL_GAP,
    },
  }));
}
