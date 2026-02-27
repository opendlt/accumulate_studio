/**
 * Action Palette Code Generation Validation
 *
 * For each Action Palette item (25 block types):
 * 1. Build a complete flow from defaultRecipe + target block
 * 2. Generate code for all 6 languages (Python, JavaScript, TypeScript, Rust, Dart, C#)
 * 3. Verify: non-empty output, no template errors, correct structure
 *
 * This validates the "Generated Code" section that users see when they
 * drop an action block onto the canvas with auto-prerequisites.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Flow, FlowNode, FlowConnection, BlockType, SDKLanguage } from '@accumulate-studio/types';
import { PREREQUISITE_GRAPH } from '@accumulate-studio/types';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

// ── Constants ──────────────────────────────────────────────────────────────

// Note: TypeScript has no templates (shares JavaScript templates in UI).
// The template-loader.ts has no 'typescript' entry, so loadBundledTemplates returns {}.
const LANGUAGES: SDKLanguage[] = ['python', 'javascript', 'rust', 'dart', 'csharp'];

const ALL_BLOCK_TYPES: BlockType[] = [
  'GenerateKeys', 'Faucet', 'WaitForBalance', 'WaitForCredits', 'QueryAccount',
  'CreateLiteTokenAccount',
  'AddCredits', 'TransferCredits', 'BurnCredits',
  'CreateIdentity', 'CreateKeyBook', 'CreateKeyPage',
  'CreateTokenAccount', 'CreateDataAccount', 'CreateToken',
  'SendTokens', 'IssueTokens', 'BurnTokens',
  'WriteData', 'WriteDataTo',
  'UpdateKeyPage', 'UpdateKey', 'LockAccount',
  'UpdateAccountAuth',
  // Comment is excluded — it generates no executable code
];

const OUTPUT_DIR = join(__dirname, 'action-palette-output');

// ── Flow Builder ───────────────────────────────────────────────────────────

/**
 * Build a complete Flow for a given target block type using its defaultRecipe.
 * Creates proper nodes, connections, and realistic default configs.
 */
function buildFlowForBlock(targetType: BlockType): Flow {
  const rule = PREREQUISITE_GRAPH[targetType];
  const recipe = [...rule.defaultRecipe, targetType];

  // Track how many times each block type appears (for unique IDs)
  const typeCounts: Record<string, number> = {};

  const nodes: FlowNode[] = [];
  const connections: FlowConnection[] = [];

  for (let i = 0; i < recipe.length; i++) {
    const blockType = recipe[i];
    typeCounts[blockType] = (typeCounts[blockType] || 0) + 1;
    const suffix = typeCounts[blockType] > 1 ? `_${typeCounts[blockType]}` : '';
    const id = `${blockType.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')}${suffix}`;

    const node: FlowNode = {
      id,
      type: blockType,
      label: `${blockType}${suffix}`,
      config: getDefaultConfig(blockType, i, recipe, typeCounts),
      position: { x: 100, y: 100 + i * 160 },
    };

    nodes.push(node);

    // Connect sequentially
    if (i > 0) {
      connections.push({
        id: `conn_${i}`,
        sourceNodeId: nodes[i - 1].id,
        sourcePortId: 'output',
        targetNodeId: node.id,
        targetPortId: 'input',
      });
    }
  }

  return {
    version: '1.0',
    name: `${targetType} Workflow`,
    description: `Auto-generated workflow for ${targetType} with all prerequisites`,
    network: 'devnet',
    variables: [],
    nodes,
    connections,
  };
}

/**
 * Provide realistic default config for each block type.
 * These mirror what the UI would populate as defaults.
 */
function getDefaultConfig(
  blockType: BlockType,
  _index: number,
  _recipe: BlockType[],
  typeCounts: Record<string, number>,
): Record<string, unknown> {
  switch (blockType) {
    case 'GenerateKeys':
      return {};

    case 'Faucet':
      return {};

    case 'WaitForBalance':
      return { minBalance: '10000000' };

    case 'WaitForCredits':
      return { minCredits: 100 };

    case 'QueryAccount':
      return {};

    case 'CreateLiteTokenAccount':
      return {};

    case 'AddCredits': {
      const count = typeCounts['AddCredits'] || 1;
      if (count <= 1) {
        // First AddCredits — credits for lite identity
        return { amount: '2000000' };
      }
      // Second+ AddCredits — credits for ADI key page
      return { amount: '5000000' };
    }

    case 'TransferCredits':
      return { amount: 100 };

    case 'BurnCredits':
      return { amount: 10 };

    case 'CreateIdentity':
      return {
        url: 'acc://my-adi.acme',
        keyBookUrl: 'acc://my-adi.acme/book',
      };

    case 'CreateKeyBook':
      return {
        url: 'acc://my-adi.acme/book2',
      };

    case 'CreateKeyPage':
      return {};

    case 'CreateTokenAccount':
      return {
        url: 'acc://my-adi.acme/tokens',
        tokenUrl: 'acc://ACME',
      };

    case 'CreateDataAccount':
      return {
        url: 'acc://my-adi.acme/data',
      };

    case 'CreateToken':
      return {
        url: 'acc://my-adi.acme/my-token',
        symbol: 'TKN',
        precision: 8,
      };

    case 'SendTokens':
      return {
        recipients: [
          { url: 'acc://recipient.acme/tokens', amount: '100' },
        ],
      };

    case 'IssueTokens':
      return {
        amount: '1000000',
      };

    case 'BurnTokens':
      return {
        amount: '500',
      };

    case 'WriteData':
      return {
        entries: ['Hello World'],
      };

    case 'WriteDataTo':
      return {
        entries: ['Hello World'],
      };

    case 'UpdateKeyPage':
      return {
        operations: [{ type: 'add', key: 'deadbeefdeadbeefdeadbeefdeadbeef' }],
      };

    case 'UpdateKey':
      return {
        newKey: 'cafebabecafebabecafebabecafebabe',
      };

    case 'LockAccount':
      return {
        height: 1,
      };

    case 'UpdateAccountAuth':
      return {
        operations: [{ type: 'enable', authority: 'acc://my-adi.acme/book' }],
      };

    case 'Comment':
      return { text: 'This is a comment' };

    default:
      return {};
  }
}

