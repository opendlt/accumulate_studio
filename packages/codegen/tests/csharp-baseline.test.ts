/**
 * C# SDK Example Baseline Capture
 *
 * Runs each SDK example against the mock harness and saves the RPC call
 * sequences as baseline JSON files. These baselines can then be compared
 * against generated code RPC patterns.
 *
 * To run: vitest run csharp-baseline
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const CSHARP_HARNESS_PY = join(__dirname, 'validate_csharp.py');
const BASELINES_DIR = join(__dirname, 'baselines', 'csharp');
const EXAMPLES_DIR = 'C:\\Accumulate_Stuff\\opendlt-c-sharp-v2v3-sdk\\examples\\v3';

// Map example directory names to baseline names
const EXAMPLES: Array<{ dir: string; baseline: string }> = [
  { dir: 'Example01_LiteIdentities', baseline: 'example_01' },
  { dir: 'Example02_AccumulateIdentities', baseline: 'example_02' },
  { dir: 'Example03_AdiTokenAccounts', baseline: 'example_03' },
  { dir: 'Example04_DataAccountsEntries', baseline: 'example_04' },
  { dir: 'Example05_AdiToAdiTransfer', baseline: 'example_05' },
  { dir: 'Example06_CustomTokens', baseline: 'example_06' },
  { dir: 'Example08_QueryTxSignatures', baseline: 'example_08' },
  { dir: 'Example09_KeyManagement', baseline: 'example_09' },
  { dir: 'Example10_UpdateKeyPageThreshold', baseline: 'example_10' },
  { dir: 'Example11_MultiSignatureTypes', baseline: 'example_11' },
  { dir: 'Example12_QuickstartDemo', baseline: 'example_12' },
  { dir: 'Example13_AdiToAdiTransferWithHeaderOptions', baseline: 'example_13' },
];

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

describe('C# SDK Example Baselines', () => {
  if (!existsSync(BASELINES_DIR)) {
    mkdirSync(BASELINES_DIR, { recursive: true });
  }

  for (const { dir, baseline } of EXAMPLES) {
    it(`captures baseline for ${dir}`, () => {
      const exampleDir = join(EXAMPLES_DIR, dir);
      if (!existsSync(exampleDir)) {
        console.warn(`Example directory not found: ${exampleDir}`);
        return;
      }

      let output: string;
      try {
        output = execSync(
          `python "${CSHARP_HARNESS_PY}" --example "${exampleDir}"`,
          { encoding: 'utf-8', timeout: 180000 },
        );
      } catch (err) {
        const error = err as { stderr?: string; stdout?: string };
        output = (error.stdout || '') + (error.stderr || '');
      }

      const report = extractJson(output);
      if (!report) {
        console.warn(`No JSON report for ${dir}`);
        return;
      }

      const baselinePath = join(BASELINES_DIR, `${baseline}.baseline.json`);
      writeFileSync(baselinePath, JSON.stringify(report, null, 2));

      // Verify we captured some calls
      const callCount = report.call_count as number;
      expect(callCount).toBeGreaterThan(0);
    }, 180000); // 3 minute timeout per example
  }
});
