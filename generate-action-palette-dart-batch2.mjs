#!/usr/bin/env node
/**
 * Generate Action Palette Dart template files - Batch 2
 * Credits (3), Data (2), Key Management (3), Authority (1), Utilities (2) = 11 total
 */
import { createServer } from 'vite';
import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = 'C:/Accumulate_Stuff/on-boarding-platform/temp-download-Action-Palette-templates-dart';

const ACTION_PALETTE_BLOCKS = [
  // ── Credits (3) ──
  {
    name: 'Add Credits',
    blockType: 'AddCredits',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance'],
  },
  {
    name: 'Transfer Credits',
    blockType: 'TransferCredits',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateKeyPage'],
  },
  {
    name: 'Burn Credits',
    blockType: 'BurnCredits',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits'],
  },
  // ── Data (2) ──
  {
    name: 'Write Data',
    blockType: 'WriteData',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateDataAccount'],
  },
  {
    name: 'Write Data To',
    blockType: 'WriteDataTo',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'GenerateKeys'],
  },
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
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits'],
  },
  // ── Authority (1) ──
  {
    name: 'Update Account Auth',
    blockType: 'UpdateAccountAuth',
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
  const labelCounts = {};

  const nodes = [];
  const connections = [];

  for (const step of recipe) {
    labelCounts[step] = (labelCounts[step] || 0) + 1;
    const count = labelCounts[step];
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

  nodes.push({
    id: makeId(blockType),
    type: blockType,
    position: { x: 300, y: nodes.length * 160 },
    config: {},
    label: name,
  });

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
    root: path.join(__dirname, 'apps/studio'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });

  try {
    const codeGen = await vite.ssrLoadModule('/src/services/code-generator/index.ts');

    console.log(`Generating ${ACTION_PALETTE_BLOCKS.length} Action Palette templates (Dart Batch 2)`);
    mkdirSync(outputDir, { recursive: true });

    for (let i = 0; i < ACTION_PALETTE_BLOCKS.length; i++) {
      const { name, blockType, recipe } = ACTION_PALETTE_BLOCKS[i];
      const flow = buildFlow(name, blockType, recipe);
      console.log(`\nGenerating: ${name} (${blockType})`);
      console.log(`  Prerequisite chain: ${recipe.join(' → ')} → ${blockType}`);

      try {
        const code = codeGen.generateCode(flow, 'dart', 'sdk');
        const suffix = i === 0 ? '' : ` (${i})`;
        const filename = `accumulate_flow${suffix}.dart`;
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
