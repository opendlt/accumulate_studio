#!/usr/bin/env node
/**
 * Generate Action Palette Dart template files
 * Categories: Identity (3), Accounts (4), Tokens (3) = 10 total
 */
import { createServer } from 'vite';
import path from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = 'C:/Accumulate_Stuff/on-boarding-platform/temp-download-Action-Palette-templates-dart';

const ACTION_PALETTE_BLOCKS = [
  // ── Identity (3) ──
  {
    name: 'Create Identity',
    blockType: 'CreateIdentity',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits'],
  },
  {
    name: 'Create Key Book',
    blockType: 'CreateKeyBook',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits'],
  },
  {
    name: 'Create Key Page',
    blockType: 'CreateKeyPage',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits'],
  },
  // ── Accounts (4) ──
  {
    name: 'Create Token Account',
    blockType: 'CreateTokenAccount',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits'],
  },
  {
    name: 'Create Data Account',
    blockType: 'CreateDataAccount',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits'],
  },
  {
    name: 'Create Token Issuer',
    blockType: 'CreateToken',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits'],
  },
  {
    name: 'Create Lite Token Account',
    blockType: 'CreateLiteTokenAccount',
    recipe: ['GenerateKeys'],
  },
  // ── Tokens (3) ──
  {
    name: 'Send Tokens',
    blockType: 'SendTokens',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'GenerateKeys'],
  },
  {
    name: 'Issue Tokens',
    blockType: 'IssueTokens',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateToken',
      'CreateTokenAccount'],
  },
  {
    name: 'Burn Tokens',
    blockType: 'BurnTokens',
    recipe: ['GenerateKeys', 'Faucet', 'WaitForBalance', 'AddCredits', 'WaitForCredits',
      'CreateIdentity', 'AddCredits', 'WaitForCredits', 'CreateToken',
      'CreateTokenAccount', 'IssueTokens'],
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

    console.log(`Generating ${ACTION_PALETTE_BLOCKS.length} Action Palette templates (Dart)`);
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
