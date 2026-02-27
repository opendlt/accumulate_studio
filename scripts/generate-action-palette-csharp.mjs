#!/usr/bin/env node
/**
 * Generate C# Action Palette template files.
 * These mimic what the studio produces when a user drags a block
 * from the action palette — prerequisite blocks with empty configs.
 */
import { createServer } from 'vite';
import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '..', 'output', 'action-palette-csharp');

// Action palette flows: target block type → prerequisite recipe (from PREREQUISITE_GRAPH)
// Batch 3: Key Management (UpdateKeyPage, UpdateKey), Authority (UpdateAccountAuth), Utilities (LockAccount, Faucet, QueryAccount)
const ACTION_PALETTE_FLOWS = [
  {
    name: 'Action Palette: UpdateKeyPage',
    target: 'UpdateKeyPage',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits', 'CreateIdentity', 'AddCredits', 'WaitForCredits', 'GenerateKeys'],
  },
  {
    name: 'Action Palette: UpdateKey',
    target: 'UpdateKey',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits', 'CreateIdentity', 'AddCredits', 'WaitForCredits', 'GenerateKeys'],
  },
  {
    name: 'Action Palette: LockAccount',
    target: 'LockAccount',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits', 'CreateIdentity', 'AddCredits', 'WaitForCredits'],
  },
  {
    name: 'Action Palette: UpdateAccountAuth',
    target: 'UpdateAccountAuth',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits', 'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateTokenAccount'],
  },
  {
    name: 'Action Palette: Faucet',
    target: 'Faucet',
    recipe: ['GenerateKeys'],
  },
  {
    name: 'Action Palette: QueryAccount',
    target: 'QueryAccount',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance'],
  },
];

/** Build a synthetic flow that mimics the action palette output */
function buildActionPaletteFlow(name, targetType, recipe) {
  const nodes = [];
  const connections = [];
  const typeCounts = {};

  // Create prerequisite nodes with EMPTY configs (as the action palette does)
  // The action palette generates unique IDs with timestamps + random suffixes
  // and does NOT set labels — nodeToVarName falls back to node.id
  for (let i = 0; i < recipe.length; i++) {
    const type = recipe[i];
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    const suffix = typeCounts[type] > 1 ? `_${typeCounts[type]}` : '';
    const id = `prereq_${type.toLowerCase()}${suffix}_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

    nodes.push({
      id,
      type,
      // No label — matches action palette behavior (unique ID becomes var name)
      config: {},  // Empty config — this is the key characteristic
      position: { x: 300, y: 80 + i * 160 },
    });

    if (i > 0) {
      connections.push({
        id: `conn_${i}`,
        sourceNodeId: nodes[i - 1].id,
        sourcePortId: 'output',
        targetNodeId: id,
        targetPortId: 'input',
      });
    }
  }

  // Create target node with EMPTY config
  typeCounts[targetType] = (typeCounts[targetType] || 0) + 1;
  const targetId = `target_${targetType.toLowerCase()}_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  nodes.push({
    id: targetId,
    type: targetType,
    // No label — matches action palette behavior
    config: {},  // Empty config
    position: { x: 300, y: 80 + recipe.length * 160 },
  });

  if (nodes.length > 1) {
    connections.push({
      id: `conn_target`,
      sourceNodeId: nodes[nodes.length - 2].id,
      sourcePortId: 'output',
      targetNodeId: targetId,
      targetPortId: 'input',
    });
  }

  return {
    version: '1.0',
    name,
    description: `Action palette flow for ${targetType}`,
    variables: [],
    nodes,
    connections,
    assertions: [],
    network: 'kermit',
  };
}

async function main() {
  const vite = await createServer({
    root: path.join(__dirname, '..', 'apps/studio'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });

  try {
    const codeGen = await vite.ssrLoadModule('/src/services/code-generator/index.ts');

    console.log(`Generating ${ACTION_PALETTE_FLOWS.length} action palette C# templates`);
    mkdirSync(outputDir, { recursive: true });

    for (let i = 0; i < ACTION_PALETTE_FLOWS.length; i++) {
      const { name, target, recipe } = ACTION_PALETTE_FLOWS[i];
      const flow = buildActionPaletteFlow(name, target, recipe);
      console.log(`\nGenerating: ${name} (${recipe.length} prereqs + target)`);

      try {
        const code = codeGen.generateCode(flow, 'csharp', 'sdk');
        const suffix = i === 0 ? '' : ` (${i})`;
        const filename = `accumulate_flow${suffix}.cs`;
        writeFileSync(path.join(outputDir, filename), code, 'utf-8');
        console.log(`  -> ${filename} (${code.length} bytes)`);
      } catch (err) {
        console.error(`  ERROR generating ${name}:`, err.message);
        if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
      }
    }
  } finally {
    await vite.close();
  }
}

main().catch(console.error);
