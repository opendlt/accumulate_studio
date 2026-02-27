/**
 * Action Palette End-to-End Tests
 *
 * For each action palette block type, generates complete workflow code and
 * compiles + executes it to verify copy/paste/run readiness.
 *
 * Default: runs against the real Kermit testnet (TEST_MODE=kermit)
 * Fast:    TEST_MODE=mock for local mock server testing
 *
 * Usage:
 *   npx vitest run action-palette-e2e                          # All, Kermit
 *   npx vitest run action-palette-e2e -t "Python"              # Python only
 *   TEST_MODE=mock npx vitest run action-palette-e2e           # All, mock
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import {
  writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync,
  copyFileSync, symlinkSync, lstatSync,
} from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import http from 'http';

const execAsync = promisify(exec);
import type {
  Flow, FlowNode, FlowConnection, BlockType, SDKLanguage,
} from '@accumulate-studio/types';
import { PREREQUISITE_GRAPH } from '@accumulate-studio/types';
import { generateCodeFromManifest } from '../src/manifest-generator';
import { loadManifest } from '../src/manifest-loader';

// ── Configuration ────────────────────────────────────────────────────────

const TEST_MODE = (process.env.TEST_MODE || 'kermit').toLowerCase() as 'kermit' | 'mock';
const KERMIT_TIMEOUT = 300_000;   // 5 min per test on live network
const MOCK_TIMEOUT = 60_000;      // 1 min per test on mock
const COMPILE_TIMEOUT = 300_000;  // 5 min for cargo build (all bins)
const EXEC_TIMEOUT = TEST_MODE === 'kermit' ? KERMIT_TIMEOUT : MOCK_TIMEOUT;

const TESTS_DIR = __dirname;
const RUST_HARNESS = join(TESTS_DIR, 'rust-harness');
const DART_HARNESS = join(TESTS_DIR, 'dart-harness');
const CSHARP_HARNESS = join(TESTS_DIR, 'csharp-harness');
const JS_HARNESS = join(TESTS_DIR, 'js-harness');
const PYTHON_HARNESS = join(TESTS_DIR, 'validate_python.py');
// TESTS_DIR = .../accumulate-studio/packages/codegen/tests
// SDK repos are siblings of on-boarding-platform under Accumulate_Stuff
const SDK_ROOT = resolve(TESTS_DIR, '..', '..', '..', '..', '..');

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
];

// ── Mock Server (for TEST_MODE=mock) ─────────────────────────────────────

interface MockServer { url: string; close: () => void }

function createMockServer(): Promise<MockServer> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const result = Array.isArray(data)
            ? data.map((item: any) => mockRoute(item.method, item.params, item.id))
            : mockRoute(data.method, data.params, data.id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch {
          res.writeHead(400);
          res.end('Bad Request');
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

let callIdx = 0;
function mockRoute(method: string, params: any, id: any) {
  callIdx++;
  const idx = callIdx;
  const txId = 'a'.repeat(58) + String(idx).padStart(6, '0');

  switch (method) {
    // ── V2 Faucet ───────────────────────────────────────────────────
    case 'faucet':
      return {
        jsonrpc: '2.0', id,
        result: { type: 'faucet', txid: `mock-faucet-tx-${idx}`, transactionHash: `mock-faucet-tx-${idx}` },
      };

    // ── Query (V2 uses params.url, V3 uses params.scope) ───────────
    case 'query': {
      const scope = String(params?.scope || params?.url || '');
      // Transaction query: scope is hex hash or contains @
      if (scope.includes('@') || /^[0-9a-f]{64}$/i.test(scope)) {
        return {
          jsonrpc: '2.0', id,
          result: {
            type: 'transactionRecord',
            // V2 fields
            status: { code: 'delivered', delivered: true },
            data: { status: { code: 'delivered' } },
            // V3 fields
            account: { balance: '100000000000', creditBalance: 10000 },
          },
        };
      }
      // Account query — include both V2 and V3 shapes
      return {
        jsonrpc: '2.0', id,
        result: {
          type: 'liteTokenAccount',
          // V3 shape
          account: { version: 1, balance: '100000000000', creditBalance: 10000, type: 'liteTokenAccount', url: scope },
          version: 1, balance: '100000000000', creditBalance: 10000,
          // V2 shape
          data: { version: 1, balance: '100000000000', creditBalance: 10000, url: scope },
        },
      };
    }

    // ── V2 Query-Tx (transaction by ID) ─────────────────────────────
    case 'query-tx':
      return {
        jsonrpc: '2.0', id,
        result: { type: 'transactionRecord', status: { code: 'delivered', delivered: true }, txid: params?.txid || txId },
      };

    // ── Network status / oracle (V3 and V2) ────────────────────────
    case 'network-status':
      return { jsonrpc: '2.0', id, result: { oracle: { price: 50000000 } } };

    // ── V2 Describe (used by JS SDK for oracle) ─────────────────────
    case 'describe':
      return {
        jsonrpc: '2.0', id,
        result: { values: { oracle: { price: 50000000 } } },
      };

    // ── V3 Submit ───────────────────────────────────────────────────
    case 'submit':
      return { jsonrpc: '2.0', id, result: [{ status: { txID: txId, code: 200 } }] };

    // ── V2 Execute-Direct (transaction submission) ──────────────────
    case 'execute-direct':
      return {
        jsonrpc: '2.0', id,
        result: { type: 'envelope', txid: txId, result: {} },
      };

    // ── Default: empty success ──────────────────────────────────────
    default:
      return { jsonrpc: '2.0', id, result: {} };
  }
}

// ── Flow Builder ─────────────────────────────────────────────────────────

function buildE2EFlow(targetType: BlockType): Flow {
  const uid = randomBytes(4).toString('hex');
  const adiBase = `acc://e2e-${uid}.acme`;
  const rule = PREREQUISITE_GRAPH[targetType];
  const recipe = [...rule.defaultRecipe, targetType];

  const typeCounts: Record<string, number> = {};
  const nodes: FlowNode[] = [];
  const connections: FlowConnection[] = [];

  for (let i = 0; i < recipe.length; i++) {
    const bt = recipe[i];
    typeCounts[bt] = (typeCounts[bt] || 0) + 1;
    const suffix = typeCounts[bt] > 1 ? `_${typeCounts[bt]}` : '';
    const id = `${bt.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')}${suffix}`;

    nodes.push({
      id,
      type: bt,
      label: `${bt}${suffix}`,
      config: getConfig(bt, typeCounts, adiBase),
      position: { x: 100, y: 100 + i * 160 },
    });

    if (i > 0) {
      connections.push({
        id: `conn_${i}`,
        sourceNodeId: nodes[i - 1].id, sourcePortId: 'output',
        targetNodeId: nodes[i].id, targetPortId: 'input',
      });
    }
  }

  return {
    version: '1.0',
    name: `${targetType} E2E`,
    description: `E2E test for ${targetType}`,
    network: 'kermit',
    variables: [],
    nodes,
    connections,
  };
}

function getConfig(
  bt: BlockType,
  typeCounts: Record<string, number>,
  adi: string,
): Record<string, unknown> {
  const book = `${adi}/book`;
  const page = `${adi}/book/1`;
  const tokens = `${adi}/tokens`;
  const data = `${adi}/data`;
  const token = `${adi}/my-token`;

  switch (bt) {
    case 'GenerateKeys': return {};
    case 'Faucet': return {};
    case 'WaitForBalance': return { minBalance: '10000000' };
    case 'WaitForCredits': return { minCredits: 100 };
    case 'QueryAccount': return { url: 'acc://certen-protocol.acme' };
    case 'CreateLiteTokenAccount': return {};
    case 'AddCredits': {
      const n = typeCounts['AddCredits'] || 1;
      return { amount: n <= 1 ? '2000000' : '5000000' };
    }
    case 'TransferCredits': return { amount: 100, principal: page, recipient: page };
    case 'BurnCredits': return { amount: 10, principal: page };
    case 'CreateIdentity': return { url: adi, keyBookUrl: book };
    case 'CreateKeyBook': return { url: `${adi}/book2`, principal: adi };
    case 'CreateKeyPage': return { principal: book, keys: ['deadbeef'.repeat(8)] };
    case 'CreateTokenAccount': return { url: tokens, tokenUrl: 'acc://ACME', principal: adi };
    case 'CreateDataAccount': return { url: data, principal: adi };
    case 'CreateToken': return { url: token, symbol: 'TKN', precision: 8, principal: adi };
    case 'SendTokens': return { recipients: [{ url: tokens, amount: '100' }], principal: tokens };
    case 'IssueTokens': return { amount: '1000000', recipient: tokens, principal: token };
    case 'BurnTokens': return { amount: '500', principal: tokens };
    case 'WriteData': return { entries: ['Hello World'], principal: data };
    case 'WriteDataTo': return { entries: ['Hello World'], recipient: data, principal: data };
    case 'UpdateKeyPage': return { operations: [{ type: 'add', key: 'deadbeef'.repeat(4) }], principal: page };
    case 'UpdateKey': return { newKey: 'cafebabe'.repeat(4), principal: page };
    case 'LockAccount': return { height: 1, principal: adi };
    case 'UpdateAccountAuth': return { operations: [{ type: 'enable', authority: book }], principal: adi };
    default: return {};
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Check if a command exists on PATH */
function hasCommand(cmd: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

/** Extract the last top-level JSON object from mixed stdout */
function extractJson(output: string): Record<string, unknown> | null {
  const last = output.lastIndexOf('}');
  if (last < 0) return null;
  let depth = 0;
  for (let i = last; i >= 0; i--) {
    if (output[i] === '}') depth++;
    if (output[i] === '{') depth--;
    if (depth === 0) {
      try { return JSON.parse(output.slice(i, last + 1)); } catch { return null; }
    }
  }
  return null;
}

/** Get env vars for pointing generated code at mock server */
function mockEnv(mockUrl: string): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    ACCUMULATE_V2_URL: mockUrl,
    ACCUMULATE_V3_URL: mockUrl,
    ACCUMULATE_BASE_URL: mockUrl,
    ACCUMULATE_ENDPOINT: mockUrl,
  };
}

