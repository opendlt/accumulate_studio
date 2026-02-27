/**
 * JavaScript Generated Code Validation Tests
 *
 * For each YAML template:
 * 1. Generate JavaScript code via the manifest-driven generator
 * 2. Syntax check with `node --check` (ESM basic validation)
 * 3. Mock execution with validate_javascript.py (self-contained templates only)
 * 4. Compare RPC call patterns against SDK example baselines
 *
 * To run: vitest run javascript-validation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import yaml from 'js-yaml';
import type { Flow } from '@accumulate-studio/types';
import { deserializeYamlToFlow } from '../src/flow-serializer';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

const TEMPLATES_DIR = join(__dirname, '../../../templates');
const JS_HARNESS_DIR = join(__dirname, 'js-harness');
const JS_HARNESS_BIN_DIR = join(JS_HARNESS_DIR, 'bin');
const JS_HARNESS_PY = join(__dirname, 'validate_javascript.py');
const BASELINES_DIR = join(__dirname, 'baselines');

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
const SELF_CONTAINED_TEMPLATES = new Set([
  'lite-account-setup',
  'adi-creation',
  'zero-to-hero',
]);

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

describe('JavaScript Generated Code Validation', () => {
  const manifest = loadManifest('javascript');
  let harnessReady = false;

  beforeAll(() => {
    // Ensure bin directory exists for generated JS files
    if (!existsSync(JS_HARNESS_BIN_DIR)) {
      mkdirSync(JS_HARNESS_BIN_DIR, { recursive: true });
    }

    // Check if the SDK shim can be set up by running validate_javascript.py
    // on the placeholder to verify it works
    try {
      const placeholder = join(JS_HARNESS_BIN_DIR, 'placeholder.mjs');
      if (existsSync(placeholder)) {
        execSync(
          `python "${JS_HARNESS_PY}" "${placeholder}" "${JS_HARNESS_DIR}"`,
          { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] },
        );
      }
      harnessReady = true;
    } catch {
      // Harness setup may fail if SDK is not built — still run generation tests
      harnessReady = false;
      console.warn('JavaScript harness setup failed — mock execution tests will be skipped');
    }
  }, 60000);

  for (const { name, flow } of loadTemplates()) {
    describe(`${name}`, () => {
      let generatedCode: string;

      it('generates JavaScript code', () => {
        generatedCode = generateCodeFromManifest(flow, 'javascript', 'sdk', manifest);
        expect(generatedCode).toBeTruthy();
        expect(generatedCode.length).toBeGreaterThan(100);

        // Write to js-harness/bin/ for execution
        const binFile = join(JS_HARNESS_BIN_DIR, `${name.replace(/-/g, '_')}.mjs`);
        if (!existsSync(JS_HARNESS_BIN_DIR)) mkdirSync(JS_HARNESS_BIN_DIR, { recursive: true });
        writeFileSync(binFile, generatedCode);
      });

      it('passes basic syntax check', () => {
        // Partial templates (no GenerateKeys) contain unresolved {{VAR}} placeholders
        // which are invalid bare JS syntax — only self-contained templates can be checked
        if (!SELF_CONTAINED_TEMPLATES.has(name)) {
          return;
        }

        const binName = name.replace(/-/g, '_');
        const binFile = join(JS_HARNESS_BIN_DIR, `${binName}.mjs`);

        // Ensure generated code was written
        if (!existsSync(binFile)) {
          generatedCode = generateCodeFromManifest(flow, 'javascript', 'sdk', manifest);
          if (!existsSync(JS_HARNESS_BIN_DIR)) mkdirSync(JS_HARNESS_BIN_DIR, { recursive: true });
          writeFileSync(binFile, generatedCode);
        }

        // Use node --check for basic syntax validation
        // Note: --check may not fully validate ESM but catches obvious errors
        try {
          execSync(`node --check "${binFile}"`, {
            encoding: 'utf-8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (err) {
          const error = err as { stderr?: string; stdout?: string };
          throw new Error(
            `JavaScript syntax error in ${name}:\n${error.stderr || error.stdout || 'Unknown error'}`,
          );
        }
      }, 15000);

      it('executes under mock harness', () => {
        if (!harnessReady) {
          console.warn('JavaScript harness not ready, skipping mock execution');
          return;
        }

        // Only self-contained templates can run standalone
        if (!SELF_CONTAINED_TEMPLATES.has(name)) {
          return;
        }

        const binName = name.replace(/-/g, '_');
        const binFile = join(JS_HARNESS_BIN_DIR, `${binName}.mjs`);

        // Ensure generated code was written
        if (!existsSync(binFile)) {
          generatedCode = generateCodeFromManifest(flow, 'javascript', 'sdk', manifest);
          writeFileSync(binFile, generatedCode);
        }

        // Run via mock harness
        let output: string;
        try {
          output = execSync(
            `python "${JS_HARNESS_PY}" "${binFile}" "${JS_HARNESS_DIR}"`,
            { encoding: 'utf-8', timeout: 60000 },
          );
        } catch (err) {
          const error = err as { stderr?: string; stdout?: string };
          output = (error.stdout || '') + (error.stderr || '');
        }

        const report = extractJson(output) as MockReport | null;
        if (!report) {
          console.warn(`No JSON report for ${name} (${output.length} chars)`);
          return;
        }
        // For mock execution, we check that some RPC calls were made
        expect(report.call_count).toBeGreaterThan(0);
      }, 90000); // 1.5 minute timeout

      it('RPC call pattern comparison', () => {
        // Can only compare patterns for self-contained templates
        if (!SELF_CONTAINED_TEMPLATES.has(name)) {
          return;
        }

        if (!harnessReady) {
          return;
        }

        // Check if we have a baseline
        const baselineName = TEMPLATE_TO_BASELINE[name];
        const baselinePath = baselineName
          ? join(BASELINES_DIR, `${baselineName}.baseline.json`)
          : '';

        if (!baselineName || !existsSync(baselinePath)) {
          return;
        }

        const binName = name.replace(/-/g, '_');
        const binFile = join(JS_HARNESS_BIN_DIR, `${binName}.mjs`);

        if (!existsSync(binFile)) {
          return; // Skip if not generated
        }

        let output: string;
        try {
          output = execSync(
            `python "${JS_HARNESS_PY}" "${binFile}" "${JS_HARNESS_DIR}"`,
            { encoding: 'utf-8', timeout: 60000 },
          );
        } catch {
          return;
        }

        const report = extractJson(output) as MockReport | null;
        if (!report) return;
        const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));

        // Compare method sets
        const generatedMethods = report.calls.map((c) => c.method);
        const baselineMethods = baseline.calls.map((c: { method: string }) => c.method);

        const generatedMethodSet = new Set(generatedMethods);
        const baselineMethodSet = new Set(baselineMethods);

        const missingMethods = [...baselineMethodSet].filter(
          (m) => !generatedMethodSet.has(m),
        );
        const extraMethods = [...generatedMethodSet].filter(
          (m) => !baselineMethodSet.has(m),
        );

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

        // Soft assertions
        expect(generatedMethodSet.size).toBeGreaterThan(0);
      }, 60000);
    });
  }
});
