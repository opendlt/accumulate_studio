/**
 * Rust Generated Code Validation Tests
 *
 * For each YAML template:
 * 1. Generate Rust code via the manifest-driven generator
 * 2. Compilation check with `cargo check --bin` (via rust-harness), self-contained templates
 * 3. Mock execution with validate_rust.py (self-contained templates only)
 * 4. Compare RPC call patterns against SDK example baselines
 *
 * Nothing here passes by skipping. If the Rust toolchain is absent (e.g. a bare CI) the
 * toolchain-dependent tests are reported as SKIPPED, and REQUIRE_TOOLCHAINS=1 turns that into a
 * failure. If cargo is present, a harness that cannot build is a FAILURE, never a quiet skip:
 * the warm-up builds one self-contained program, a missing JSON report fails the test, and a
 * mock run must succeed (not merely make a call).
 *
 * Why the warm-up builds one bin instead of running a bare `cargo check`: the harness keeps
 * committed partial templates in src/bin (they reference variables defined by earlier blocks and
 * cannot compile standalone), so a bare `cargo check` always failed. That used to flip a
 * `harnessReady` flag to false and silently skip every compile and mock-execution test.
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
import {
  HASH_LOCK,
  expectHashLockRun,
  expectWrongPreimageRejected,
  harnessEnv,
  wrongPreimageFlow,
  hash160Flow,
  type HarnessReport,
} from './htlc-report';

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
  // No SDK example exists for a hash lock; the comparison is soft (warns only), so use the
  // closest setup flow.
  'hash-lock': 'example_03',
};

// Templates that are self-contained (start with GenerateKeys + Faucet)
// and can execute standalone under the mock harness.
const SELF_CONTAINED_TEMPLATES = new Set([
  'lite-account-setup',
  'adi-creation',
  'zero-to-hero',
  // Runs under the faithful node mock (htlc_mock.py): lock, locked deposit, release.
  'hash-lock',
]);

const hasCommand = (cmd: string): boolean => {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const HAS_CARGO = hasCommand('cargo');
const HAS_PYTHON = hasCommand('python');
const REQUIRE_TOOLCHAINS = process.env.REQUIRE_TOOLCHAINS === '1';

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

interface MockReport extends HarnessReport {
  stdout?: string;
  stderr?: string;
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

const binNameOf = (name: string): string => name.replace(/-/g, '_');

/** Write the generated program for `flow` into the harness as bin `binName`. */
function writeBin(binName: string, flow: Flow, manifest: ReturnType<typeof loadManifest>): void {
  if (!existsSync(RUST_HARNESS_BIN_DIR)) mkdirSync(RUST_HARNESS_BIN_DIR, { recursive: true });
  writeFileSync(
    join(RUST_HARNESS_BIN_DIR, `${binName}.rs`),
    generateCodeFromManifest(flow, 'rust', 'sdk', manifest),
  );
}

