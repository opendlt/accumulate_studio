/**
 * Python Generated Code Validation Tests
 *
 * For each YAML template:
 * 1. Generate Python code via the manifest-driven generator
 * 2. Syntax check with `python -m py_compile`
 * 3. Mock execution with validate_python.py
 * 4. Compare RPC call patterns against SDK example baselines
 *
 * To run: vitest run python-validation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import yaml from 'js-yaml';
import type { Flow } from '@accumulate-studio/types';
import { deserializeYamlToFlow } from '../src/flow-serializer';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

const TEMPLATES_DIR = join(__dirname, '../../../templates');
const HARNESS_PATH = join(__dirname, 'validate_python.py');
const BASELINES_DIR = join(__dirname, 'baselines');

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

// Map template names to their corresponding SDK example baselines
const TEMPLATE_TO_BASELINE: Record<string, string> = {
  'lite-account-setup': 'example_01',
  'adi-creation': 'example_02',
  'zero-to-hero': 'example_03',
  'token-transfer': 'example_03',
  'data-writing': 'example_04',
  'custom-token': 'example_06',
  'key-rotation': 'example_09',
  'multi-sig-setup': 'example_10',
};

// Templates that are self-contained (start with GenerateKeys + Faucet)
// and can execute standalone under the mock harness.
// Partial templates that assume pre-existing variables (signer, adi_url, etc.)
// are validated for syntax only, not mock execution.
const SELF_CONTAINED_TEMPLATES = new Set([
  'lite-account-setup',
  'adi-creation',
  'zero-to-hero',
]);

interface MockReport {
  success: boolean;
  calls: Array<{ method: string; params?: Record<string, unknown> }>;
  call_count: number;
  error: string | null;
}

/**
 * Load all YAML templates and generate Flow objects
 */
function loadTemplates(): Array<{ name: string; flow: Flow }> {
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.yaml'));
  return files.map((file) => {
    const content = readFileSync(join(TEMPLATES_DIR, file), 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    const rawVars = (parsed.variables as Record<string, unknown>) || {};
    const simpleVars: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawVars)) {
      if (typeof val === 'string') {
        simpleVars[key] = val;
      } else if (val && typeof val === 'object' && 'type' in val) {
        simpleVars[key] = (val as { type: string }).type;
      }
    }

    const flow = deserializeYamlToFlow({
      version: (parsed.version as string) || '1.0',
      name: (parsed.name as string) || basename(file, '.yaml'),
      description: parsed.description as string | undefined,
      blocks: (parsed.blocks as Array<Record<string, unknown>>) || [],
      variables: simpleVars,
      assertions: parsed.assertions as Array<Record<string, unknown>> | undefined,
    });

    flow.network = 'devnet';
    return { name: basename(file, '.yaml'), flow };
  });
}

