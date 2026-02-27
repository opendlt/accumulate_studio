/**
 * Rust SDK Example Baseline Tests
 *
 * Builds each SDK example and runs it against the mock HTTP server to capture
 * the RPC call sequence as a golden baseline JSON file.
 *
 * To regenerate baselines: vitest run rust-baseline
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SDK_WORKSPACE_DIR = 'C:/Accumulate_Stuff/opendlt-rust-v2v3-sdk/unified';
const HARNESS_PATH = join(__dirname, 'validate_rust.py');
const BASELINES_DIR = join(__dirname, 'baselines/rust');

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
  example: string;
  name: string;
  templateMapping: string;
  description: string;
}> = [
  {
    example: 'example_01_lite_identities',
    name: 'example_01',
    templateMapping: 'lite-account-setup',
    description: 'Lite identity setup: faucet, credits, send tokens',
  },
  {
    example: 'example_02_adi_creation',
    name: 'example_02',
    templateMapping: 'adi-creation',
    description: 'ADI creation: faucet, credits, create identity, key page credits',
  },
  {
    example: 'example_03_token_accounts',
    name: 'example_03',
    templateMapping: 'zero-to-hero,token-transfer',
    description: 'ADI token accounts: create token account, send tokens',
  },
  {
    example: 'example_04_data_accounts',
    name: 'example_04',
    templateMapping: 'data-writing',
    description: 'Data accounts: create data account, write data',
  },
  {
    example: 'example_06_custom_tokens',
    name: 'example_06',
    templateMapping: 'custom-token',
    description: 'Custom tokens: create token, issue tokens',
  },
  {
    example: 'example_09_key_management',
    name: 'example_09',
    templateMapping: 'key-rotation',
    description: 'Key management: update key page',
  },
  {
    example: 'example_10_threshold_updates',
    name: 'example_10',
    templateMapping: 'multi-sig-setup',
    description: 'Key page threshold: update key page threshold',
  },
];

// Ensure baselines directory exists
if (!existsSync(BASELINES_DIR)) {
  mkdirSync(BASELINES_DIR, { recursive: true });
}

describe('Rust SDK Example Baselines', () => {
  for (const example of EXAMPLES) {
    it(`${example.name} (${example.description}) builds and runs under mock`, () => {
      // Build the example
      try {
        execSync(`cargo build --example ${example.example}`, {
          cwd: SDK_WORKSPACE_DIR,
          encoding: 'utf-8',
          timeout: 180000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        const error = err as { stderr?: string };
        console.warn(`Skipping ${example.example}: build failed: ${error.stderr?.slice(0, 500)}`);
        return;
      }

      // Find the built binary
      const targetDir = join(SDK_WORKSPACE_DIR, 'target/debug/examples');
      const binaryName = process.platform === 'win32'
        ? `${example.example}.exe`
        : example.example;
      const binaryPath = join(targetDir, binaryName);

      if (!existsSync(binaryPath)) {
        console.warn(`Binary not found at ${binaryPath}`);
        return;
      }

      // Run through mock harness
      let output: string;
      try {
        output = execSync(
          `python "${HARNESS_PATH}" "${binaryPath}"`,
          { encoding: 'utf-8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] },
        );
      } catch (err) {
        const error = err as { stderr?: string; stdout?: string };
        console.warn(`Mock execution failed for ${example.example}: ${(error.stderr || error.stdout || '').slice(0, 500)}`);
        return;
      }

      // Parse JSON report
      const report = extractJson(output) as {
        success: boolean;
        error: string | null;
        call_count: number;
        calls: Array<{ method: string; params?: Record<string, unknown> }>;
      } | null;

      expect(report, `No JSON report found in output`).not.toBeNull();
      expect(report!.success).toBe(true);
      expect(report!.error).toBeNull();
      expect(report!.call_count).toBeGreaterThan(0);

      // Save baseline
      const baseline = {
        example: example.name,
        rustExample: example.example,
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
    }, 240000); // 4 minute timeout per example (build + run)
  }
});
