/**
 * Python SDK Example Baseline Tests
 *
 * Runs each SDK example through the Python mock harness and captures the
 * RPC call sequence as a golden baseline JSON file. These baselines represent
 * "what correct code does" and are used for comparison in python-validation tests.
 *
 * To regenerate baselines: vitest run python-baseline
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SDK_EXAMPLES_DIR = process.env.PYTHON_SDK_EXAMPLES_DIR || 'C:/Accumulate_Stuff/opendlt-python-v2v3-sdk/unified/examples/v3';
const HARNESS_PATH = join(__dirname, 'validate_python.py');
const BASELINES_DIR = join(__dirname, 'baselines');

/**
 * Extract the last top-level JSON object from output by brace matching.
 * The mock harness outputs print() statements followed by a JSON report.
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
    file: 'example_01_lite_identities.py',
    name: 'example_01',
    templateMapping: 'lite-account-setup',
    description: 'Lite identity setup: faucet, credits, send tokens',
  },
  {
    file: 'example_02_accumulate_identities.py',
    name: 'example_02',
    templateMapping: 'adi-creation',
    description: 'ADI creation: faucet, credits, create identity, key page credits',
  },
  {
    file: 'example_03_adi_token_accounts.py',
    name: 'example_03',
    templateMapping: 'zero-to-hero,token-transfer',
    description: 'ADI token accounts: create token account, send tokens',
  },
  {
    file: 'example_04_data_accounts_entries.py',
    name: 'example_04',
    templateMapping: 'data-writing',
    description: 'Data accounts: create data account, write data',
  },
  {
    file: 'example_06_custom_tokens.py',
    name: 'example_06',
    templateMapping: 'custom-token',
    description: 'Custom tokens: create token, issue tokens',
  },
  {
    file: 'example_09_key_management.py',
    name: 'example_09',
    templateMapping: 'key-rotation',
    description: 'Key management: update key page',
  },
  {
    file: 'example_10_update_key_page_threshold.py',
    name: 'example_10',
    templateMapping: 'multi-sig-setup',
    description: 'Key page threshold: update key page threshold',
  },
];

// Ensure baselines directory exists
if (!existsSync(BASELINES_DIR)) {
  mkdirSync(BASELINES_DIR, { recursive: true });
}

describe('Python SDK Example Baselines', () => {
  for (const example of EXAMPLES) {
    const examplePath = join(SDK_EXAMPLES_DIR, example.file);

    it(`${example.name} (${example.description}) runs under mock`, () => {
      // Skip if example file doesn't exist
      if (!existsSync(examplePath)) {
        console.warn(`Skipping ${example.file}: file not found at ${examplePath}`);
        return;
      }

      // Run the example through the mock harness
      const output = execSync(
        `python "${HARNESS_PATH}" "${examplePath}"`,
        { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] },
      );

      // Parse JSON report from output
      const report = extractJson(output) as { success: boolean; error: string | null; call_count: number; calls: Array<{ method: string; params?: Record<string, unknown> }> };
      expect(report, `No JSON report found in output (${output.length} chars)`).not.toBeNull();
      expect(report.success).toBe(true);
      expect(report.error).toBeNull();
      expect(report.call_count).toBeGreaterThan(0);

      // Save baseline
      const baseline = {
        example: example.name,
        file: example.file,
        templateMapping: example.templateMapping,
        call_count: report.call_count,
        calls: report.calls.map((call: { method: string; params?: Record<string, unknown> }) => ({
          method: call.method,
          // Normalize params: only keep the method and body type for submit calls
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
          ...(call.method === 'network-status' ? {} : {}),
          ...(call.method === 'faucet' ? {} : {}),
        })),
      };

      const baselinePath = join(BASELINES_DIR, `${example.name}.baseline.json`);
      writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');

      // Verify the baseline was written
      expect(existsSync(baselinePath)).toBe(true);
    });
  }
});