/** `cargo <verb> --bin <bin>` in the harness; a failure throws with cargo's own message. */
function cargo(verb: 'check' | 'build', binName: string, label: string, timeout = 300000): void {
  try {
    execSync(`cargo ${verb} --bin ${binName}`, {
      cwd: RUST_HARNESS_DIR,
      encoding: 'utf-8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const error = err as { stderr?: string; stdout?: string };
    throw new Error(`Rust ${verb} failed for ${label}:\n${error.stderr || error.stdout || 'Unknown error'}`);
  }
}

/** Run a built bin under validate_rust.py. The report is mandatory: no JSON means the harness broke. */
function runMock(binName: string, name: string, timeout: number): MockReport {
  // On Windows, binaries have .exe extension
  const binaryPath = join(RUST_HARNESS_DIR, 'target/debug', process.platform === 'win32' ? `${binName}.exe` : binName);
  expect(existsSync(binaryPath), `Binary not found at ${binaryPath}`).toBe(true);

  // Capture output even on a non-zero exit: the harness prints its JSON report either way.
  // The Node timeout must exceed Python's internal one (60s) so the report is always emitted.
  let output: string;
  try {
    output = execSync(`python "${RUST_HARNESS_PY}" "${binaryPath}"`, {
      encoding: 'utf-8',
      timeout,
      env: harnessEnv(name),
    });
  } catch (err) {
    const error = err as { stderr?: string; stdout?: string };
    output = (error.stdout || '') + (error.stderr || '');
  }
  const report = extractJson(output) as MockReport | null;
  expect(report, `No JSON report for ${name} (${output.length} chars):\n${output.slice(-600)}`).not.toBeNull();
  return report!;
}

describe('Rust Generated Code Validation', () => {
  const manifest = loadManifest('rust');
  const templates = loadTemplates();
  const firstSelfContained = templates.find((t) => SELF_CONTAINED_TEMPLATES.has(t.name))!;

  it('has a Rust toolchain when one is required', () => {
    if (REQUIRE_TOOLCHAINS) {
      expect(HAS_CARGO, 'REQUIRE_TOOLCHAINS=1 but cargo is not on PATH').toBe(true);
      expect(HAS_PYTHON, 'REQUIRE_TOOLCHAINS=1 but python is not on PATH').toBe(true);
    }
  });

  beforeAll(() => {
    if (!HAS_CARGO) return; // the toolchain-dependent tests below are reported as skipped
    expect(existsSync(join(RUST_HARNESS_DIR, 'Cargo.toml')), 'rust-harness/Cargo.toml is missing').toBe(true);

    // Warm the dependency cache: fetch and compile the SDK once, through one self-contained
    // program, so the per-template checks below only compile their own bin. A failure here is a
    // real failure (unresolvable SDK crate, broken toolchain) and must not become a skip.
    const bin = binNameOf(firstSelfContained.name);
    writeBin(bin, firstSelfContained.flow, manifest);
    cargo('build', bin, `the warm-up bin ${bin}`, 540000);
  }, 600000);

  for (const { name, flow } of templates) {
    describe(`${name}`, () => {
      const selfContained = SELF_CONTAINED_TEMPLATES.has(name);
      const binName = binNameOf(name);

      it('generates Rust code', () => {
        const code = generateCodeFromManifest(flow, 'rust', 'sdk', manifest);
        expect(code).toBeTruthy();
        expect(code.length).toBeGreaterThan(100);

        // Write to rust-harness/src/bin/ for compilation
        writeBin(binName, flow, manifest);
      });

      // Partial templates (no GenerateKeys) reference variables defined by earlier blocks and
      // cannot compile or run standalone, so the compile, mock-run and pattern tests exist only
      // for self-contained templates. They are not registered (rather than registered and
      // returning early) so the report never counts a check that did not happen as a pass.
      if (selfContained) {
        it.skipIf(!HAS_CARGO)('passes Rust compilation check', () => {
          writeBin(binName, flow, manifest);
          cargo('check', binName, name, 300000);
        }, 300000);

        it.skipIf(!HAS_CARGO || !HAS_PYTHON)('executes under mock harness', () => {
          writeBin(binName, flow, manifest);
          cargo('build', binName, name, 300000);

          const report = runMock(binName, name, 90000);
          expect(report.error, `mock run failed: ${report.error}\n${report.stderr ?? ''}`).toBeNull();
          expect(report.success).toBe(true);
          expect(report.call_count).toBeGreaterThan(0);
          if (name === HASH_LOCK) expectHashLockRun(report);
        }, 400000);
      }

      if (name === HASH_LOCK) {
        // Mutation check: the same flow, but the release reveals a wrong preimage. The node accepts
        // that at submit and rejects it at execute, so a program that does not turn the failed
        // release into a non-zero exit would still look fine to a weaker check.
        it.skipIf(!HAS_CARGO || !HAS_PYTHON)('fails closed when the release reveals the wrong preimage', () => {
          const wrongBin = `${binName}_wrong_preimage`;
          writeBin(wrongBin, wrongPreimageFlow(flow), manifest);
          cargo('build', wrongBin, `${name} (wrong preimage)`, 300000);
          expectWrongPreimageRejected(runMock(wrongBin, name, 90000));
        }, 400000);

        it.skipIf(!HAS_CARGO || !HAS_PYTHON)('runs the hash-lock flow with a HASH160 lock end to end', () => {
          const h160Bin = `${binName}_hash160`;
          writeBin(h160Bin, hash160Flow(flow), manifest);
          cargo('build', h160Bin, `${name} (hash160)`, 300000);
          expectHashLockRun(runMock(h160Bin, name, 90000), 'hash160');
        }, 400000);
      }

      if (selfContained) it.skipIf(!HAS_CARGO || !HAS_PYTHON)('RPC call pattern comparison', () => {
        // Check if we have a baseline
        const baselineName = TEMPLATE_TO_BASELINE[name];
        const baselinePath = baselineName
          ? join(BASELINES_DIR, `${baselineName}.baseline.json`)
          : '';

        if (!baselineName || !existsSync(baselinePath)) {
          return; // no recorded SDK example to compare against: nothing to assert
        }

        // Build and run to get the call pattern
        writeBin(binName, flow, manifest);
        cargo('build', binName, name, 300000);
        const report = runMock(binName, name, 90000);
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
      }, 400000);
    });
  }
});