/** Ensure the JS harness has SDK shim in node_modules */
function ensureJsHarness(): void {
  const shimDir = join(JS_HARNESS, 'node_modules', 'accumulate.js');
  const shimIndex = join(shimDir, 'index.js');
  if (existsSync(shimIndex)) return; // Already set up

  mkdirSync(shimDir, { recursive: true });

  const sdkDir = join(SDK_ROOT, 'opendlt-javascript-v2v3-sdk', 'javascript');
  let sdkIndex = join(sdkDir, 'lib', 'src', 'index.js');
  if (!existsSync(sdkIndex)) sdkIndex = join(sdkDir, 'lib', 'index.js');
  if (!existsSync(sdkIndex)) throw new Error(`JS SDK not built. Run: cd ${sdkDir} && npm run build`);

  const sdkUrl = 'file:///' + sdkIndex.replace(/\\/g, '/');
  writeFileSync(join(shimDir, 'package.json'), JSON.stringify({
    name: 'accumulate.js', version: '0.0.0', type: 'module', main: 'index.js',
  }));
  writeFileSync(shimIndex, `export * from "${sdkUrl}";\n`);

  // Symlink transitive deps from SDK node_modules
  const sdkNm = join(sdkDir, 'node_modules');
  const harnessNm = join(JS_HARNESS, 'node_modules');
  if (existsSync(sdkNm)) {
    for (const dep of readdirSync(sdkNm)) {
      if (dep === 'accumulate.js' || dep.startsWith('.')) continue;
      const src = join(sdkNm, dep);
      const dst = join(harnessNm, dep);
      if (!existsSync(dst)) {
        try {
          if (process.platform === 'win32') {
            execSync(`cmd /c mklink /J "${dst}" "${src}"`, { stdio: 'ignore' });
          } else {
            symlinkSync(src, dst);
          }
        } catch { /* best effort */ }
      }
    }
  }
}