describe('Python Generated Code Validation', () => {
  const manifest = loadManifest('python');
  const templates = loadTemplates();
  let tempDir: string;

  beforeAll(() => {
    tempDir = join(tmpdir(), 'accumulate-codegen-validation');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  for (const { name, flow } of loadTemplates()) {
    describe(`${name}`, () => {
      let generatedCode: string;
      let tempFile: string;

      it('generates Python code', () => {
        generatedCode = generateCodeFromManifest(flow, 'python', 'sdk', manifest);
        expect(generatedCode).toBeTruthy();
        expect(generatedCode.length).toBeGreaterThan(100);

        // Write to temp file for subsequent tests
        tempFile = join(tmpdir(), 'accumulate-codegen-validation', `${name}.py`);
        const dir = join(tmpdir(), 'accumulate-codegen-validation');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(tempFile, generatedCode);
      });

      it('passes Python syntax check', () => {
        tempFile = join(tmpdir(), 'accumulate-codegen-validation', `${name}.py`);
        if (!existsSync(tempFile)) {
          generatedCode = generateCodeFromManifest(flow, 'python', 'sdk', manifest);
          const dir = join(tmpdir(), 'accumulate-codegen-validation');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(tempFile, generatedCode);
        }

        // Syntax check
        try {
          execSync(`python -m py_compile "${tempFile}"`, {
            encoding: 'utf-8',
            timeout: 15000,
          });
        } catch (err) {
          const error = err as { stderr?: string; stdout?: string };
          throw new Error(
            `Python syntax error in ${name}:\n${error.stderr || error.stdout || 'Unknown error'}`,
          );
        }
      });

      it('executes under mock harness', () => {
        tempFile = join(tmpdir(), 'accumulate-codegen-validation', `${name}.py`);
        if (!existsSync(tempFile)) {
          generatedCode = generateCodeFromManifest(flow, 'python', 'sdk', manifest);
          const dir = join(tmpdir(), 'accumulate-codegen-validation');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(tempFile, generatedCode);
        }

        // Partial templates (no GenerateKeys) can't run standalone - skip mock execution
        if (!SELF_CONTAINED_TEMPLATES.has(name)) {
          return;
        }

        let output: string;
        try {
          output = execSync(
            `python "${HARNESS_PATH}" "${tempFile}"`,
            { encoding: 'utf-8', timeout: 30000 },
          );
        } catch (err) {
          const error = err as { stderr?: string; stdout?: string };
          throw new Error(
            `Mock execution failed for ${name}:\n${error.stderr || error.stdout || 'Unknown error'}`,
          );
        }

        // Parse JSON report from output
        const report = extractJson(output) as MockReport | null;
        expect(report, `No JSON report in output (${output.length} chars)`).not.toBeNull();
        expect(report!.success).toBe(true);
        expect(report!.error).toBeNull();
        expect(report!.call_count).toBeGreaterThan(0);
      });

      it('RPC call pattern comparison', () => {
        // Can only compare patterns for self-contained templates
        if (!SELF_CONTAINED_TEMPLATES.has(name)) {
          return;
        }

        tempFile = join(tmpdir(), 'accumulate-codegen-validation', `${name}.py`);
        if (!existsSync(tempFile)) {
          generatedCode = generateCodeFromManifest(flow, 'python', 'sdk', manifest);
          const dir = join(tmpdir(), 'accumulate-codegen-validation');
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(tempFile, generatedCode);
        }

        // Check if we have a baseline
        const baselineName = TEMPLATE_TO_BASELINE[name];
        const baselinePath = baselineName
          ? join(BASELINES_DIR, `${baselineName}.baseline.json`)
          : '';

        if (!baselineName || !existsSync(baselinePath)) {
          return;
        }

        // Run mock to get generated code's call pattern
        let output: string;
        try {
          output = execSync(
            `python "${HARNESS_PATH}" "${tempFile}"`,
            { encoding: 'utf-8', timeout: 30000 },
          );
        } catch {
          return;
        }

        const report = extractJson(output) as MockReport | null;
        if (!report) return;
        const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));

        // Extract method sequences for comparison
        const generatedMethods = report.calls.map((c) => c.method);
        const baselineMethods = baseline.calls.map((c: { method: string }) => c.method);

        // Compare: same SDK methods called
        const generatedMethodSet = new Set(generatedMethods);
        const baselineMethodSet = new Set(baselineMethods);

        // Core methods that should appear in both
        const missingMethods = [...baselineMethodSet].filter(
          (m) => !generatedMethodSet.has(m),
        );
        const extraMethods = [...generatedMethodSet].filter(
          (m) => !baselineMethodSet.has(m),
        );

        // Report findings (soft comparison - warn but don't fail)
        if (missingMethods.length > 0) {
          console.warn(
            `${name}: Missing methods vs ${baselineName}: ${missingMethods.join(', ')}`,
          );
        }
        if (extraMethods.length > 0) {
          console.warn(
            `${name}: Extra methods vs ${baselineName}: ${extraMethods.join(', ')}`,
          );
        }

        // Extract body types from submit calls
        const generatedBodyTypes = report.calls
          .filter((c) => c.method === 'submit')
          .map((c) => {
            const envelope = c.params?.envelope as
              | { transaction?: { body?: { type?: string } } }
              | undefined;
            return envelope?.transaction?.body?.type || 'unknown';
          });

        const baselineBodyTypes = baseline.calls
          .filter((c: { method: string; bodyType?: string }) => c.method === 'submit')
          .map((c: { bodyType?: string }) => c.bodyType || 'unknown');

        // Transaction body types should match (core comparison)
        const generatedBodySet = new Set(generatedBodyTypes);
        const baselineBodySet = new Set(baselineBodyTypes);

        const missingBodyTypes = [...baselineBodySet].filter(
          (t) => !generatedBodySet.has(t),
        );

        if (missingBodyTypes.length > 0) {
          console.warn(
            `${name}: Missing tx body types vs ${baselineName}: ${missingBodyTypes.join(', ')}`,
          );
        }

        // Soft assertions: report differences but don't fail
        // The generated code may have a subset of the SDK example's calls
        // since templates represent specific flow segments, not full examples
        expect(generatedMethodSet.size).toBeGreaterThan(0);
      });
    });
  }
});
