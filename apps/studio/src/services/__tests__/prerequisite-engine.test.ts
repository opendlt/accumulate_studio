/**
 * Prerequisite Engine Tests
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeFlow,
  findBestAttachmentNode,
  getPrerequisiteRecipe,
  computePrerequisitePositions,
} from '../prerequisite-engine';
import type { Flow, FlowNode, FlowConnection, BlockType } from '@accumulate-studio/types';

// =============================================================================
// Helpers
// =============================================================================

function makeNode(id: string, type: BlockType, x = 0, y = 0): FlowNode {
  return { id, type, config: {}, position: { x, y } };
}

function makeConnection(
  sourceId: string,
  targetId: string,
  id?: string
): FlowConnection {
  return {
    id: id || `${sourceId}->${targetId}`,
    sourceNodeId: sourceId,
    sourcePortId: 'output',
    targetNodeId: targetId,
    targetPortId: 'input',
  };
}

function makeFlow(
  nodes: FlowNode[],
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

// =============================================================================
// analyzeFlow
// =============================================================================

describe('analyzeFlow', () => {
  it('returns valid for empty flow', () => {
    const result = analyzeFlow(makeFlow([]));
    expect(result.severity).toBe('valid');
    expect(Object.keys(result.nodeResults)).toHaveLength(0);
    expect(result.totalCreditCost).toBe(0);
    expect(result.analyzedAt).toBeGreaterThan(0);
  });

  it('validates GenerateKeys with no issues', () => {
    const flow = makeFlow([makeNode('gk', 'GenerateKeys')]);
    const result = analyzeFlow(flow);
    expect(result.severity).toBe('valid');
    expect(result.nodeResults['gk'].severity).toBe('valid');
    expect(result.nodeResults['gk'].issues).toHaveLength(0);
    expect(result.nodeResults['gk'].creditCost).toBe(0);
  });

  it('reports error for standalone Faucet (missing lite-token-account)', () => {
    const flow = makeFlow([makeNode('f', 'Faucet')]);
    const result = analyzeFlow(flow);
    expect(result.severity).toBe('error');
    expect(result.nodeResults['f'].severity).toBe('error');
    expect(result.nodeResults['f'].issues.length).toBeGreaterThan(0);
    expect(
      result.nodeResults['f'].issues.some(
        (i) => i.requirement.resource === 'lite-token-account'
      )
    ).toBe(true);
  });

  it('validates connected GenerateKeys → Faucet chain', () => {
    const flow = makeFlow(
      [makeNode('gk', 'GenerateKeys'), makeNode('f', 'Faucet')],
      [makeConnection('gk', 'f')]
    );
    const result = analyzeFlow(flow);
    expect(result.severity).toBe('valid');
    expect(result.nodeResults['gk'].severity).toBe('valid');
    expect(result.nodeResults['f'].severity).toBe('valid');
    expect(result.nodeResults['f'].issues).toHaveLength(0);
  });

  it('validates GenerateKeys → Faucet → AddCredits chain', () => {
    const flow = makeFlow(
      [
        makeNode('gk', 'GenerateKeys'),
        makeNode('f', 'Faucet'),
        makeNode('ac', 'AddCredits'),
      ],
      [makeConnection('gk', 'f'), makeConnection('f', 'ac')]
    );
    const result = analyzeFlow(flow);
    // AddCredits needs: keypair, lite-token-account, acme-balance, lite-identity
    // GenerateKeys produces: keypair, lite-identity, lite-token-account
    // Faucet produces: acme-balance, token-balance
    // All satisfied through ancestry
    expect(result.nodeResults['ac'].severity).toBe('valid');
    expect(result.nodeResults['ac'].issues).toHaveLength(0);
  });

  it('validates full golden path chain', () => {
    const flow = makeFlow(
      [
        makeNode('gk', 'GenerateKeys', 0, 0),
        makeNode('f', 'Faucet', 0, 160),
        makeNode('wb', 'WaitForBalance', 0, 320),
        makeNode('ac', 'AddCredits', 0, 480),
        makeNode('wc', 'WaitForCredits', 0, 640),
        makeNode('ci', 'CreateIdentity', 0, 800),
      ],
      [
        makeConnection('gk', 'f'),
        makeConnection('f', 'wb'),
        makeConnection('wb', 'ac'),
        makeConnection('ac', 'wc'),
        makeConnection('wc', 'ci'),
      ]
    );
    const result = analyzeFlow(flow);
    expect(result.severity).toBe('valid');
    for (const nodeResult of Object.values(result.nodeResults)) {
      expect(nodeResult.severity).toBe('valid');
    }
  });

  it('reports error for disconnected Faucet even when GenerateKeys exists', () => {
    const flow = makeFlow([
      makeNode('gk', 'GenerateKeys'),
      makeNode('f', 'Faucet'),
    ]);
    // No connection between them
    const result = analyzeFlow(flow);
    expect(result.nodeResults['f'].severity).toBe('error');
    expect(result.nodeResults['f'].issues.length).toBeGreaterThan(0);
  });

  it('reports error severity when any node has errors', () => {
    const flow = makeFlow(
      [
        makeNode('gk', 'GenerateKeys'),
        makeNode('f', 'Faucet'),
        makeNode('ci', 'CreateIdentity'), // disconnected, missing credits
      ],
      [makeConnection('gk', 'f')]
    );
    const result = analyzeFlow(flow);
    expect(result.severity).toBe('error');
    expect(result.nodeResults['gk'].severity).toBe('valid');
    expect(result.nodeResults['f'].severity).toBe('valid');
    expect(result.nodeResults['ci'].severity).toBe('error');
  });

  it('accumulates credit costs', () => {
    const flow = makeFlow(
      [
        makeNode('gk', 'GenerateKeys'),
        makeNode('ci', 'CreateIdentity'),
      ],
      [makeConnection('gk', 'ci')]
    );
    const result = analyzeFlow(flow);
    // GenerateKeys = 0, CreateIdentity = 2500
    expect(result.totalCreditCost).toBe(2500);
  });

  it('handles Comment and QueryAccount nodes gracefully', () => {
    const flow = makeFlow([
      makeNode('c', 'Comment'),
      makeNode('q', 'QueryAccount'),
    ]);
    const result = analyzeFlow(flow);
    // QueryAccount has a warning-level requirement now, so overall severity is warning
    expect(result.severity).toBe('warning');
    expect(result.nodeResults['c'].issues).toHaveLength(0);
    expect(result.nodeResults['q'].issues).toHaveLength(1);
    expect(result.nodeResults['q'].issues[0].requirement.severity).toBe('warning');
  });

  it('provides autoFixRecipe for nodes with missing resources', () => {
    const flow = makeFlow([makeNode('f', 'Faucet')]);
    const result = analyzeFlow(flow);
    expect(result.nodeResults['f'].autoFixRecipe.length).toBeGreaterThan(0);
    expect(result.nodeResults['f'].autoFixRecipe).toContain('GenerateKeys');
  });

  it('autoFixRecipe is empty when all resources satisfied', () => {
    const flow = makeFlow(
      [makeNode('gk', 'GenerateKeys'), makeNode('f', 'Faucet')],
      [makeConnection('gk', 'f')]
    );
    const result = analyzeFlow(flow);
    expect(result.nodeResults['f'].autoFixRecipe).toHaveLength(0);
  });

  it('traverses deep ancestry chains', () => {
    // A → B → C → D (CreateIdentity at end should see all ancestors)
    const flow = makeFlow(
      [
        makeNode('gk', 'GenerateKeys'),
        makeNode('f', 'Faucet'),
        makeNode('wb', 'WaitForBalance'),
        makeNode('ac', 'AddCredits'),
        makeNode('wc', 'WaitForCredits'),
        makeNode('ci', 'CreateIdentity'),
      ],
      [
        makeConnection('gk', 'f'),
        makeConnection('f', 'wb'),
        makeConnection('wb', 'ac'),
        makeConnection('ac', 'wc'),
        makeConnection('wc', 'ci'),
      ]
    );
    const result = analyzeFlow(flow);
    // CreateIdentity needs keypair + credits, both satisfied
    expect(result.nodeResults['ci'].severity).toBe('valid');
  });

  it('issues contain suggested blocks', () => {
    const flow = makeFlow([makeNode('ac', 'AddCredits')]);
    const result = analyzeFlow(flow);
    const issues = result.nodeResults['ac'].issues;
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.suggestedBlocks.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// findBestAttachmentNode
// =============================================================================

describe('findBestAttachmentNode', () => {
  it('returns null attachment for empty flow', () => {
    const result = findBestAttachmentNode('Faucet', makeFlow([]));
    expect(result.attachToNodeId).toBeNull();
    expect(result.missingResources.length).toBeGreaterThan(0);
    expect(result.score).toBe(0);
  });

  it('attaches Faucet to GenerateKeys tail', () => {
    const flow = makeFlow([makeNode('gk', 'GenerateKeys', 0, 0)]);
    const result = findBestAttachmentNode('Faucet', flow);
    expect(result.attachToNodeId).toBe('gk');
    expect(result.score).toBeGreaterThan(0);
    expect(result.satisfiedResources.has('lite-token-account')).toBe(true);
    expect(result.missingResources).toHaveLength(0);
  });

  it('attaches AddCredits to Faucet tail in a chain', () => {
    const flow = makeFlow(
      [makeNode('gk', 'GenerateKeys', 0, 0), makeNode('f', 'Faucet', 0, 160)],
      [makeConnection('gk', 'f')]
    );
    const result = findBestAttachmentNode('AddCredits', flow);
    expect(result.attachToNodeId).toBe('f');
    // Faucet tail + ancestors (GenerateKeys) provide: keypair, lite-identity, lite-token-account, acme-balance, token-balance
    expect(result.score).toBeGreaterThan(0);
    expect(result.missingResources).toHaveLength(0);
  });

  it('picks the tail with more satisfied resources', () => {
    // Branch A: GenerateKeys → Faucet (provides keypair + acme-balance etc.)
    // Branch B: standalone GenerateKeys (provides keypair only)
    const flow = makeFlow(
      [
        makeNode('gk1', 'GenerateKeys', 0, 0),
        makeNode('f', 'Faucet', 0, 160),
        makeNode('gk2', 'GenerateKeys', 300, 0),
      ],
      [makeConnection('gk1', 'f')]
    );
    const result = findBestAttachmentNode('AddCredits', flow);
    // Faucet tail has more resources (acme-balance etc.)
    expect(result.attachToNodeId).toBe('f');
  });

  it('returns null attachment and score 0 for blocks with no requirements', () => {
    const flow = makeFlow([makeNode('gk', 'GenerateKeys')]);
    const result = findBestAttachmentNode('Comment', flow);
    expect(result.attachToNodeId).toBeNull();
    expect(result.score).toBe(0);
  });

  it('returns remaining recipe for partially satisfied resources', () => {
    // Only GenerateKeys exists; attaching CreateIdentity needs credits too
    const flow = makeFlow([makeNode('gk', 'GenerateKeys', 0, 0)]);
    const result = findBestAttachmentNode('CreateIdentity', flow);
    expect(result.attachToNodeId).toBe('gk');
    expect(result.missingResources).toContain('credits');
    expect(result.remainingRecipe.length).toBeGreaterThan(0);
  });

  it('includes correct remaining recipe blocks', () => {
    const flow = makeFlow([makeNode('gk', 'GenerateKeys', 0, 0)]);
    const result = findBestAttachmentNode('AddCredits', flow);
    // Has keypair + lite-token-account + lite-identity from GenerateKeys
    // Missing acme-balance → recipe should include Faucet
    expect(result.remainingRecipe).toContain('Faucet');
  });
});

// =============================================================================
// getPrerequisiteRecipe
// =============================================================================

describe('getPrerequisiteRecipe', () => {
  it('returns empty recipe for GenerateKeys', () => {
    const recipe = getPrerequisiteRecipe('GenerateKeys', makeFlow([]));
    expect(recipe).toHaveLength(0);
  });

  it('returns GenerateKeys for Faucet with empty flow', () => {
    const recipe = getPrerequisiteRecipe('Faucet', makeFlow([]));
    expect(recipe).toContain('GenerateKeys');
  });

  it('returns empty recipe for Faucet when GenerateKeys exists', () => {
    const flow = makeFlow([makeNode('gk', 'GenerateKeys')]);
    const recipe = getPrerequisiteRecipe('Faucet', flow);
    expect(recipe).toHaveLength(0);
  });

  it('returns full chain for AddCredits with empty flow', () => {
    const recipe = getPrerequisiteRecipe('AddCredits', makeFlow([]));
    expect(recipe).toContain('GenerateKeys');
    expect(recipe).toContain('Faucet');
    // WaitForBalance is a confirmation step
    expect(recipe.length).toBeGreaterThanOrEqual(2);
  });

  it('returns long chain for CreateIdentity with empty flow', () => {
    const recipe = getPrerequisiteRecipe('CreateIdentity', makeFlow([]));
    expect(recipe).toContain('GenerateKeys');
    expect(recipe).toContain('Faucet');
    expect(recipe).toContain('AddCredits');
    expect(recipe.length).toBeGreaterThanOrEqual(3);
  });

  it('shortens recipe when flow already has GenerateKeys + Faucet', () => {
    const flow = makeFlow([
      makeNode('gk', 'GenerateKeys'),
      makeNode('f', 'Faucet'),
    ]);
    const fullRecipe = getPrerequisiteRecipe('CreateIdentity', makeFlow([]));
    const shortRecipe = getPrerequisiteRecipe('CreateIdentity', flow);
    expect(shortRecipe.length).toBeLessThan(fullRecipe.length);
  });

  it('returns empty recipe for Comment', () => {
    const recipe = getPrerequisiteRecipe('Comment', makeFlow([]));
    expect(recipe).toHaveLength(0);
  });

  it('returns setup recipe for QueryAccount', () => {
    const recipe = getPrerequisiteRecipe('QueryAccount', makeFlow([]));
    expect(recipe).toEqual(['GenerateKeys', 'Faucet']);
  });

  it('considers all existing nodes (not just connected ones)', () => {
    // Two disconnected GenerateKeys + Faucet → their resources are still available
    const flow = makeFlow([
      makeNode('gk', 'GenerateKeys'),
      makeNode('f', 'Faucet'),
    ]);
    const recipe = getPrerequisiteRecipe('AddCredits', flow);
    // All resources from GenerateKeys + Faucet available
    expect(recipe).toHaveLength(0);
  });
});

// =============================================================================
// computePrerequisitePositions
// =============================================================================

describe('computePrerequisitePositions', () => {
  it('returns empty array for empty recipe', () => {
    const result = computePrerequisitePositions([], { x: 100, y: 500 });
    expect(result).toHaveLength(0);
  });

  it('positions single item above target', () => {
    const result = computePrerequisitePositions(['GenerateKeys'], { x: 100, y: 500 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('GenerateKeys');
    expect(result[0].position.x).toBe(100);
    expect(result[0].position.y).toBeLessThan(500);
  });

  it('spaces items with 160px vertical gap', () => {
    const result = computePrerequisitePositions(
      ['GenerateKeys', 'Faucet', 'WaitForBalance'],
      { x: 200, y: 800 }
    );
    expect(result).toHaveLength(3);
    // All x values match target
    for (const item of result) {
      expect(item.position.x).toBe(200);
    }
    // Each item is 160px apart
    expect(result[1].position.y - result[0].position.y).toBe(160);
    expect(result[2].position.y - result[1].position.y).toBe(160);
  });

  it('all positions are above the target', () => {
    const target = { x: 0, y: 1000 };
    const result = computePrerequisitePositions(
      ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits'],
      target
    );
    for (const item of result) {
      expect(item.position.y).toBeLessThan(target.y);
    }
  });

  it('preserves block types in order', () => {
    const recipe: BlockType[] = ['GenerateKeys', 'Faucet', 'AddCredits'];
    const result = computePrerequisitePositions(recipe, { x: 0, y: 500 });
    expect(result[0].type).toBe('GenerateKeys');
    expect(result[1].type).toBe('Faucet');
    expect(result[2].type).toBe('AddCredits');
  });

  it('last item is closest to target position', () => {
    const result = computePrerequisitePositions(
      ['GenerateKeys', 'Faucet'],
      { x: 0, y: 500 }
    );
    // Last item should have highest y (closest to target)
    expect(result[1].position.y).toBeGreaterThan(result[0].position.y);
  });
});
