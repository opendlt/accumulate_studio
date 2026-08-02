#!/usr/bin/env node
/**
 * agent-harness runner — Phase 0 (P0-XR-01, -02, -04, -05) / RB-01
 *
 * Drives an AI coding agent through the 8 canonical Accumulate tasks from the
 * *installed* SDK and scores K2 (first-try pass), K3 (turns-to-first-tx), and
 * K4 (human interventions).
 *
 * Core invariants:
 *   1. The agent only ever sees a scratch workspace with the SDK installed from
 *      the registry — never this monorepo or an SDK source tree.
 *   2. Pass/fail is decided by querying chain state, never by the agent's claim.
 *   3. Network problems are classified `network-flake` and excluded from K2, so
 *      K2 measures SDK quality rather than testnet uptime.
 *   4. With no results on disk the scorecard stays PENDING_RUNNER — "not
 *      measured" must remain distinguishable from "measured and failing".
 *
 * Usage:
 *   node tools/agent-harness/runner.mjs --list
 *   node tools/agent-harness/runner.mjs --self-test
 *   node tools/agent-harness/runner.mjs --preflight --lang all
 *   node tools/agent-harness/runner.mjs --lang python --task 04 --backend claude-code
 *   node tools/agent-harness/runner.mjs --lang all --tasks all --backend claude-code --mode sdk
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { loadAllTasks } from './lib/spec.mjs';
import { lintAssertions, evaluateAssertions, captureBaseline } from './lib/assertions.mjs';
import { classifyFailure, countsTowardK2 } from './lib/classify.mjs';
import { buildRecord, saveRecord, saveTranscript } from './lib/record.mjs';
import {
  createWorkspaceWithRetry, safeRemove, checkToolchains, sweepStaleWorkspaces, InstallFailure,
} from './lib/workspace.mjs';
import { provisionLiteAccount, resolveTaskInputs, provisioningPlan } from './provision.mjs';
import {
  provisionAdi, verifyAdiSetup, ensureSetupEnv, clearSetupEnvCache, SetupFailure,
} from './lib/setup.mjs';
import {
  resolveNetwork, NetworkUnreachable, createSemaphore, withRetry, queryAccount,
} from './lib/accumulate.mjs';
import * as claudeCode from './backends/claude-code.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(HERE, 'tasks');
const LANGS = ['rust', 'python', 'dart', 'csharp', 'javascript'];
const MODES = ['sdk', 'mcp', 'codegen', 'cli'];

// --- agent backend registry -------------------------------------------------
const backends = {
  'claude-code': claudeCode,
  claude: claudeCode, // alias
};

function getBackend(name) {
  const b = backends[name];
  if (!b) {
    throw new Error(
      `agent backend "${name}" is not registered. Available: ${Object.keys(backends).join(', ')}. ` +
        `See tools/agent-harness/README.md.`,
    );
  }
  return b;
}

/**
 * Gate on the shared faucet/RPC. Set by main() from --provision-concurrency
 * (default 1); agent execution is unaffected and runs at full --concurrency.
 */
let provisionGate = (fn) => fn();

// --- CLI --------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);

function allTasks() {
  return loadAllTasks(TASKS_DIR);
}

