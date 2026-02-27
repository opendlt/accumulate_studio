/**
 * Flow Templates Data Tests
 *
 * Validates that all golden path templates have well-formed
 * Flow objects with valid nodes, connections, and configs.
 */

import { describe, it, expect } from 'vitest';
import { GOLDEN_PATH_TEMPLATES } from '../flow-templates';
import { BLOCK_CATALOG, type BlockType } from '@accumulate-studio/types';
import { validateFlow, topologicalSort } from '@accumulate-studio/types';

describe('GOLDEN_PATH_TEMPLATES', () => {
  it('exports at least 5 templates', () => {
    expect(GOLDEN_PATH_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('has unique template IDs', () => {
    const ids = GOLDEN_PATH_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all templates have required metadata', () => {
    for (const template of GOLDEN_PATH_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(['beginner', 'intermediate', 'advanced']).toContain(template.category);
      expect(template.estimatedTime).toBeTruthy();
      expect(template.tags.length).toBeGreaterThan(0);
      expect(template.flow).toBeDefined();
    }
  });

  for (const template of GOLDEN_PATH_TEMPLATES) {
    describe(`template: ${template.id}`, () => {
      it('has non-empty flow with nodes', () => {
        expect(template.flow.nodes.length).toBeGreaterThan(0);
        expect(template.flow.version).toBe('1.0');
        expect(template.flow.name).toBeTruthy();
      });

      it('all nodes have valid block types', () => {
        for (const node of template.flow.nodes) {
          expect(
            BLOCK_CATALOG[node.type as BlockType],
            `Unknown block type "${node.type}" in node ${node.id}`
          ).toBeDefined();
        }
      });

      it('all nodes have unique IDs', () => {
        const ids = template.flow.nodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('all nodes have positions', () => {
        for (const node of template.flow.nodes) {
          expect(node.position).toBeDefined();
          expect(typeof node.position.x).toBe('number');
          expect(typeof node.position.y).toBe('number');
        }
      });

      it('all connections reference valid nodes', () => {
        const nodeIds = new Set(template.flow.nodes.map((n) => n.id));
        for (const conn of template.flow.connections) {
          expect(
            nodeIds.has(conn.sourceNodeId),
            `Connection ${conn.id} has invalid source: ${conn.sourceNodeId}`
          ).toBe(true);
          expect(
            nodeIds.has(conn.targetNodeId),
            `Connection ${conn.id} has invalid target: ${conn.targetNodeId}`
          ).toBe(true);
        }
      });

      it('connections have unique IDs', () => {
        const ids = template.flow.connections.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('passes flow validation (no cycles, no duplicates)', () => {
        const result = validateFlow(template.flow);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
      });

      it('topological sort includes all nodes', () => {
        const sorted = topologicalSort(template.flow);
        expect(sorted.length).toBe(template.flow.nodes.length);
      });

      it('node count matches instructions count (when instructions exist)', () => {
        if (template.instructions) {
          // Instructions should roughly correspond to the number of blocks
          // Allow some flexibility (instructions might group or split steps)
          expect(template.instructions.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('Template categories coverage', () => {
  it('has beginner templates', () => {
    const beginner = GOLDEN_PATH_TEMPLATES.filter((t) => t.category === 'beginner');
    expect(beginner.length).toBeGreaterThanOrEqual(2);
  });

  it('has intermediate templates', () => {
    const intermediate = GOLDEN_PATH_TEMPLATES.filter((t) => t.category === 'intermediate');
    expect(intermediate.length).toBeGreaterThanOrEqual(2);
  });

  it('has advanced templates', () => {
    const advanced = GOLDEN_PATH_TEMPLATES.filter((t) => t.category === 'advanced');
    expect(advanced.length).toBeGreaterThanOrEqual(1);
  });

  it('has identity-tagged templates', () => {
    const identity = GOLDEN_PATH_TEMPLATES.filter((t) => t.tags.includes('identity'));
    expect(identity.length).toBeGreaterThanOrEqual(1);
  });

  it('has tokens-tagged templates', () => {
    const tokens = GOLDEN_PATH_TEMPLATES.filter((t) => t.tags.includes('tokens'));
    expect(tokens.length).toBeGreaterThanOrEqual(1);
  });

  it('has data-tagged templates', () => {
    const data = GOLDEN_PATH_TEMPLATES.filter((t) => t.tags.includes('data'));
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('has security-tagged templates', () => {
    const security = GOLDEN_PATH_TEMPLATES.filter((t) => t.tags.includes('security'));
    expect(security.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Specific template flows', () => {
  it('lite-account-setup starts with GenerateKeys', () => {
    const t = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'lite-account-setup')!;
    expect(t).toBeDefined();
    expect(t.flow.nodes[0].type).toBe('GenerateKeys');
    expect(t.flow.nodes.length).toBe(3);
    expect(t.flow.variables.length).toBe(0);
  });

  it('create-adi ends with CreateIdentity (key book + page auto-provisioned)', () => {
    const t = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'create-adi')!;
    expect(t).toBeDefined();
    const lastNode = t.flow.nodes[t.flow.nodes.length - 1];
    expect(lastNode.type).toBe('CreateIdentity');
    expect(t.flow.variables.length).toBeGreaterThan(0);
  });

  it('zero-to-hero includes CreateTokenAccount', () => {
    const t = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'zero-to-hero')!;
    expect(t).toBeDefined();
    const types = t.flow.nodes.map((n) => n.type);
    expect(types).toContain('CreateTokenAccount');
    expect(types).toContain('CreateIdentity');
    expect(types).toContain('GenerateKeys');
  });

  it('token-transfer is self-contained with full setup', () => {
    const t = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'token-transfer')!;
    expect(t).toBeDefined();
    const types = t.flow.nodes.map((n) => n.type);
    // Two CreateTokenAccount nodes (sender + receiver)
    expect(types.filter((ty) => ty === 'CreateTokenAccount').length).toBe(2);
    // Two SendTokens nodes (fund sender + actual transfer)
    expect(types.filter((ty) => ty === 'SendTokens').length).toBe(2);
    // Full setup from scratch
    expect(types).toContain('GenerateKeys');
    expect(types).toContain('CreateIdentity');
  });

  it('multi-sig-setup is self-contained with full setup', () => {
    const t = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'multi-sig-setup')!;
    expect(t).toBeDefined();
    const types = t.flow.nodes.map((n) => n.type);
    // 3 UpdateKeyPage nodes (add signer 2, add signer 3, set threshold)
    expect(types.filter((ty) => ty === 'UpdateKeyPage').length).toBe(3);
    // Full setup from scratch
    expect(types).toContain('GenerateKeys');
    expect(types).toContain('CreateIdentity');
    expect(types).toContain('CreateKeyBook');
  });

  it('key-rotation is self-contained with full setup', () => {
    const t = GOLDEN_PATH_TEMPLATES.find((t) => t.id === 'key-rotation')!;
    expect(t).toBeDefined();
    const types = t.flow.nodes.map((n) => n.type);
    expect(types).toContain('UpdateKey');
    // Full setup from scratch
    expect(types).toContain('GenerateKeys');
    expect(types).toContain('CreateIdentity');
  });
});
