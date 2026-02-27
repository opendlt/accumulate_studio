#!/usr/bin/env node
/**
 * Generate Action Palette JavaScript template files
 * These are single-action flows with auto-inserted prerequisite chains.
 */
import { createServer } from 'vite';
import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = 'C:/Accumulate_Stuff/on-boarding-platform/temp-download-Action-Palette-templates-javascript';

// The 6 Action Palette block types for Key Management, Authority, and Utilities
const ACTION_PALETTE_BLOCKS = [
  // ── Key Management (3) ──
  {
    name: 'Update Key Page',
    blockType: 'UpdateKeyPage',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'GenerateKeys'],
  },
  {
    name: 'Update Key',
    blockType: 'UpdateKey',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'GenerateKeys'],
  },
  {
    name: 'Lock Account',
    blockType: 'LockAccount',
    // Only LiteTokenAccounts are lockable in the Accumulate protocol (ADIs are not)
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits'],
  },
  // ── Authority (1) ──
  {
    name: 'Update Account Auth',
    blockType: 'UpdateAccountAuth',
    // Target the ADI identity directly (it has the book as an explicit authority).
    // Sub-accounts inherit authorities from the parent and don't have their own auth entries.
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits'],
  },
  // ── Utilities (2) ──
  {
    name: 'Faucet',
    blockType: 'Faucet',
    recipe: ['GenerateKeys'],
  },
  {
    name: 'Query Account',
    blockType: 'QueryAccount',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance'],
  },
];

function buildFlow(name, blockType, recipe) {
  let nodeIdCounter = 0;
  const makeId = (type) => `${type.toLowerCase()}_${++nodeIdCounter}`;
  // Track label counts to make duplicate labels unique
  const labelCounts = {};

  const nodes = [];
  const connections = [];

  // Create prerequisite nodes (empty configs, like insertPrerequisiteChain does)
  for (const step of recipe) {
    labelCounts[step] = (labelCounts[step] || 0) + 1;
    const count = labelCounts[step];
    // Add suffix for duplicates (e.g., "AddCredits" → "Credit Key Page" for 2nd occurrence)
    let label = step;
    if (step === 'AddCredits' && count === 2) label = 'Credit Key Page';
    else if (step === 'WaitForCredits' && count === 2) label = 'Wait for Key Page Credits';
    else if (count > 1) label = `${step} ${count}`;
    nodes.push({
      id: makeId(step),
      type: step,
      position: { x: 300, y: nodes.length * 160 },
      config: {},
      label,
    });
  }

  // Create the target action node (empty config)
  nodes.push({
    id: makeId(blockType),
    type: blockType,
    position: { x: 300, y: nodes.length * 160 },
    config: {},
    label: name,
  });

  // Connect nodes in sequence
  for (let i = 0; i < nodes.length - 1; i++) {
    connections.push({
      id: `conn_${i}`,
      sourceNodeId: nodes[i].id,
      sourcePortId: 'output',
      targetNodeId: nodes[i + 1].id,
      targetPortId: 'input',
    });
  }

  return {
    version: '1.0',
    name: `Untitled Flow`,
    description: '',
    network: 'kermit',
    variables: [],
    nodes,
    connections,
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

    console.log(`Generating ${ACTION_PALETTE_BLOCKS.length} Action Palette templates`);
    mkdirSync(outputDir, { recursive: true });

    for (let i = 0; i < ACTION_PALETTE_BLOCKS.length; i++) {
      const { name, blockType, recipe } = ACTION_PALETTE_BLOCKS[i];
      const flow = buildFlow(name, blockType, recipe);
      console.log(`\nGenerating: ${name} (${blockType})`);
      console.log(`  Prerequisite chain: ${recipe.join(' → ')} → ${blockType}`);

      try {
        const code = codeGen.generateCode(flow, 'javascript', 'sdk');
        const suffix = i === 0 ? '' : ` (${i})`;
        const filename = `accumulate_flow${suffix}.js`;
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
