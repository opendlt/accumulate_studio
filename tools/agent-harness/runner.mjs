#!/usr/bin/env node
/**
 * agent-harness runner — Phase 0 (P0-XR-01, -02, -04, -05)
 *
 * Drives an AI coding agent through the 8 canonical Accumulate tasks from the
 * *installed* SDK and scores K2 (first-try pass), K3 (turns-to-first-tx), and
 * K4 (human interventions).
 *
 * STATUS: scaffold. `--list` and `--dry-run` work today with no secrets. Actually
 * running an agent requires (a) an agent backend + API key and (b) a funded
 * testnet — see README "Wiring the agent runner". Until then, real runs record
 * PENDING_RUNNER so the scorecard clearly distinguishes "not yet measured" from
 * "measured and failing".
 *
 * Usage:
 *   node tools/agent-harness/runner.mjs --list
 *   node tools/agent-harness/runner.mjs --lang python --task 04-send-tokens --backend claude
 *   node tools/agent-harness/runner.mjs --lang all --tasks all --backend claude --mode sdk
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(HERE, 'tasks');
const LANGS = ['rust', 'python', 'dart', 'csharp', 'javascript'];
const MODES = ['sdk', 'mcp', 'codegen'];

// --- minimal YAML front-of-file parser (flat keys + prompt block) -----------
// The task specs are intentionally simple; we avoid a YAML dependency by parsing
// the fields the runner needs (id, title, network, maps_to_template).
function loadTask(file) {
  const text = readFileSync(join(TASKS_DIR, file), 'utf-8');
  const field = (k) => (text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim();
  return {
    file,
    id: field('id'),
    title: field('title'),
    network: field('network'),
    template: field('maps_to_template'),
  };
}

function allTasks() {
  return readdirSync(TASKS_DIR).filter((f) => f.endsWith('.yaml')).sort().map(loadTask);
}

// --- agent backend interface (adapters implement this) ----------------------
// An AgentBackend receives a task prompt + the installed-package context and
// returns { code, turns, interventions }. Backends are registered here.
const backends = {
  // e.g. claude: makeClaudeBackend(), codex: makeCodexBackend(), oss: ...
};

function getBackend(name) {
  const b = backends[name];
  if (!b) {
    const key = { claude: 'ANTHROPIC_API_KEY', codex: 'OPENAI_API_KEY' }[name];
    throw new Error(
      `agent backend "${name}" is not wired yet. Configure it in runner.mjs and set ${key || 'the provider API key'} ` +
        `as an env/CI secret. See tools/agent-harness/README.md.`,
    );
  }
  return b;
}

// --- CLI --------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

function selfTest() {
  const tasks = allTasks();
  const errors = [];
  const required = ['id', 'title', 'network', 'template'];
  if (tasks.length !== 8) errors.push(`expected 8 canonical task specs, found ${tasks.length}`);
  for (const t of tasks) {
    for (const f of required) if (!t[f]) errors.push(`${t.file}: missing "${f === 'template' ? 'maps_to_template' : f}"`);
  }
  if (errors.length) {
    console.error('Harness self-test FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Harness self-test PASS: ${tasks.length} task specs well-formed; ${LANGS.length} langs; modes ${MODES.join('/')}.`);
}

function main() {
  if (args.includes('--self-test')) return selfTest();

  const tasks = allTasks();

  if (args.includes('--list')) {
    console.log('Canonical tasks:');
    for (const t of tasks) console.log(`  ${t.file.padEnd(22)} ${t.title}  [template: ${t.template}]`);
    console.log(`\nLangs: ${LANGS.join(', ')}\nModes: ${MODES.join(', ')}`);
    console.log(`\nMatrix: ${tasks.length} tasks × ${LANGS.length} langs = ${tasks.length * LANGS.length} runs per mode.`);
    return;
  }

  const mode = opt('mode', 'sdk');
  const backendName = opt('backend');
  const langSel = opt('lang', 'all');
  const langs = langSel === 'all' ? LANGS : [langSel];
  const taskSel = opt('tasks') || opt('task') || 'all';
  const selTasks = taskSel === 'all' ? tasks : tasks.filter((t) => t.file.startsWith(taskSel) || t.id === taskSel);

  if (args.includes('--dry-run') || !backendName) {
    console.log(`[dry-run] mode=${mode} backend=${backendName || '(none)'}`);
    for (const lang of langs)
      for (const t of selTasks) console.log(`  would run: ${lang} / ${t.id} (${mode})`);
    if (!backendName) console.log('\nNo --backend given: this is a dry run. Wire a backend to record K2–K4.');
    return;
  }

  // Real execution path (requires a wired backend + testnet). Kept explicit so
  // the failure is a clear "configure me", never a silent fake pass.
  getBackend(backendName); // throws with guidance until wired
  throw new Error('runner execution path is scaffolded but not yet enabled — see README.');
}

main();