// ── Test Suites ──────────────────────────────────────────────────────────

describe('Action Palette E2E', () => {
  let mock: MockServer | null = null;

  beforeAll(async () => {
    if (TEST_MODE === 'mock') {
      mock = await createMockServer();
      console.log(`Mock server at ${mock.url}`);
    } else {
      console.log('Running against Kermit testnet');
    }
  });

  afterAll(() => { mock?.close(); });

  // ── Python ───────────────────────────────────────────────────────────

  describe('Python', () => {
    const manifest = loadManifest('python');
    const outDir = join(tmpdir(), 'acme-e2e-python');
    const hasPython = hasCommand('python');

    beforeAll(() => { mkdirSync(outDir, { recursive: true }); });

    for (const blockType of ALL_BLOCK_TYPES) {
      it(`${blockType}`, () => {
        if (!hasPython) return; // skip if python not on PATH

        // Generate
        const flow = buildE2EFlow(blockType);
        const code = generateCodeFromManifest(flow, 'python', 'sdk', manifest);
        const file = join(outDir, `${blockType}.py`);
        writeFileSync(file, code);

        // Syntax check
        execSync(`python -m py_compile "${file}"`, { timeout: 15_000 });

        // Execute
        let output: string;
        if (TEST_MODE === 'mock') {
          output = execSync(`python "${PYTHON_HARNESS}" "${file}"`, {
            encoding: 'utf-8', timeout: MOCK_TIMEOUT,
          });
          const report = extractJson(output);
          expect(report, 'Mock harness returned no JSON').not.toBeNull();
          expect(report!.success, `Mock execution failed: ${report!.error}`).toBe(true);
        } else {
          output = execSync(`python "${file}"`, {
            encoding: 'utf-8', timeout: KERMIT_TIMEOUT,
          });
          expect(output).toContain('Flow completed successfully!');
        }
      }, EXEC_TIMEOUT + 30_000);
    }
  });

  // ── JavaScript ───────────────────────────────────────────────────────

  describe('JavaScript', () => {
    const manifest = loadManifest('javascript');
    const binDir = join(JS_HARNESS, 'bin');
    const hasNode = hasCommand('node');

    beforeAll(() => {
      mkdirSync(binDir, { recursive: true });
      if (hasNode) ensureJsHarness();
    });

    for (const blockType of ALL_BLOCK_TYPES) {
      it(`${blockType}`, async () => {
        if (!hasNode) return;

        const flow = buildE2EFlow(blockType);
        const code = generateCodeFromManifest(flow, 'javascript', 'sdk', manifest);
        const file = join(binDir, `${blockType}.mjs`);
        writeFileSync(file, code);

        const env = TEST_MODE === 'mock' && mock ? mockEnv(mock.url) : process.env;
        const { stdout, stderr } = await execAsync(`node "${file}"`, {
          encoding: 'utf-8',
          timeout: EXEC_TIMEOUT,
          cwd: JS_HARNESS,
          env: env as NodeJS.ProcessEnv,
        });

        expect(stdout + stderr, stderr || 'No output').toContain('Flow completed successfully!');
      }, EXEC_TIMEOUT + 30_000);
    }
  });

  // ── Rust ──────────────────────────────────────────────────────────────

  describe('Rust', () => {
    const manifest = loadManifest('rust');
    const binSrcDir = join(RUST_HARNESS, 'src', 'bin');
    const hasCargo = hasCommand('cargo');

    beforeAll(() => {
      if (!hasCargo) return;
      mkdirSync(binSrcDir, { recursive: true });

      // Write all .rs files first
      for (const blockType of ALL_BLOCK_TYPES) {
        const flow = buildE2EFlow(blockType);
        const code = generateCodeFromManifest(flow, 'rust', 'sdk', manifest);
        const binName = blockType.toLowerCase().replace(/[^a-z0-9]/g, '_');
        writeFileSync(join(binSrcDir, `e2e_${binName}.rs`), code);
      }

      // Compile only the E2E binaries (skip stale old test bins)
      const binFlags = ALL_BLOCK_TYPES.map(bt => {
        const binName = `e2e_${bt.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        return `--bin ${binName}`;
      }).join(' ');
      console.log('Compiling Rust E2E binaries (this may take a while)...');
      execSync(`cargo build ${binFlags}`, {
        cwd: RUST_HARNESS,
        encoding: 'utf-8',
        timeout: COMPILE_TIMEOUT,
        stdio: 'inherit',
      });
    }, COMPILE_TIMEOUT + 60_000);

    for (const blockType of ALL_BLOCK_TYPES) {
      it(`${blockType}`, async () => {
        if (!hasCargo) return;

        const binName = `e2e_${blockType.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const ext = process.platform === 'win32' ? '.exe' : '';
        const binary = join(RUST_HARNESS, 'target', 'debug', `${binName}${ext}`);
        expect(existsSync(binary), `Binary not found: ${binary}`).toBe(true);

        const env = TEST_MODE === 'mock' && mock ? mockEnv(mock.url) : process.env;
        const { stdout, stderr } = await execAsync(`"${binary}"`, {
          encoding: 'utf-8',
          timeout: EXEC_TIMEOUT,
          env: env as NodeJS.ProcessEnv,
        });

        expect(stdout + stderr, stderr || 'No output').toContain('Flow completed successfully!');
      }, EXEC_TIMEOUT + 30_000);
    }
  });

  // ── Dart ──────────────────────────────────────────────────────────────

  describe('Dart', () => {
    const manifest = loadManifest('dart');
    const binDir = join(DART_HARNESS, 'bin');
    const hasDart = hasCommand('dart');

    beforeAll(() => {
      if (!hasDart) return;
      mkdirSync(binDir, { recursive: true });

      // Write all .dart files
      for (const blockType of ALL_BLOCK_TYPES) {
        const flow = buildE2EFlow(blockType);
        const code = generateCodeFromManifest(flow, 'dart', 'sdk', manifest);
        writeFileSync(join(binDir, `e2e_${blockType.toLowerCase()}.dart`), code);
      }

      // Ensure dependencies are resolved
      if (!existsSync(join(DART_HARNESS, '.dart_tool'))) {
        console.log('Running dart pub get...');
        execSync('dart pub get', {
          cwd: DART_HARNESS, encoding: 'utf-8', timeout: 60_000,
        });
      }
    }, 120_000);

    for (const blockType of ALL_BLOCK_TYPES) {
      it(`${blockType}`, async () => {
        if (!hasDart) return;

        const fileName = `e2e_${blockType.toLowerCase()}.dart`;
        const env = TEST_MODE === 'mock' && mock ? mockEnv(mock.url) : process.env;

        const { stdout, stderr } = await execAsync(`dart run bin/${fileName}`, {
          encoding: 'utf-8',
          timeout: EXEC_TIMEOUT,
          cwd: DART_HARNESS,
          env: env as NodeJS.ProcessEnv,
        });

        expect(stdout + stderr, stderr || 'No output').toContain('Flow completed successfully!');
      }, EXEC_TIMEOUT + 30_000);
    }
  });

  // ── C# ────────────────────────────────────────────────────────────────

  describe('C#', () => {
    const manifest = loadManifest('csharp');
    const genDir = join(CSHARP_HARNESS, 'bin-gen');
    const hasDotnet = hasCommand('dotnet');
    const csprojPath = join(CSHARP_HARNESS, 'CSharpHarness.csproj');
    let origCsproj = '';

    beforeAll(() => {
      if (!hasDotnet) return;
      mkdirSync(genDir, { recursive: true });
      origCsproj = readFileSync(csprojPath, 'utf-8');

      // Ensure restore is done once
      execSync('dotnet restore', {
        cwd: CSHARP_HARNESS, encoding: 'utf-8', timeout: 60_000,
      });
    }, 120_000);

    for (const blockType of ALL_BLOCK_TYPES) {
      it(`${blockType}`, async () => {
        if (!hasDotnet) return;

        const flow = buildE2EFlow(blockType);
        const code = generateCodeFromManifest(flow, 'csharp', 'sdk', manifest);
        const csFile = join(genDir, `E2E_${blockType}.cs`);
        writeFileSync(csFile, code);

        // Modify csproj to include this file
        const modified = origCsproj.replace(
          '</Project>',
          `  <ItemGroup>\n    <Compile Include="${csFile.replace(/\\/g, '/')}" />\n  </ItemGroup>\n</Project>`,
        );
        writeFileSync(csprojPath, modified);

        try {
          // Build (sync is fine — no mock server interaction during compilation)
          execSync('dotnet build --no-restore', {
            cwd: CSHARP_HARNESS, encoding: 'utf-8', timeout: COMPILE_TIMEOUT,
          });

          // Execute (async to keep event loop unblocked for mock server)
          const env = TEST_MODE === 'mock' && mock ? mockEnv(mock.url) : process.env;
          const { stdout, stderr } = await execAsync('dotnet run --no-build', {
            cwd: CSHARP_HARNESS,
            encoding: 'utf-8',
            timeout: EXEC_TIMEOUT,
            env: env as NodeJS.ProcessEnv,
          });

          expect(stdout + stderr, stderr || 'No output').toContain('Flow completed successfully!');
        } finally {
          // Restore original csproj
          writeFileSync(csprojPath, origCsproj);
        }
      }, EXEC_TIMEOUT + COMPILE_TIMEOUT + 30_000);
    }
  });
});
