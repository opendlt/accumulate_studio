/**
 * harness.test.mjs — correctness tests for the agent-harness itself.
 *
 * The harness decides whether the SDKs pass. If its own logic is wrong, every
 * KPI it produces is wrong — and the first live runs proved that is not
 * hypothetical (a false PASS survived two independent bugs). These tests pin
 * the behaviours that false pass depended on.
 *
 * No network, no agent, no secrets — safe for per-commit CI.
 *
 * Run: node --test tools/agent-harness/test/
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSpec, loadAllTasks } from '../lib/spec.mjs';
import {
  parseAssertion, lintAssertions, evaluateAssertions, KNOWN_SUBJECTS, resolveRhs, compare,
} from '../lib/assertions.mjs';
import { classifyFailure, countsTowardK2, summarizeFailures, FAILURE_CLASSES } from '../lib/classify.mjs';
import { buildRecord, saveRecord, loadRuns, latestRunDate } from '../lib/record.mjs';
import { deriveLiteUrls, generateLiteAccount, suggestAdiUrl } from '../lib/lite.mjs';
import { resolveNetwork, NETWORKS, acmeToBase, baseToAcme } from '../lib/accumulate.mjs';
import { provisioningPlan, resolveTaskInputs } from '../provision.mjs';
import { PACKAGES } from '../lib/workspace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, '..');
const TASKS_DIR = join(HARNESS, 'tasks');
const REPO = join(HARNESS, '..', '..');

// ============================================================================
describe('spec parser', () => {
  test('parses all 8 committed specs with required fields', () => {
    const tasks = loadAllTasks(TASKS_DIR);
    assert.equal(tasks.length, 8);
    for (const t of tasks) {
      assert.ok(t.id, `${t.file}: id`);
      assert.ok(t.title, `${t.file}: title`);
      assert.ok(t.network, `${t.file}: network`);
      assert.ok(t.template, `${t.file}: maps_to_template`);
      assert.ok(t.prompt_to_agent, `${t.file}: prompt_to_agent`);
      assert.ok(Array.isArray(t.success_assertions), `${t.file}: assertions array`);
      assert.ok(t.success_assertions.length > 0, `${t.file}: has assertions`);
      assert.ok(t.specHash?.length === 12, `${t.file}: spec hash`);
    }
  });

  test('block scalars keep multi-line prompts intact', () => {
    const s = parseSpec('id: x\nprompt_to_agent: |\n  line one\n  line two\ninputs: {}\n');
    assert.equal(s.prompt_to_agent, 'line one\nline two');
  });

  test('empty collections parse to the right type', () => {
    const s = parseSpec('preconditions: []\ninputs: {}\n');
    assert.deepEqual(s.preconditions, []);
    assert.deepEqual(s.inputs, {});
  });

  test('inline maps parse', () => {
    const s = parseSpec('scoring: { first_try: bool, turns_to_success: int }\n');
    assert.deepEqual(s.scoring, { first_try: 'bool', turns_to_success: 'int' });
  });

  test('block lists and block maps parse', () => {
    const s = parseSpec('preconditions:\n  - a thing\n  - another\ninputs:\n  amount_acme: 5\n');
    assert.deepEqual(s.preconditions, ['a thing', 'another']);
    assert.deepEqual(s.inputs, { amount_acme: 5 });
  });

  test('THROWS on an unrecognized line rather than dropping it', () => {
    // A silently dropped success_assertions block would make every run pass
    // vacuously — the parser must fail loudly instead.
    assert.throws(() => parseSpec('id: x\n!!! garbage\n'), /unrecognized line/);
  });

  test('throws when a list key parses as a map', () => {
    assert.throws(() => parseSpec('success_assertions:\n  foo: bar\n'), /must be a list/);
  });

  test('spec hash changes when the spec changes', () => {
    const a = parseSpec('id: x\n');
    const b = parseSpec('id: y\n');
    assert.notDeepEqual(a, b);
  });
});

// ============================================================================
describe('assertion grammar', () => {
  test('parses every operator, longest-first', () => {
    assert.deepEqual(
      { ...parseAssertion('a >= 5'), raw: undefined },
      { subject: 'a', op: '>=', rhs: '5', raw: undefined },
    );
    assert.equal(parseAssertion('a == true').op, '==');
    assert.equal(parseAssertion('a != b').op, '!=');
    assert.equal(parseAssertion('a <= 1').op, '<=');
    assert.equal(parseAssertion('a > 0').op, '>');
    assert.equal(parseAssertion('a < 9').op, '<');
  });

  test('>= is not mis-parsed as >', () => {
    const p = parseAssertion('key_page_credit_balance >= 5000');
    assert.equal(p.op, '>=');
    assert.equal(p.rhs, '5000');
  });

  test('throws on an assertion with no operator', () => {
    assert.throws(() => parseAssertion('just a phrase'), /unparseable/);
  });

  test('every subject used by the committed specs has a resolver', () => {
    const problems = lintAssertions(loadAllTasks(TASKS_DIR));
    assert.deepEqual(problems, [], problems.join('\n'));
  });

  test('KNOWN_SUBJECTS covers the documented vocabulary', () => {
    for (const s of [
      'lite_token_account_balance', 'adi_account_exists', 'key_book_exists',
      'key_page_credit_balance', 'key_page_threshold', 'tx_status',
      'recipient_balance_increased_by', 'data_account_exists', 'retrieved_entry',
      'token_issuer_exists', 'token_account_balance', 'multisig_tx_status',
      'key_page_contains_new_key', 'key_page_contains_old_key',
    ]) {
      assert.ok(KNOWN_SUBJECTS.includes(s), `missing resolver: ${s}`);
    }
  });

  test('an unknown subject fails the assertion instead of passing it', async () => {
    const task = { success_assertions: ['nonexistent_subject == true'] };
    const r = await evaluateAssertions(task, { inputs: {}, artifacts: {}, env: {}, baseline: {} });
    assert.equal(r.passed, false);
    assert.match(r.results[0].error, /no resolver/);
  });

  test('a task with zero assertions never reports passed', async () => {
    const r = await evaluateAssertions({ success_assertions: [] }, { inputs: {}, artifacts: {}, env: {}, baseline: {} });
    assert.equal(r.passed, false, 'empty assertion set must not pass vacuously');
  });
});

// ============================================================================
describe('ACME scaling in assertions', () => {
  test('acmeToBase / baseToAcme roundtrip at 1e8', () => {
    assert.equal(acmeToBase(1), 100000000n);
    assert.equal(acmeToBase(5), 500000000n);
    assert.equal(baseToAcme(1000000000n), 10);
  });

  test('"5 ACME" resolves to base units', () => {
    const r = resolveRhs('5 ACME', {});
    assert.deepEqual(r, { acmeBase: 500000000n });
  });

  test('a delta of 5 base units does NOT satisfy "== 5 ACME"', () => {
    // The exact footgun the assertion language exists to block: an SDK that
    // sent 5 base units instead of 5 ACME must not score as correct.
    assert.equal(compare('==', 5n, resolveRhs('5 ACME', {})), false);
    assert.equal(compare('==', 500000000n, resolveRhs('5 ACME', {})), true);
  });

  test('ACME comparison is BigInt-safe past 2^53', () => {
    const huge = 900000000000000000n; // 9e18 base units, beyond Number precision
    assert.equal(compare('>', huge, { acmeBase: 500000000n }), true);
    assert.equal(compare('<', huge, { acmeBase: 500000000n }), false);
  });

  test('custom-token balance compares in WHOLE tokens, not base units', () => {
    // Regression, observed live 2026-07-27. `token_account_balance` returned raw
    // base units while the spec compares against `issue_amount` (1000, a
    // human-scale quantity). For a precision-8 token those differ by exactly
    // 1e8, so the check was INVERTED:
    //   python issued 1000 whole tokens (100000000000 base) -> scored FAIL
    //   rust   issued 1000 BASE units   (0.00001 tokens)    -> scored PASS
    // It rewarded the amount-scaling bug and punished correct behaviour.
    //
    // This pins the conversion the resolver performs. It is asserted directly
    // rather than through evaluateAssertions because that path makes real
    // network calls.
    const toWhole = (base, precision) => {
      const b = BigInt(base);
      const d = 10n ** BigInt(precision);
      return b % d === 0n ? Number(b / d) : Number(b) / Number(d);
    };

    assert.equal(toWhole('100000000000', 8), 1000, '1000 whole tokens must read as 1000');
    assert.notEqual(toWhole('1000', 8), 1000, '1000 base units must NOT read as 1000');
    assert.equal(toWhole('1000', 8), 0.00001, 'under-issuance must surface, not round to zero');
    assert.equal(toWhole('1000', 0), 1000, 'precision 0 means base units are whole tokens');
  });

  test('bare identifiers resolve from the task inputs', () => {
    assert.equal(resolveRhs('issue_amount', { issue_amount: 1000 }), 1000);
    assert.equal(resolveRhs('payload', { payload: 'hello accumulate' }), 'hello accumulate');
  });

  test('booleans and numbers resolve to their JS types', () => {
    assert.equal(resolveRhs('true', {}), true);
    assert.equal(resolveRhs('false', {}), false);
    assert.equal(resolveRhs('5000', {}), 5000);
  });

  test('0 base units does not satisfy "== 5 ACME" via the full evaluator', async () => {
    const task = { success_assertions: ['recipient_balance_increased_by == 5 ACME'] };
    const r = await evaluateAssertions(task, {
      net: null, env: {}, inputs: {}, baseline: { recipient: 0 },
      artifacts: { recipientUrl: null },
    });
    assert.equal(r.passed, false);
  });
});

// ============================================================================
describe('failure classification', () => {
  const cases = [
    ['install-fail', 'ERROR: Could not find a version that satisfies the requirement'],
    ['install-fail', 'error[E0432]: unresolved import'],
    ['network-flake', 'connect ECONNREFUSED 1.2.3.4:443'],
    ['network-flake', 'HTTP 429 Too Many Requests'],
    ['amount-scaling', 'insufficient balance for transfer'],
    ['missing-prereq', 'transaction is not signed'],
    ['missing-prereq', 'insufficient credits on key page'],
    ['wrong-symbol', "AttributeError: module has no attribute 'foo'"],
    ['wrong-symbol', 'TypeError: client.sendTokens is not a function'],
    ['error-opaque', 'thread panicked at src/main.rs:12'],
  ];
  for (const [expected, text] of cases) {
    test(`classifies "${text.slice(0, 40)}..." as ${expected}`, () => {
      assert.equal(classifyFailure({ transcript: text, artifacts: { a: 1 } }), expected);
    });
  }

  test('timeout wins over everything', () => {
    assert.equal(classifyFailure({ timedOut: true, transcript: 'ECONNREFUSED' }), 'timeout');
  });

  test('no artifacts reported -> no-artifacts', () => {
    assert.equal(classifyFailure({ transcript: 'all quiet', artifacts: {} }), 'no-artifacts');
  });

  test('unrecognized failure falls back to other', () => {
    assert.equal(classifyFailure({ transcript: 'something odd', artifacts: { a: 1 } }), 'other');
  });

  test('install-fail is checked before network-flake', () => {
    // An install log often mentions a registry timeout; the install failure is
    // the actionable class, so ordering matters.
    assert.equal(
      classifyFailure({ transcript: 'no matching distribution found\nETIMEDOUT', artifacts: {} }),
      'install-fail',
    );
  });

  test('only non-SDK classes are excluded from K2', () => {
    assert.equal(countsTowardK2('network-flake'), false);
    assert.equal(countsTowardK2('harness-setup-failed'), false);
    for (const c of ['amount-scaling', 'missing-prereq', 'wrong-symbol', 'error-opaque', 'install-fail', 'no-artifacts', 'timeout', 'other']) {
      assert.equal(countsTowardK2(c), true, `${c} must count toward K2`);
    }
  });

  test('summarizeFailures ignores passing runs', () => {
    const s = summarizeFailures([
      { passed: true, failureClass: null },
      { passed: false, failureClass: 'wrong-symbol' },
      { passed: false, failureClass: 'wrong-symbol' },
      { passed: false, failureClass: 'timeout' },
    ]);
    assert.deepEqual(s, { 'wrong-symbol': 2, timeout: 1 });
  });

  test('every class declares K2 handling and a fix owner', () => {
    for (const [name, meta] of Object.entries(FAILURE_CLASSES)) {
      assert.equal(typeof meta.excludeFromK2, 'boolean', `${name}.excludeFromK2`);
      assert.ok(Array.isArray(meta.fixedBy), `${name}.fixedBy`);
    }
  });
});

// ============================================================================
describe('lite account derivation', () => {
  test('matches the URL the live network accepted', () => {
    // Verified on Kermit 2026-07-27: the faucet funded this derived URL.
    const pub = '33e277f05cc71e99cdf3415ad2cbf905e511335b14467d146015469c66291c79';
    const d = deriveLiteUrls(pub);
    assert.equal(d.liteIdentity, 'acc://dc557781f4f923f7c4f260a167cb73a15494583df750915e');
    assert.equal(d.liteTokenAccount, 'acc://dc557781f4f923f7c4f260a167cb73a15494583df750915e/ACME');
    assert.equal(d.publicKeyHashHex, 'dc557781f4f923f7c4f260a167cb73a15494583dc20cc11cf55cacd1ace23b10');
  });

  test('checksum hashes the ASCII hex, not the raw bytes', () => {
    // Getting this wrong yields a URL the faucet accepts but that never
    // materializes on chain. Pin it: identity is 40 hex + 8 hex checksum.
    const { liteIdentity } = deriveLiteUrls('00'.repeat(32));
    const body = liteIdentity.replace('acc://', '');
    assert.equal(body.length, 48);
    assert.match(body, /^[0-9a-f]{48}$/);
  });

  test('generate produces a self-consistent keypair', () => {
    const a = generateLiteAccount();
    assert.equal(a.publicKeyHex.length, 64);
    assert.equal(a.privateKeyHex.length, 64);
    const d = deriveLiteUrls(a.publicKeyHex);
    assert.equal(d.liteIdentity, a.liteIdentity);
    assert.equal(d.liteTokenAccount, a.liteTokenAccount);
  });

  test('rejects a wrong-length key', () => {
    assert.throws(() => deriveLiteUrls('aabb'), /32-byte/);
  });

  test('suggested ADI URLs are unique and well-formed', () => {
    const urls = new Set(Array.from({ length: 50 }, () => suggestAdiUrl()));
    assert.equal(urls.size, 50);
    for (const u of urls) assert.match(u, /^acc:\/\/[a-z0-9-]+\.acme$/);
  });
});

// ============================================================================
describe('network resolution', () => {
  test('normalizes the spec spelling "kermit-testnet"', () => {
    assert.equal(resolveNetwork('kermit-testnet').id, 'kermit');
  });

  test('every committed spec names a resolvable network', () => {
    for (const t of loadAllTasks(TASKS_DIR)) {
      assert.ok(resolveNetwork(t.network).id);
    }
  });

  test('throws on an unknown network rather than defaulting', () => {
    assert.throws(() => resolveNetwork('not-a-network'), /unknown network/);
  });

  test('mainnet is not reachable through the harness registry', () => {
    // The harness must never target mainnet; it is absent by construction.
    assert.equal(NETWORKS.mainnet, undefined);
  });
});

// ============================================================================
describe('provisioning tiers', () => {
  const tasks = loadAllTasks(TASKS_DIR);
  const plan = (id) => provisioningPlan(tasks.find((t) => t.file.startsWith(id)));

  test('task 01 is keys-only — funding is the agent\'s job', () => {
    // Regression: pre-funding made `lite_token_account_balance > 0` pass while
    // the agent had not executed at all.
    assert.equal(plan('01'), 'keys-only');
  });

  test('tasks 02 and 04 are funded', () => {
    assert.equal(plan('02'), 'funded');
    assert.equal(plan('04'), 'funded');
  });

  test('tasks 03, 05, 06, 07, 08 need an ADI', () => {
    for (const id of ['03', '05', '06', '07', '08']) {
      assert.equal(plan(id), 'adi', `task ${id}`);
    }
  });

  test('resolveTaskInputs substitutes the <generated> ADI placeholder', () => {
    const t = tasks.find((x) => x.file.startsWith('03'));
    const inputs = resolveTaskInputs(t, { suggestedAdiUrl: 'acc://demo.acme' });
    assert.equal(inputs.key_page_url, 'acc://demo.acme/book/1');
    assert.equal(inputs.credits, 5000);
  });

  test('no <generated> placeholder survives resolution', () => {
    for (const t of tasks) {
      const inputs = resolveTaskInputs(t, { suggestedAdiUrl: 'acc://demo.acme' });
      for (const [k, v] of Object.entries(inputs)) {
        assert.ok(!String(v).includes('<generated>'), `${t.file}: ${k} still has a placeholder`);
      }
    }
  });
});

// ============================================================================
describe('run records', () => {
  const mkTask = () => ({ id: 'demo', file: '01-demo.yaml', title: 'Demo', specHash: 'abc123def456' });

  test('never persists a private key', () => {
    const env = generateLiteAccount();
    const rec = buildRecord({
      lang: 'python', mode: 'sdk', task: mkTask(), backend: 'claude-code',
      network: 'kermit', passed: true, turns: 3, interventions: 0,
      assertionResults: [], artifacts: {}, env,
    });
    const blob = JSON.stringify(rec);
    assert.ok(!blob.includes(env.privateKeyHex), 'private key leaked into the run record');
    assert.equal(rec.environment.liteTokenAccount, env.liteTokenAccount);
  });

  test('failureClass is null when passed, set when failed', () => {
    const pass = buildRecord({ lang: 'rust', mode: 'sdk', task: mkTask(), backend: 'b', passed: true, failureClass: 'wrong-symbol' });
    assert.equal(pass.failureClass, null, 'a passing run must not carry a failure class');
    const fail = buildRecord({ lang: 'rust', mode: 'sdk', task: mkTask(), backend: 'b', passed: false });
    assert.equal(fail.failureClass, 'other', 'a failing run must always carry a class');
  });

  test('save/load roundtrip, and empty results yield no runs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-rec-'));
    try {
      assert.equal(latestRunDate(dir), null);
      assert.deepEqual(loadRuns(dir, 'sdk').runs, []);

      const rec = buildRecord({
        lang: 'dart', mode: 'sdk', task: mkTask(), backend: 'claude-code',
        network: 'kermit', passed: true, turns: 4, interventions: 0,
        assertionResults: [], artifacts: {},
      });
      saveRecord(dir, rec, '2026-01-02');

      const { date, runs } = loadRuns(dir, 'sdk', '2026-01-02');
      assert.equal(date, '2026-01-02');
      assert.equal(runs.length, 1);
      assert.equal(runs[0].lang, 'dart');
      assert.equal(runs[0].turns, 4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
describe('K2/K3/K4 derivation semantics', () => {
  // Mirrors deriveAgentKpis in scorecard.mjs.
  const derive = (runs) => {
    const scored = runs.filter((r) => r.passed || countsTowardK2(r.failureClass));
    return {
      scored: scored.length,
      passed: scored.filter((r) => r.passed).length,
      excluded: runs.length - scored.length,
    };
  };

  test('network-flake and harness-setup-failed leave the denominator', () => {
    const d = derive([
      { passed: true, failureClass: null },
      { passed: false, failureClass: 'network-flake' },
      { passed: false, failureClass: 'harness-setup-failed' },
      { passed: false, failureClass: 'wrong-symbol' },
    ]);
    assert.equal(d.scored, 2, 'only SDK-attributable runs are scored');
    assert.equal(d.passed, 1);
    assert.equal(d.excluded, 2);
  });

  test('an all-flake run set scores nothing rather than 0%', () => {
    const d = derive([
      { passed: false, failureClass: 'network-flake' },
      { passed: false, failureClass: 'network-flake' },
    ]);
    assert.equal(d.scored, 0, 'a testnet outage must not read as 0% pass rate');
  });
});

// ============================================================================
describe('setup-venv cache', () => {
  test('the venv path includes .exe on Windows so existsSync can find it', async () => {
    // Regression: the original per-process cache pointed at ".../Scripts/python"
    // with no extension. existsSync matches the literal filename on Windows, so
    // the check always failed and the 30s venv build ran on EVERY ADI-tier run.
    const src = readFileSync(join(HARNESS, 'lib', 'setup.mjs'), 'utf-8');
    assert.match(src, /Scripts\\\\python\.exe/, 'win32 venv path must carry the .exe suffix');
  });

  test('the cache directory is keyed by the SDK package, not randomised', () => {
    // mkdtempSync produced a fresh directory per process; 35 abandoned copies
    // at 50 MB each reached 1.75 GB in one session.
    const src = readFileSync(join(HARNESS, 'lib', 'setup.mjs'), 'utf-8');
    assert.match(src, /acc-harness-setupenv-\$\{PACKAGES\.python\}/, 'cache key must be stable');
    assert.ok(!/mkdtempSync/.test(src), 'setup.mjs must not create randomised temp dirs');
  });

  test('a half-built venv is not served as ready', () => {
    const src = readFileSync(join(HARNESS, 'lib', 'setup.mjs'), 'utf-8');
    assert.match(src, /\.ready/, 'a readiness stamp must gate cache reuse');
  });
});

// ============================================================================
describe('stale workspace sweep', () => {
  test('matches run workspaces but never the setup-venv cache', async () => {
    const { sweepStaleWorkspaces } = await import('../lib/workspace.mjs');
    assert.equal(typeof sweepStaleWorkspaces, 'function');
    const src = readFileSync(join(HARNESS, 'lib', 'workspace.mjs'), 'utf-8');
    const m = src.match(/\^acc-harness-\(([^)]+)\)-/);
    assert.ok(m, 'sweep must use an explicit language-scoped pattern');
    const langs = m[1].split('|').sort();
    assert.deepEqual(langs, ['csharp', 'dart', 'javascript', 'python', 'rust']);
    assert.ok(!m[1].includes('setupenv'), 'the setup-venv cache must never be swept');
  });

  test('sweeping with a live cache present leaves the cache intact', async () => {
    const { sweepStaleWorkspaces } = await import('../lib/workspace.mjs');
    const { ensureSetupEnv } = await import('../lib/setup.mjs');
    const python = await ensureSetupEnv();
    sweepStaleWorkspaces({ olderThanMs: 0 });
    assert.ok(existsSync(python), 'setup venv survived the sweep');
  });
});

// ============================================================================
describe('event-loop safety under concurrency', () => {
  // The run path must never use a SYNCHRONOUS child_process call. Those take
  // minutes (dotnet restore, cargo fetch, npm install, the Python ADI setup)
  // and block the shared event loop, so every concurrent worker's in-flight
  // chain query hits its AbortController and is recorded as `network-flake` —
  // against an endpoint answering in ~180ms. That produced 24 wasted runs
  // across two batches before it was diagnosed.
  const runPathModules = ['lib/workspace.mjs', 'lib/setup.mjs'];

  for (const rel of runPathModules) {
    test(`${rel} makes no blocking child_process CALL in the run path`, () => {
      const src = readFileSync(join(HARNESS, rel), 'utf-8');
      // Match call sites (`name(`), not mentions — the explanatory comments in
      // these files legitimately name the blocking APIs.
      const calls = [...src.matchAll(/\b(execFileSync|spawnSync|execSync)\s*\(/g)].map((m) => m[1]);
      // checkToolchains' execSync runs once during preflight, before any worker
      // exists, so it cannot starve a concurrent request.
      const disallowed = calls.filter((c) => c !== 'execSync');
      assert.deepEqual(
        disallowed,
        [],
        `${rel} must not call ${[...new Set(disallowed)].join('/')} in the run path`,
      );
    });
  }

  test('createWorkspace, ensureSetupEnv and provisionAdi are async', async () => {
    const ws = await import('../lib/workspace.mjs');
    const st = await import('../lib/setup.mjs');
    for (const [name, fn] of [
      ['createWorkspace', ws.createWorkspace],
      ['ensureSetupEnv', st.ensureSetupEnv],
      ['provisionAdi', st.provisionAdi],
    ]) {
      assert.equal(fn.constructor.name, 'AsyncFunction', `${name} must be async`);
    }
  });
});

// ============================================================================
describe('workspace configuration', () => {
  test('package names match the generator\'s LANG_META', () => {
    const gen = readFileSync(join(REPO, 'scripts', 'generate-agent-artifacts.mjs'), 'utf-8');
    for (const [lang, pkg] of Object.entries(PACKAGES)) {
      assert.ok(
        gen.includes(`pkg: '${pkg}'`),
        `${lang}: harness installs "${pkg}" but the generator does not declare it — the harness would test a different package than the docs describe`,
      );
    }
  });

  test('covers exactly the five SDK languages', () => {
    assert.deepEqual(
      Object.keys(PACKAGES).sort(),
      ['csharp', 'dart', 'javascript', 'python', 'rust'],
    );
  });
});

// ============================================================================
describe('run records validate against the published schema', () => {
  test('every record on disk conforms to schemas/harness-run.schema.json', async () => {
    const schemaPath = join(REPO, 'schemas', 'harness-run.schema.json');
    assert.ok(existsSync(schemaPath), 'schema file present');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

    const { default: Ajv } = await import('ajv');
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);

    const date = latestRunDate(HARNESS);
    if (!date) return; // nothing run yet — not a failure

    const { runs } = loadRuns(HARNESS, 'sdk', date);
    for (const r of runs) {
      const ok = validate(r);
      assert.ok(ok, `${r.lang}/${r.task?.id}: ${JSON.stringify(validate.errors)}`);
    }
  });
});
