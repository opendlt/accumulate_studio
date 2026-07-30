#!/usr/bin/env node
/**
 * Run the RB-04 conformance suite against ALL FIVE SDK CLIs.
 *
 * One gate for five implementations — the only thing that reliably stops five
 * dialects. Exits non-zero if any implementation fails any case.
 *
 * Usage: node tools/cli-conformance/all.mjs [--offline]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = 'C:/Accumulate_Stuff';
const OFFLINE = process.argv.includes('--offline');

const TARGETS = [
  { sdk: 'python', cmd: 'python -m accumulate_client.cli',
    cwd: `${SDK_ROOT}/opendlt-python-v2v3-sdk/unified`,
    // The host has a stale site-packages copy that shadows the source tree, so
    // point the interpreter at src/ explicitly.
    env: { PYTHONPATH: `${SDK_ROOT}/opendlt-python-v2v3-sdk/unified/src` } },
  { sdk: 'javascript', cmd: 'node lib/src/cli.js',
    cwd: `${SDK_ROOT}/opendlt-javascript-v2v3-sdk/javascript` },
  { sdk: 'dart', cmd: 'dart run bin/accumulate.dart',
    cwd: `${SDK_ROOT}/opendlt-dart-v2v3-sdk/unified` },
  { sdk: 'rust', cmd: 'target/debug/accumulate.exe',
    cwd: `${SDK_ROOT}/opendlt-rust-v2v3-sdk/unified` },
  { sdk: 'csharp', cmd: 'src/Acme.Net.Sdk.Cli/bin/Release/net9.0/accumulate.exe',
    cwd: `${SDK_ROOT}/opendlt-c-sharp-v2v3-sdk` },
];

let failed = 0;
const summary = [];
for (const t of TARGETS) {
  const args = [join(HERE, 'run.mjs'), '--cmd', t.cmd, '--cwd', t.cwd, '--sdk', t.sdk];
  if (OFFLINE) args.push('--offline');
  const r = spawnSync(process.execPath, args, {
    encoding: 'utf-8', timeout: 900000, env: { ...process.env, ...(t.env ?? {}) },
  });
  const line = (r.stdout ?? '').match(/(\d+)\/(\d+) cases passed/);
  const ok = r.status === 0;
  if (!ok) failed++;
  summary.push({ sdk: t.sdk, ok, score: line ? line[0] : 'did not run' });
  if (!ok) process.stderr.write(r.stdout ?? '');
}

console.log('\nRB-04 CLI conformance — all five SDKs\n');
for (const s of summary) console.log(`  ${s.ok ? 'PASS' : 'FAIL'}  ${s.sdk.padEnd(11)} ${s.score}`);
console.log(`\n${summary.length - failed}/${summary.length} implementations conform\n`);
process.exit(failed === 0 ? 0 : 1);