function selfTest() {
  const errors = [];
  let tasks = [];
  try {
    tasks = allTasks();
  } catch (e) {
    console.error(`Harness self-test FAILED: ${e.message}`);
    process.exit(1);
  }

  const required = ['id', 'title', 'network', 'template'];
  if (tasks.length !== 8) errors.push(`expected 8 canonical task specs, found ${tasks.length}`);
  for (const t of tasks) {
    for (const f of required) {
      if (!t[f]) errors.push(`${t.file}: missing "${f === 'template' ? 'maps_to_template' : f}"`);
    }
    if (!t.prompt_to_agent) errors.push(`${t.file}: missing "prompt_to_agent"`);
    if (!(t.success_assertions || []).length) {
      errors.push(`${t.file}: no success_assertions — a run would pass vacuously`);
    }
    try {
      resolveNetwork(t.network);
    } catch (e) {
      errors.push(`${t.file}: ${e.message}`);
    }
  }

  // Every assertion subject must have a resolver, or scoring silently degrades.
  errors.push(...lintAssertions(tasks));

  if (errors.length) {
    console.error('Harness self-test FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const assertions = tasks.reduce((n, t) => n + t.success_assertions.length, 0);
  console.log(
    `Harness self-test PASS: ${tasks.length} task specs well-formed; ` +
      `${assertions} assertions all resolvable; ${LANGS.length} langs; modes ${MODES.join('/')}.`,
  );
}

function preflight(langs, backendName) {
  const problems = [];
  problems.push(...checkToolchains(langs).map((m) => `toolchain missing: ${m}`));
  if (backendName) {
    try {
      const b = getBackend(backendName);
      problems.push(...(b.checkAvailable?.() ?? []));
    } catch (e) {
      problems.push(e.message);
    }
  }
  if (problems.length) {
    console.error('Preflight FAILED:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`Preflight PASS: toolchains present for ${langs.join(', ')}${backendName ? `; backend "${backendName}" available` : ''}.`);
}

/** Execute one (lang x task) run end to end. Never throws — always returns a record. */
async function executeRun({ lang, task, mode, backendName, backend, model, timeoutMs, keepWorkspace, dateStamp }) {
  const startedAt = new Date().toISOString();
  const net = resolveNetwork(task.network);
  let workspace = null;
  let env = null;

  const fail = (failureClass, error, extra = {}) =>
    buildRecord({
      lang, mode, task, backend: backendName, network: net.id,
      sdkVersion: workspace?.sdkVersion ?? null,
      passed: false, turns: null, interventions: 0,
      failureClass, assertionResults: [], artifacts: {}, env,
      startedAt, error, ...extra,
    });

  // 1. Workspace with the SDK installed from the registry.
  try {
    workspace = await createWorkspaceWithRetry(lang, { mode });
  } catch (e) {
    if (e instanceof InstallFailure) {
      // Do NOT hardcode `install-fail` here. An install can fail because the
      // package is genuinely broken (an SDK defect that must count toward K2)
      // or because the registry was unreachable/intercepted (an environment
      // problem that must not). Let the classifier read the actual message and
      // decide — hardcoding it charged 7 JavaScript runs to the SDK when a
      // proxy was returning HTML instead of JSON.
      const cls = classifyFailure({ transcript: e.message, artifacts: {} });
      return fail(cls === 'network-flake' ? 'network-flake' : 'install-fail', e.message);
    }
    return fail('other', e.message);
  }

  try {
    // 2. Provision an isolated account, to the tier the task's preconditions declare.
    //    Over-provisioning is a correctness bug: pre-funding a task that asks the
    //    agent to fund makes its balance assertion pass vacuously.
    //
    //    Provisioning is gated by a semaphore even when runs are parallel — the
    //    faucet and RPC are shared, and unrestricted concurrency here failed
    //    12/12 runs. Agent execution below stays fully parallel.
    const plan = provisioningPlan(task);
    try {
      env = await provisionGate(() =>
        withRetry(
          () => provisionLiteAccount({ network: net.id, minAcme: 5, fund: plan !== 'keys-only' }),
          { attempts: 3, label: `provision ${lang}/${task.id}` },
        ),
      );
    } catch (e) {
      if (e instanceof NetworkUnreachable) return fail('network-flake', e.message);
      return fail('other', e.message);
    }

    // 2b. Tasks declaring "existing ADI with a credited key page" need signing
    //     to set up; that goes through the Python reference SDK (lib/setup.mjs).
    let setupArtifacts = {};
    if (plan === 'adi') {
      try {
        setupArtifacts = await provisionGate(() => provisionAdi(env));
        await verifyAdiSetup(net, setupArtifacts);
        // The setup owns its own wallet, so the agent must be handed THAT key
        // and those lite URLs — otherwise it signs with a key the ADI's key
        // page does not hold.
        env = {
          ...env,
          adiUrl: setupArtifacts.adiUrl,
          keyBookUrl: setupArtifacts.keyBookUrl,
          keyPageUrl: setupArtifacts.keyPageUrl,
          suggestedAdiUrl: setupArtifacts.adiUrl,
          privateKeyHex: setupArtifacts.privateKeyHex ?? env.privateKeyHex,
          publicKeyHex: setupArtifacts.publicKeyHex ?? env.publicKeyHex,
          liteIdentity: setupArtifacts.liteIdentityUrl ?? env.liteIdentity,
          liteTokenAccount: setupArtifacts.liteTokenAccountUrl ?? env.liteTokenAccount,
        };
        // The prompt states this balance as fact. It was still the FIRST
        // wallet's figure while the account named beside it belonged to the
        // setup wallet, so every agent queried an account whose balance did not
        // match the brief, decided the environment was wrong, and spent turns
        // re-funding it. Every language flagged this. Re-read the real balance.
        try {
          const acct = await queryAccount(net, env.liteTokenAccount);
          const base = acct?.balance !== undefined ? BigInt(acct.balance) : 0n;
          env.balanceBase = String(base);
          env.balanceAcme = Number(base) / 1e8;
          env.funded = base > 0n;
        } catch {
          // Leave the prior figure rather than invent one.
        }
      } catch (e) {
        if (e instanceof SetupFailure) return fail('harness-setup-failed', e.message);
        if (e instanceof NetworkUnreachable) return fail('network-flake', e.message);
        return fail('other', e.message);
      }
    }

    const inputs = resolveTaskInputs(task, env);
    const baseline = await captureBaseline(net, task, {});

    // 3. Run the agent.
    let result;
    try {
      backend.dumpPrompt?.(workspace.dir, task, lang, env, inputs, mode);
      result = await backend.run({ task, lang, env, inputs, workspace, timeoutMs, model, mode });
    } catch (e) {
      // Hardcoding `other` here charged every backend-invocation failure to the
      // SDK, including ones where the harness lost its own workspace. Let the
      // classifier decide so infrastructure faults land in an excluded class.
      const msg = `backend error: ${e.message}`;
      return fail(classifyFailure({ transcript: msg, stderr: msg, artifacts: {} }), msg);
    }

    // 4. Verify against chain state — independent of anything the agent claimed.
    let evaluation;
    try {
      evaluation = await evaluateAssertions(task, {
        net, env, inputs, baseline,
        // Setup-provisioned identifiers are a FALLBACK; anything the agent
        // reported wins, so the agent's own work is what gets verified.
        artifacts: { ...setupArtifacts, ...(result.artifacts || {}) },
      });
    } catch (e) {
      if (e instanceof NetworkUnreachable) {
        return fail('network-flake', `assertion evaluation: ${e.message}`, {
          turns: result.turns, transcriptPath: null,
        });
      }
      return fail('other', `assertion evaluation: ${e.message}`);
    }

    const failureClass = evaluation.passed
      ? null
      : classifyFailure({
          transcript: result.transcript,
          stderr: result.stderr,
          assertionResults: evaluation.results,
          timedOut: result.timedOut,
          artifacts: result.artifacts,
          turns: result.turns,
          durationMs: result.durationMs,
        });

    const record = buildRecord({
      lang, mode, task, backend: backendName, network: net.id,
      sdkVersion: workspace.sdkVersion,
      passed: evaluation.passed,
      turns: result.turns,
      interventions: result.interventions ?? 0,
      failureClass,
      assertionResults: evaluation.results,
      artifacts: result.artifacts,
      env,
      durationMs: result.durationMs,
      startedAt,
      error: null,
    });

    // Pass the run's date stamp explicitly. Without it saveTranscript defaults
    // to "today", so a run that crosses midnight UTC writes its transcript into
    // a different date directory than its record — orphaning the diagnostic
    // exactly when a long run needs it. Observed on the first full 40-run
    // baseline, which started 07-27 and finished 07-28.
    record.transcriptPath = saveTranscript(HERE, record, result.transcript, dateStamp);
    return record;
  } finally {
    if (workspace && !keepWorkspace) safeRemove(workspace.dir);
  }
}

async function main() {
  if (flag('self-test')) return selfTest();

  if (flag('clean-cache')) {
    const sweep = sweepStaleWorkspaces({ olderThanMs: 0 });
    const venv = clearSetupEnvCache();
    console.log(
      `Removed ${sweep.removed} stale workspace(s), freed ~${sweep.freedMb} MB` +
        `${venv ? '; cleared the setup-venv cache' : '; no setup-venv cache present'}.`,
    );
    return;
  }

  const tasks = allTasks();

  if (flag('list')) {
    console.log('Canonical tasks:');
    for (const t of tasks) {
      console.log(`  ${t.file.padEnd(22)} ${t.title}  [template: ${t.template}, assertions: ${t.success_assertions.length}]`);
    }
    console.log(`\nLangs: ${LANGS.join(', ')}\nModes: ${MODES.join(', ')}`);
    console.log(`Backends: ${Object.keys(backends).join(', ')}`);
    console.log(`\nMatrix: ${tasks.length} tasks × ${LANGS.length} langs = ${tasks.length * LANGS.length} runs per mode.`);
    return;
  }

  const mode = opt('mode', 'sdk');
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}" (known: ${MODES.join(', ')})`);

  const backendName = opt('backend');
  const langSel = opt('lang', 'all');
  const langs = langSel === 'all' ? LANGS : langSel.split(',').map((s) => s.trim());
  for (const l of langs) if (!LANGS.includes(l)) throw new Error(`unknown lang "${l}"`);

  const taskSel = opt('tasks') || opt('task') || 'all';
  const selTasks =
    taskSel === 'all'
      ? tasks
      : tasks.filter((t) => t.file.startsWith(taskSel) || t.id === taskSel);
  if (!selTasks.length) throw new Error(`no task matched "${taskSel}"`);

  if (flag('preflight')) return preflight(langs, backendName);

  // Build the job list before the dry-run report, so --dry-run shows exactly
  // what a real invocation would execute. `--only lang:task,...` selects
  // specific pairs so a targeted re-run happens in ONE process, which is what
  // lets the setup-venv cache pay off.
  const jobs = [];
  const only = opt('only');
  if (only) {
    for (const pair of only.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [l, t] = pair.split(':');
      if (!LANGS.includes(l)) throw new Error(`--only: unknown lang "${l}" in "${pair}"`);
      const task = tasks.find((x) => x.id === t || x.file.startsWith(t));
      if (!task) throw new Error(`--only: unknown task "${t}" in "${pair}"`);
      jobs.push({ lang: l, task });
    }
  } else {
    for (const lang of langs) for (const task of selTasks) jobs.push({ lang, task });
  }

  if (flag('dry-run') || !backendName) {
    console.log(`[dry-run] mode=${mode} backend=${backendName || '(none)'} jobs=${jobs.length}`);
    for (const j of jobs) console.log(`  would run: ${j.lang} / ${j.task.id} (${mode})`);
    if (!backendName) console.log('\nNo --backend given: this is a dry run. Pass --backend claude-code to record K2–K4.');
    return;
  }

  if (mode !== 'sdk' && mode !== 'cli') {
    throw new Error(
      `mode "${mode}" has no driver yet — "sdk" (RB-01) and "cli" (RB-04) are implemented. ` +
        `mcp/codegen modes land with RB-02/RB-07.`,
    );
  }

  const backend = getBackend(backendName);
  preflightOrThrow(langs, backendName, backend);

  const model = opt('model');
  const timeoutMs = Number(opt('timeout-ms', '900000'));
  const keepWorkspace = flag('keep-workspace');
  // `--date` merges a partial re-run into an existing baseline. Without it a
  // targeted re-run writes a fresh date directory holding only those records,
  // and loadRuns then reports that handful as the whole baseline — silently
  // discarding every run that was not re-executed.
  const dateStamp = opt('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStamp)) {
    throw new Error(`--date must be YYYY-MM-DD, got "${dateStamp}"`);
  }

  const total = jobs.length;
  const concurrency = Math.max(1, Number(opt('concurrency', '1')));
  const provisionConcurrency = Math.max(1, Number(opt('provision-concurrency', '1')));
  provisionGate = createSemaphore(provisionConcurrency);
  console.error(
    `Running ${total} run(s), mode=${mode}, backend=${backendName}, ` +
      `concurrency=${concurrency} (provisioning gated to ${provisionConcurrency})`,
  );
  if (concurrency > 1) {
    // Every run provisions its own keypair, funds it, and (for the ADI tier)
    // builds its own ADI, so runs share no on-chain state and can overlap.
    // Only the faucet/RPC phase is serialised.
    console.error('Each run provisions an isolated account; no shared chain state.');
  }

  // Reclaim anything a previously killed run left behind before adding more.
  const swept = sweepStaleWorkspaces();
  if (swept.removed) {
    console.error(`Swept ${swept.removed} stale workspace(s), freed ~${swept.freedMb} MB.`);
  }

  // Build the shared setup venv once, up front, rather than letting N workers
  // race to create it simultaneously.
  if (jobs.some(({ task }) => provisioningPlan(task) === 'adi')) {
    await ensureSetupEnv();
  }

  const records = [];
  let next = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      const { lang, task } = jobs[i];
      const label = `${lang}/${task.id}`;
      console.error(`[start ${i + 1}/${total}] ${label}`);
      const rec = await executeRun({
        lang, task, mode, backendName, backend, model, timeoutMs, keepWorkspace, dateStamp,
      });
      const file = saveRecord(HERE, rec, dateStamp);
      records.push(rec);
      done++;
      const status = rec.passed ? 'PASS' : `FAIL (${rec.failureClass})`;
      console.error(
        `[done ${done}/${total}] ${label} — ${status}` +
          `${rec.turns != null ? `, turns=${rec.turns}` : ''}` +
          `${rec.durationMs != null ? `, ${(rec.durationMs / 1000).toFixed(0)}s` : ''} -> ${file}`,
      );
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));

  // Summary mirrors how the scorecard will derive K2.
  const scored = records.filter((r) => r.passed || countsTowardK2(r.failureClass));
  const passed = scored.filter((r) => r.passed).length;
  const excluded = records.length - scored.length;
  console.error('');
  console.error(`Done. ${passed}/${scored.length} passed${excluded ? ` (${excluded} excluded as network-flake)` : ''}.`);
  console.error(`Records: tools/agent-harness/results/${dateStamp}/${mode}/`);
  console.error(`Next: npm run verify:scorecard`);
}

function preflightOrThrow(langs, backendName, backend) {
  const problems = [
    ...checkToolchains(langs).map((m) => `toolchain missing: ${m}`),
    ...(backend.checkAvailable?.() ?? []),
  ];
  if (problems.length) {
    throw new Error(`preflight failed:\n  - ${problems.join('\n  - ')}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
