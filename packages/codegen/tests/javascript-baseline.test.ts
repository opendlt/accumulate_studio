/**
 * JavaScript SDK Example Baseline Tests
 *
 * Runs each SDK example against the mock HTTP server to capture the RPC call
 * sequence as a golden baseline JSON file.
 *
 * The JS SDK examples are TypeScript files — we run them via `npx tsx`.
 *
 * To regenerate baselines: vitest run javascript-baseline
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SDK_DIR = process.env.JS_SDK_DIR || 'C:/Accumulate_Stuff/opendlt-javascript-v2v3-sdk/javascript';
const SDK_EXAMPLE_DIR = join(SDK_DIR, 'examples/v3');
const HARNESS_PATH = join(__dirname, 'validate_javascript.py');
const BASELINES_DIR = join(__dirname, 'baselines/javascript');

/**
 * Extract the last top-level JSON object from output by brace matching.
 */
function extractJson(output: string): Record<string, unknown> | null {
  const lastBrace = output.lastIndexOf('}');
  if (lastBrace < 0) return null;
  let depth = 0;
  for (let i = lastBrace; i >= 0; i--) {
    if (output[i] === '}') depth++;
    if (output[i] === '{') depth--;
    if (depth === 0) {
      return JSON.parse(output.slice(i, lastBrace + 1));
    }
  }
  return null;
}

// SDK examples mapped to their template equivalents
const EXAMPLES: Array<{
  file: string;
  name: string;
  templateMapping: string;
  description: string;
}> = [
  {
    file: 'example_01_lite_identities.ts',
    name: 'example_01',
    templateMapping: 'lite-account-setup',
    description: 'Lite identity setup: faucet, credits, send tokens',
  },
  {
    file: 'example_02_adi_creation.ts',
    name: 'example_02',
    templateMapping: 'adi-creation',
    description: 'ADI creation: faucet, credits, create identity',
  },
  {
    file: 'example_03_token_accounts.ts',
    name: 'example_03',
    templateMapping: 'zero-to-hero,token-transfer',
    description: 'ADI token accounts: create token account, send tokens',
  },
  {
    file: 'example_04_data_accounts.ts',
    name: 'example_04',
    templateMapping: 'data-writing',
    description: 'Data accounts: create data account, write data',
  },
  {
    file: 'example_06_custom_tokens.ts',
    name: 'example_06',
    templateMapping: 'custom-token',
    description: 'Custom tokens: create token, issue tokens',
  },
  {
    file: 'example_09_key_management.ts',
    name: 'example_09',
    templateMapping: 'key-rotation',
    description: 'Key management: update key page',
  },
  {
    file: 'example_10_threshold_updates.ts',
    name: 'example_10',
    templateMapping: 'multi-sig-setup',
    description: 'Key page threshold: update key page threshold',
  },
];

// Ensure baselines directory exists
if (!existsSync(BASELINES_DIR)) {
  mkdirSync(BASELINES_DIR, { recursive: true });
}

describe('JavaScript SDK Example Baselines', () => {
  for (const example of EXAMPLES) {
    it(`${example.name} (${example.description}) runs under mock`, () => {
      const examplePath = join(SDK_EXAMPLE_DIR, example.file);

      if (!existsSync(examplePath)) {
        console.warn(`Skipping ${example.name}: file not found at ${examplePath}`);
        return;
      }

      // Run through mock harness using tsx (TypeScript examples import from
      // relative source paths, so we run them with the SDK as cwd)
      let output: string;
      try {
        // Use the validate_javascript.py run_ts_example mode:
        // python validate_javascript.py --tsx <ts_file> <sdk_dir>
        output = execSync(
          `python "${HARNESS_PATH}" --tsx "${examplePath}" "${SDK_DIR}"`,
          { encoding: 'utf-8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] },
        );
      } catch (err) {
        const error = err as { stderr?: string; stdout?: string };
        output = (error.stdout || '') + (error.stderr || '');
      }

      // Parse JSON report
      const report = extractJson(output) as {
        success: boolean;
        error: string | null;
        call_count: number;
        calls: Array<{ method: string; params?: Record<string, unknown> }>;
      } | null;

      expect(report, `No JSON report found in output`).not.toBeNull();
      expect(report!.call_count).toBeGreaterThan(0);

      // Save baseline
      const baseline = {
        example: example.name,
        jsExample: example.file,
        templateMapping: example.templateMapping,
        call_count: report!.call_count,
        calls: report!.calls.map((call) => ({
          method: call.method,
          ...(call.method === 'submit' && call.params?.envelope
            ? {
                bodyType: (
                  call.params.envelope as { transaction?: { body?: { type?: string } } }
                ).transaction?.body?.type,
              }
            : {}),
          ...(call.method === 'query' && call.params?.scope
            ? {
                scopeType: String(call.params.scope).startsWith('acc://')
                  ? 'account'
                  : 'txid',
              }
            : {}),
        })),
      };

      const baselinePath = join(BASELINES_DIR, `${example.name}.baseline.json`);
      writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');

      expect(existsSync(baselinePath)).toBe(true);
    }, 240000); // 4 minute timeout per example
  }
});
