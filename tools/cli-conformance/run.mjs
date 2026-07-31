#!/usr/bin/env node
/**
 * cli-conformance — RB-04.
 *
 * Drives ANY SDK CLI as a black box and holds it to docs/ai-agent-readiness/CLI-SPEC.md.
 * Language-agnostic on purpose: one suite is the gate for all five implementations,
 * which is the only thing that actually prevents five dialects.
 *
 * Usage:
 *   node tools/cli-conformance/run.mjs --cmd "python -m accumulate_client.cli"
 *   node tools/cli-conformance/run.mjs --cmd "..." --cwd <dir> --sdk python [--json] [--offline]
 *
 * Exit: 0 if every case passes, 1 otherwise.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const SCHEMA = JSON.parse(readFileSync(join(REPO, 'schemas', 'cli-envelope.schema.json'), 'utf-8'));

function arg(name, dflt = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const CMD = arg('cmd');
const CWD = arg('cwd', process.cwd());
const SDK = arg('sdk');
const EMIT_JSON = process.argv.includes('--json');
// Skip network cases (CI without a testnet). Structural cases still run.
const OFFLINE = process.argv.includes('--offline');

if (!CMD) {
  console.error('usage: run.mjs --cmd "<command to invoke the CLI>" [--cwd DIR] [--sdk LANG] [--offline]');
  process.exit(2);
}

const EXIT = { OK: 0, FAILED: 1, USAGE: 2, NETWORK: 3 };

/**
 * Minimal draft-07 validator covering exactly what the envelope schema uses
 * (type, required, const, enum, pattern, minLength, minimum, additionalProperties,
 * items, allOf/if/then, not). A dependency-free checker keeps this runnable in any
 * repo without an install step.
 */
function validate(schema, value, path = '$', errors = []) {
  const t = schema.type;
  const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (t) {
    const types = Array.isArray(t) ? t : [t];
    const actual = typeOf(value);
    const ok = types.some((x) => (x === 'integer' ? Number.isInteger(value) : x === 'number' ? typeof value === 'number' : actual === x));
    if (!ok) { errors.push(`${path}: expected ${types.join('|')}, got ${actual}`); return errors; }
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in ${JSON.stringify(schema.enum)}`);
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: "${value}" does not match ${schema.pattern}`);
  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) errors.push(`${path}: shorter than minLength ${schema.minLength}`);
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`);
  if (schema.items && Array.isArray(value)) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, errors));

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const r of schema.required || []) {
      if (!(r in value)) errors.push(`${path}: missing required "${r}"`);
    }
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k];
      if (sub) validate(sub, v, `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected property "${k}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(schema.additionalProperties, v, `${path}.${k}`, errors);
    }
  }
  if (schema.not) {
    const sub = [];
    validate(schema.not, value, path, sub);
    if (sub.length === 0) errors.push(`${path}: matched a forbidden ("not") schema`);
  }
  for (const s of schema.allOf || []) {
    if (s.if) {
      const probe = [];
      validate(s.if, value, path, probe);
      if (probe.length === 0 && s.then) validate(s.then, value, path, errors);
    } else {
      validate(s, value, path, errors);
    }
  }
  return errors;
}

/**
 * Spawn the CLI under test.
 *
 * `--cmd` may be a bare executable ("target/debug/accumulate.exe") or a launcher
 * plus arguments ("python -m accumulate_client.cli", "dart run bin/accumulate.dart").
 * Splitting it and passing argv[0] to a shell breaks on Windows as soon as the
 * path contains forward slashes, so spawn WITHOUT a shell and let the OS resolve
 * the executable directly. On Windows a relative path also needs normalizing to
 * backslashes.
 */