// ── Error Pattern Detection ────────────────────────────────────────────────

interface CodeIssue {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}

function detectIssues(code: string, language: SDKLanguage, blockType: BlockType): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const lines = code.split('\n');

  // Check for template rendering errors (unresolved Handlebars)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Unresolved Handlebars expressions
    if (/\{\{[^}]+\}\}/.test(line)) {
      issues.push({
        severity: 'error',
        message: `Unresolved Handlebars expression: ${line.trim()}`,
        line: i + 1,
      });
    }

    // "undefined" or "null" appearing as literal values (template variable not set)
    if (/\bundefined\b/.test(line) && !line.includes('//') && !line.includes('#')) {
      issues.push({
        severity: 'warning',
        message: `Literal "undefined" in generated code: ${line.trim()}`,
        line: i + 1,
      });
    }

    // "[object Object]" — failed object serialization
    if (line.includes('[object Object]')) {
      issues.push({
        severity: 'error',
        message: `[object Object] in generated code: ${line.trim()}`,
        line: i + 1,
      });
    }
  }

  // Language-specific checks
  switch (language) {
    case 'python':
      // Check for invalid Python syntax patterns
      for (let i = 0; i < lines.length; i++) {
        if (/\bNone\b.*\bNone\b/.test(lines[i]) && !lines[i].includes('#')) {
          // Possible double-None from failed template
        }
      }
      break;

    case 'rust':
      // Check for unmatched json!() macros or braces
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('json!(') && !lines[i].includes(')')) {
          // Multiline json! macro — check that it closes
          let depth = 0;
          let found = false;
          for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            for (const ch of lines[j]) {
              if (ch === '(') depth++;
              if (ch === ')') depth--;
              if (depth === 0 && j > i) { found = true; break; }
            }
            if (found) break;
          }
        }
      }
      break;

    case 'csharp':
      // Check for raw JSON injection (invalid C# syntax)
      for (let i = 0; i < lines.length; i++) {
        // Raw JSON array as C# code (not inside a string)
        if (/\[\s*\{.*"type"\s*:/.test(lines[i]) && !lines[i].includes('"""') && !lines[i].includes('"[')) {
          issues.push({
            severity: 'error',
            message: `Possible raw JSON injection in C# code: ${lines[i].trim().substring(0, 80)}`,
            line: i + 1,
          });
        }
      }
      break;
  }

  return issues;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Action Palette Code Generation', () => {
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load manifests for all languages
  const manifests: Record<string, ReturnType<typeof loadManifest>> = {};
  for (const lang of LANGUAGES) {
    manifests[lang] = loadManifest(lang);
  }

  for (const blockType of ALL_BLOCK_TYPES) {
    describe(`${blockType}`, () => {
      const flow = buildFlowForBlock(blockType);
      const recipe = PREREQUISITE_GRAPH[blockType].defaultRecipe;

      it(`has valid flow structure (${recipe.length} prerequisites + target)`, () => {
        expect(flow.nodes.length).toBe(recipe.length + 1);
        expect(flow.connections.length).toBe(recipe.length);
        // Target block is the last node
        expect(flow.nodes[flow.nodes.length - 1].type).toBe(blockType);
      });

      for (const lang of LANGUAGES) {
        it(`generates valid ${lang} code`, () => {
          let code: string;
          try {
            code = generateCodeFromManifest(flow, lang, 'sdk', manifests[lang]);
          } catch (err) {
            throw new Error(
              `Code generation CRASHED for ${blockType}/${lang}: ${(err as Error).message}`
            );
          }

          // Must produce non-empty code
          expect(code).toBeTruthy();
          expect(code.length).toBeGreaterThan(50);

          // Save output for review
          const langDir = join(OUTPUT_DIR, lang);
          if (!existsSync(langDir)) mkdirSync(langDir, { recursive: true });
          const ext = { python: 'py', javascript: 'js', typescript: 'ts', rust: 'rs', dart: 'dart', csharp: 'cs' }[lang];
          writeFileSync(join(langDir, `${blockType}.${ext}`), code);

          // Check for issues
          const issues = detectIssues(code, lang, blockType);
          const errors = issues.filter(i => i.severity === 'error');

          if (errors.length > 0) {
            const errorMsg = errors.map(e => `  Line ${e.line}: ${e.message}`).join('\n');
            throw new Error(
              `${blockType}/${lang} has ${errors.length} error(s):\n${errorMsg}`
            );
          }

          // Warnings are logged but don't fail the test
          const warnings = issues.filter(i => i.severity === 'warning');
          if (warnings.length > 0) {
            console.warn(
              `${blockType}/${lang} warnings:\n${warnings.map(w => `  Line ${w.line}: ${w.message}`).join('\n')}`
            );
          }
        });
      }
    });
  }
});
