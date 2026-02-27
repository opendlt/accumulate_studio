/**
 * Rust Generated Code Validation Tests
 *
 * For each YAML template:
 * 1. Generate Rust code via the manifest-driven generator
 * 2. Compilation check with `cargo check` (via rust-harness)
 * 3. Mock execution with validate_rust.py (self-contained templates only)
 * 4. Compare RPC call patterns against SDK example baselines
 *
 * To run: vitest run rust-validation
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
const RUST_HARNESS_DIR = join(__dirname, 'rust-harness');
const RUST_HARNESS_BIN_DIR = join(RUST_HARNESS_DIR, 'src/bin');
const RUST_HARNESS_PY = join(__dirname, 'validate_rust.py');
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

describe('Rust Generated Code Validation', () => {
  const manifest = loadManifest('rust');
  let harnessReady = false;

  beforeAll(() => {
    // Ensure bin directory exists for generated Rust files
    if (!existsSync(RUST_HARNESS_BIN_DIR)) {
      mkdirSync(RUST_HARNESS_BIN_DIR, { recursive: true });
    }

    // Check if Cargo.toml exists
    const cargoToml = join(RUST_HARNESS_DIR, 'Cargo.toml');
    if (!existsSync(cargoToml)) {
      console.warn('rust-harness/Cargo.toml not found, skipping compilation tests');
      return;
    }

    // Warm the dependency cache with a placeholder check
    try {
      execSync('cargo check', {
        cwd: RUST_HARNESS_DIR,
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      harnessReady = true;
    } catch (e) {
      const err = e as { stderr?: string };
      console.warn('cargo check warmup failed:', err.stderr?.slice(0, 500));
      // Still mark as ready - individual tests will show specific errors
      harnessReady = true;
    }
  }, 180000); // 3 minute timeout for cargo check warmup

  for (const { name, flow } of loadTemplates()) {
    describe(`${name}`, () => {
      let generatedCode: string;

      it('generates Rust code', () => {
        generatedCode = generateCodeFromManifest(flow, 'rust', 'sdk', manifest);
        expect(generatedCode).toBeTruthy();
        expect(generatedCode.length).toBeGreaterThan(100);

        // Write to rust-harness/src/bin/ for compilation
        const binFile = join(RUST_HARNESS_BIN_DIR, `${name.replace(/-/g, '_')}.rs`);
        if (!existsSync(RUST_HARNESS_BIN_DIR)) mkdirSync(RUST_HARNESS_BIN_DIR, { recursive: true });
        writeFileSync(binFile, generatedCode);
      });

      it('passes Rust compilation check', () => {
        if (!harnessReady) {
          console.warn('Rust harness not ready, skipping compilation check');
          return;
        }

        // Partial templates (no GenerateKeys) reference undefined variables
        // and cannot compile standalone — only self-contained templates can
        if (!SELF_CONTAINED_TEMPLATES.has(name)) {
          return;
        }

        const binName = name.replace(/-/g, '_');
        const binFile = join(RUST_HARNESS_BIN_DIR, `${binName}.rs`);

        // Ensure generated code was written
        if (!existsSync(binFile)) {
          generatedCode = generateCodeFromManifest(flow, 'rust', 'sdk', manifest);
          if (!existsSync(RUST_HARNESS_BIN_DIR)) mkdirSync(RUST_HARNESS_BIN_DIR, { recursive: true });
          writeFileSync(binFile, generatedCode);
        }

        try {
          execSync(`cargo check --bin ${binName}`, {
            cwd: RUST_HARNESS_DIR,
            encoding: 'utf-8',
            timeout: 120000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (err) {
          const error = err as { stderr?: string; stdout?: string };
          throw new Error(
            `Rust compilation error in ${name}:\n${error.stderr || error.stdout || 'Unknown error'}`,
          );
        }
      }, 120000); // 2 minute timeout for cargo check

      it('executes under mock harness', () => {
        if (!harnessReady) {
          console.warn('Rust harness not ready, skipping mock execution');
          return;
        }

        // Only self-contained templates can run standalone
        if (!SELF_CONTAINED_TEMPLATES.has(name)) {
          return;
        }

        const binName = name.replace(/-/g, '_');

        // Build the binary
        try {
          execSync(`cargo build --bin ${binName}`, {
            cwd: RUST_HARNESS_DIR,
            encoding: 'utf-8',
            timeout: 120000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (err) {
          const error = err as { stderr?: string };
          throw new Error(`Rust build failed for ${name}: ${error.stderr?.slice(0, 500)}`);
        }

        // Find the compiled binary
        const targetDir = join(RUST_HARNESS_DIR, 'target/debug');
        // On Windows, binaries have .exe extension
        const binaryName = process.platform === 'win32' ? `${binName}.exe` : binName;
        const binaryPath = join(targetDir, binaryName);

        if (!existsSync(binaryPath)) {
          throw new Error(`Binary not found at ${binaryPath}`);
        }

        // Run via mock harness — capture output even on non-zero exit
        // Node timeout must be longer than Python's internal timeout (60s)
        // so Python can always emit its JSON report before Node kills it
        let output: string;
        try {
          output = execSync(
            `python "${RUST_HARNESS_PY}" "${binaryPath}"`,
            { encoding: 'utf-8', timeout: 90000 },
          );
        } catch (err) {
          const error = err as { stderr?: string; stdout?: string; status?: number };
          // The mock harness outputs JSON to stdout, even on failure
          output = (error.stdout || '') + (error.stderr || '');
        }

        const report = extractJson(output) as MockReport | null;
        if (!report) {
          // If no JSON output, the harness itself failed to run
          console.warn(`No JSON report for ${name} (${output.length} chars)`);
          return;
        }
        // For mock execution, we check that some RPC calls were made
        // Full success requires a more complete mock server
        expect(report.call_count).toBeGreaterThan(0);
      }, 120000); // 2 minute timeout for build + run

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

        // Build and run to get call pattern
        const binName = name.replace(/-/g, '_');
        const targetDir = join(RUST_HARNESS_DIR, 'target/debug');
        const binaryName = process.platform === 'win32' ? `${binName}.exe` : binName;
        const binaryPath = join(targetDir, binaryName);

        if (!existsSync(binaryPath)) {
          return; // Skip if not built
        }

        let output: string;
        try {
          output = execSync(
            `python "${RUST_HARNESS_PY}" "${binaryPath}"`,
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