function spawnCli(extraArgs) {
  const parts = CMD.split(/\s+/).filter(Boolean);
  let exe = parts[0];
  if (process.platform === 'win32' && (exe.includes('/') || exe.includes('\\'))) {
    exe = join(CWD, exe.replace(/\//g, '\\'));
  }
  return { exe, args: [...parts.slice(1), ...extraArgs] };
}

function run(args, input) {
  const { exe, args: argv } = spawnCli(args);
  const opts = {
    cwd: CWD, encoding: 'utf-8', timeout: 180000,
    env: { ...process.env, ACCUMULATE_ALLOW_MAINNET: '' },
  };
  if (input !== undefined) opts.input = input;
  let r = spawnSync(exe, argv, opts);
  // A launcher on PATH (python, dart, node) may still need the shell on Windows.
  if (r.error && r.error.code === 'ENOENT' && process.platform === 'win32') {
    r = spawnSync(exe, argv, { ...opts, shell: true });
  }
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', err: r.error };
}

const results = [];
function check(name, fn) {
  try {
    const problems = fn() || [];
    results.push({ name, pass: problems.length === 0, problems });
  } catch (e) {
    results.push({ name, pass: false, problems: [`threw: ${e.message}`] });
  }
}

/** Parse stdout as exactly one envelope and schema-validate it. */
function envelopeOf(out, ctx) {
  const problems = [];
  const trimmed = out.trim();
  if (!trimmed) { problems.push(`${ctx}: stdout was empty; expected one envelope object`); return { problems }; }
  // "Exactly one object, nothing else" — extra lines mean a banner or log leaked.
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length !== 1) problems.push(`${ctx}: stdout had ${lines.length} lines; --json must emit exactly one object`);
  let env;
  try { env = JSON.parse(trimmed); }
  catch (e) { problems.push(`${ctx}: stdout is not valid JSON (${e.message}): ${trimmed.slice(0, 120)}`); return { problems }; }
  validate(SCHEMA, env, '$', problems).forEach(() => {});
  return { env, problems };
}

// ---------------------------------------------------------------------------
// Structural cases — no network required
// ---------------------------------------------------------------------------
check('version: envelope valid, exit 0', () => {
  const r = run(['--json', 'version']);
  const { env, problems } = envelopeOf(r.stdout, 'version');
  if (r.code !== EXIT.OK) problems.push(`expected exit 0, got ${r.code}`);
  if (env && env.ok !== true) problems.push('expected ok:true');
  if (env && SDK && env.meta?.sdk !== SDK) problems.push(`meta.sdk should be "${SDK}", got "${env.meta?.sdk}"`);
  return problems;
});

check('--help --json: returns the full command tree', () => {
  const r = run(['--json', '--help']);
  const { env, problems } = envelopeOf(r.stdout, 'help');
  if (r.code !== EXIT.OK) problems.push(`expected exit 0, got ${r.code}`);
  const verbs = env?.data?.verbs;
  if (!Array.isArray(verbs)) { problems.push('data.verbs must be an array'); return problems; }
  const names = verbs.map((v) => v.name);
  for (const required of ['query', 'balance', 'chain', 'faucet', 'credits estimate', 'tx build',
    'tx submit', 'tx wait', 'tx status', 'keys generate', 'net list', 'net status', 'version']) {
    if (!names.includes(required)) problems.push(`command tree is missing verb "${required}"`);
  }
  for (const v of verbs) {
    if (typeof v.network !== 'boolean') problems.push(`verb "${v.name}" must declare boolean "network"`);
    if (typeof v.signs !== 'boolean') problems.push(`verb "${v.name}" must declare boolean "signs"`);
    if (!v.summary) problems.push(`verb "${v.name}" must have a summary`);
  }
  return problems;
});

check('net list: works offline, exit 0', () => {
  const r = run(['--json', 'net', 'list']);
  const { env, problems } = envelopeOf(r.stdout, 'net list');
  if (r.code !== EXIT.OK) problems.push(`expected exit 0, got ${r.code}`);
  if (env && !Array.isArray(env.data?.networks)) problems.push('data.networks must be an array');
  return problems;
});

check('keys generate: returns a keypair without touching the network', () => {
  const r = run(['--json', 'keys', 'generate']);
  const { env, problems } = envelopeOf(r.stdout, 'keys generate');
  if (r.code !== EXIT.OK) problems.push(`expected exit 0, got ${r.code}`);
  const d = env?.data || {};
  if (!d.publicKey) problems.push('data.publicKey missing');
  if (!d.liteIdentity || !String(d.liteIdentity).startsWith('acc://')) problems.push('data.liteIdentity must be an acc:// URL');
  return problems;
});

check('tx build: emits an unsigned body, no network', () => {
  const r = run(['--json', 'tx', 'build', 'send_tokens_single',
    '--param', 'to_url=acc://x.acme/ACME', '--param', 'amount=100000000']);
  const { env, problems } = envelopeOf(r.stdout, 'tx build');
  if (r.code !== EXIT.OK) problems.push(`expected exit 0, got ${r.code}`);
  if (env?.data?.signed !== false) problems.push('data.signed must be false for an unsigned build');
  return problems;
});

check('tx build rejects an unknown op instead of echoing it', () => {
  // The stub used to echo any op back with exit 0, so a typo looked like success
  // and only failed later at submit — or worse, never.
  const r = run(['--json', 'tx', 'build', 'not_a_real_operation']);
  const { env, problems } = envelopeOf(r.stdout, 'tx build unknown op');
  if (r.code !== EXIT.USAGE) problems.push(`expected exit 2, got ${r.code}`);
  if (env && env.error?.code !== 'ACC_USAGE') problems.push(`expected ACC_USAGE, got ${env?.error?.code}`);
  return problems;
});

check('unknown verb: exit 2 with ACC_USAGE', () => {
  const r = run(['--json', 'definitely-not-a-verb']);
  const { env, problems } = envelopeOf(r.stdout, 'unknown verb');
  if (r.code !== EXIT.USAGE) problems.push(`expected exit 2, got ${r.code}`);
  if (env && env.ok !== false) problems.push('expected ok:false');
  if (env && env.error?.code !== 'ACC_USAGE') problems.push(`expected ACC_USAGE, got ${env?.error?.code}`);
  if (env && env.error?.retryable !== false) problems.push('a usage error must not be retryable');
  return problems;
});

check('missing required argument: exit 2', () => {
  const r = run(['--json', 'query']);
  const { env, problems } = envelopeOf(r.stdout, 'missing arg');
  if (r.code !== EXIT.USAGE) problems.push(`expected exit 2, got ${r.code}`);
  if (env && env.error?.code !== 'ACC_USAGE') problems.push(`expected ACC_USAGE, got ${env?.error?.code}`);
  return problems;
});

check('mainnet without the env var: refused with exit 2', () => {
  const r = run(['--json', '--network', 'mainnet', 'query', 'acc://acme']);
  const { env, problems } = envelopeOf(r.stdout, 'mainnet gate');
  if (r.code !== EXIT.USAGE) problems.push(`expected exit 2 (refusal), got ${r.code}`);
  if (env && env.ok !== false) problems.push('mainnet without ACCUMULATE_ALLOW_MAINNET must be refused');
  return problems;
});

check('tx sign supports co-signing an existing envelope (M-of-N)', () => {
  // A threshold needs a SECOND signature on the SAME transaction. Signing the
  // body twice produces two different transactions (the initiator is baked into
  // the header), so neither reaches the threshold — which is why multisig tasks
  // failed before this existed.
  const r = run(['--json', '--help']);
  const { env, problems } = envelopeOf(r.stdout, 'help');
  const sign = (env?.data?.verbs ?? []).find((v) => v.name === 'tx sign');
  if (!sign) { problems.push('tx sign missing'); return problems; }
  const flags = (sign.flags ?? []).map((f) => f.name);
  if (!flags.includes('--envelope')) {
    problems.push('tx sign must accept --envelope to co-sign an existing transaction');
  }
  if (!flags.includes('--body')) problems.push('tx sign must still accept --body');
  return problems;
});

check('tx sign rejects both --body and --envelope together', () => {
  const r = run(['--json', 'tx', 'sign', '--body', 'b.json', '--envelope', 'e.json',
    '--signer', 'acc://x.acme/book/1', '--key-env', 'NOPE']);
  const { env, problems } = envelopeOf(r.stdout, 'tx sign both modes');
  if (r.code !== EXIT.USAGE) problems.push(`expected exit 2, got ${r.code}`);
  if (env && env.error?.code !== 'ACC_USAGE') problems.push(`expected ACC_USAGE, got ${env?.error?.code}`);
  return problems;
});

check('tx sign without a key source: refused with exit 2', () => {
  // tx sign is the ONLY signing verb and must never fall back to an ambient key.
  const r = run(['--json', 'tx', 'sign', '--body', 'b.json', '--principal', 'acc://x.acme', '--signer', 'acc://x.acme']);
  const { env, problems } = envelopeOf(r.stdout, 'tx sign key gate');
  if (r.code !== EXIT.USAGE) problems.push(`expected exit 2, got ${r.code}`);
  if (env && env.ok !== false) problems.push('signing without an explicit key source must be refused');
  return problems;
});

check('tx submit declares signs:false and takes no key flags', () => {
  // It never signed; it used to ACCEPT --key-file/--key-env and ignore them,
  // which advertised a capability that did not exist.
  const r = run(['--json', '--help']);
  const { env, problems } = envelopeOf(r.stdout, 'help');
  const verbs = env?.data?.verbs ?? [];
  const submit = verbs.find((v) => v.name === 'tx submit');
  const sign = verbs.find((v) => v.name === 'tx sign');
  if (!submit) { problems.push('tx submit missing from the command tree'); return problems; }
  if (!sign) { problems.push('tx sign missing from the command tree'); return problems; }
  if (submit.signs !== false) problems.push('tx submit must declare signs:false — it does not sign');
  if (sign.signs !== true) problems.push('tx sign must declare signs:true');
  const submitFlags = (submit.flags ?? []).map((f) => f.name);
  for (const bad of ['--key-file', '--key-env']) {
    if (submitFlags.includes(bad)) problems.push(`tx submit must not take ${bad}: it never uses it`);
  }
  const signFlags = (sign.flags ?? []).map((f) => f.name);
  for (const req of ['--body', '--principal', '--signer']) {
    if (!signFlags.includes(req)) problems.push(`tx sign must take ${req}`);
  }
  return problems;
});

check('tx build emits a real transaction body', () => {
  // Emitting {op, params} alone is a stub: nothing downstream can sign it.
  const r = run(['--json', 'tx', 'build', 'send_tokens_single',
    '--param', 'to_url=acc://x.acme/ACME', '--param', 'amount=100000000']);
  const { env, problems } = envelopeOf(r.stdout, 'tx build body');
  if (r.code !== EXIT.OK) problems.push(`expected exit 0, got ${r.code}`);
  const body = env?.data?.body;
  if (!body || typeof body !== 'object') problems.push('data.body must be a real transaction body');
  else if (!body.type) problems.push('data.body must carry a transaction `type`');
  return problems;
});

check('never prompts: closed stdin still terminates', () => {
  const r = run(['--json', 'net', 'list'], '');
  return r.code === null ? ['timed out — the CLI may be waiting on input'] : [];
});

// ---------------------------------------------------------------------------
// Network cases
// ---------------------------------------------------------------------------
if (!OFFLINE) {
  check('query nonexistent account: exit 1, ACC_ACCOUNT_NOT_FOUND, not retryable', () => {
    const r = run(['--json', 'query', 'acc://does-not-exist-9f3a2b7c1d.acme']);
    const { env, problems } = envelopeOf(r.stdout, 'query missing');
    if (r.code !== EXIT.FAILED) problems.push(`expected exit 1, got ${r.code}`);
    if (env && env.ok !== false) problems.push('expected ok:false');
    if (env && env.error?.code !== 'ACC_ACCOUNT_NOT_FOUND') problems.push(`expected ACC_ACCOUNT_NOT_FOUND, got ${env?.error?.code}`);
    if (env && env.error?.retryable !== false) problems.push('not-found must not be retryable');
    if (env && !env.error?.remediation) problems.push('error.remediation must be non-empty');
    return problems;
  });

  check('unreachable network: exit 3, retryable', () => {
    const r = run(['--json', '--network', 'local', 'net', 'status']);
    const { env, problems } = envelopeOf(r.stdout, 'unreachable');
    if (r.code !== EXIT.NETWORK) problems.push(`expected exit 3, got ${r.code}`);
    if (env && env.error?.retryable !== true) problems.push('a transport failure must be retryable');
    return problems;
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
if (EMIT_JSON) {
  console.log(JSON.stringify({ cmd: CMD, sdk: SDK, offline: OFFLINE, passed, total: results.length, results }, null, 2));
} else {
  console.log(`\nCLI conformance — ${CMD}${SDK ? ` (${SDK})` : ''}${OFFLINE ? ' [offline]' : ''}\n`);
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
    for (const p of r.problems) console.log(`          ${p}`);
  }
  console.log(`\n${passed}/${results.length} cases passed\n`);
}
process.exit(passed === results.length ? 0 : 1);
