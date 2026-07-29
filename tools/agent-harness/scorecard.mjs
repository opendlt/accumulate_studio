#!/usr/bin/env node
/**
 * scorecard.mjs — Phase 0 (P0-XR-06)
 *
 * Aggregates the deterministic artifact-verify results (and, once wired, the
 * agent-runner K2–K4 results) into the program scorecard: KPIs K1–K10 from the
 * Master Plan. Emits docs/ai-agent-readiness/SCORECARD.md and scorecard.json.
 *
 * Deterministic KPIs (available now): K1, K5, K8, K10.
 * Agent-driven KPIs (need the runner + secrets): K2, K3, K4 -> PENDING_RUNNER.
 * Depth KPIs (delivered in Phase 3): K6, K7 -> PENDING_PHASE3.
 *
 * Usage: node tools/agent-harness/scorecard.mjs   (or: npm run verify:scorecard)
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadRuns, latestRunDate } from './lib/record.mjs';
import { countsTowardK2, summarizeFailures, FAILURE_CLASSES } from './lib/classify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT_DIR = join(REPO, 'docs', 'ai-agent-readiness');
const AV_JSON = join(OUT_DIR, 'artifact-verify.json');
const LANGS = ['rust', 'python', 'dart', 'csharp', 'javascript'];

/**
 * Load artifact-verify results. Preferred (CI-friendly): read the JSON emitted
 * by `verify.mjs --out docs/ai-agent-readiness/artifact-verify.json`. Fallback:
 * spawn the verifier directly. Decoupling avoids a nested child-process spawn
 * and lets the scorecard regenerate offline from the last verify run.
 */
function loadArtifactVerify() {
  if (existsSync(AV_JSON)) {
    return JSON.parse(readFileSync(AV_JSON, 'utf-8'));
  }
  try {
    const raw = execFileSync('node', [join(REPO, 'tools', 'artifact-verify', 'verify.mjs'), '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(raw);
  } catch (e) {
    if (e.stdout) return JSON.parse(e.stdout.toString()); // verifier exits 1 when FAILs present
    throw new Error(
      `No ${AV_JSON} found and could not spawn verify.mjs (${e.message}). ` +
        `Run: node tools/artifact-verify/verify.mjs --out docs/ai-agent-readiness/artifact-verify.json`,
    );
  }
}

const av = loadArtifactVerify();
const by = (lang, id) => av.results.find((r) => r.lang === lang && r.id === id);

/**
 * Derive the agent-driven KPIs (K2/K3/K4) from harness run records.
 *
 * If no runs exist, every value stays PENDING_RUNNER. That distinction — "not
 * yet measured" vs "measured and failing" — is the scaffold's most important
 * property and must survive: a fabricated 0% would read as a catastrophic
 * regression rather than an unrun harness.
 *
 * `network-flake` runs are excluded from the K2 denominator so K2 measures SDK
 * quality rather than testnet uptime.
 */
function deriveAgentKpis(mode = 'sdk') {
  const { date, runs } = loadRuns(HERE, mode);
  if (!runs.length) {
    return {
      measured: false,
      date,
      mode,
      runs: [],
      k2: 'PENDING_RUNNER',
      k3: 'PENDING_RUNNER',
      k4: 'PENDING_RUNNER',
      k2Status: 'PENDING',
      k3Status: 'PENDING',
      k4Status: 'PENDING',
    };
  }

  const scored = runs.filter((r) => r.passed || countsTowardK2(r.failureClass));
  const excluded = runs.length - scored.length;
  const passed = scored.filter((r) => r.passed).length;
  const passRate = scored.length ? passed / scored.length : 0;

  // K3 counts turns-to-first-tx only on runs that actually reached a first tx.
  const turnRuns = runs.filter((r) => r.passed && typeof r.turns === 'number');
  const meanTurns = turnRuns.length
    ? turnRuns.reduce((s, r) => s + r.turns, 0) / turnRuns.length
    : null;

  const interventionRuns = runs.filter((r) => typeof r.interventions === 'number');
  const meanInterventions = interventionRuns.length
    ? interventionRuns.reduce((s, r) => s + r.interventions, 0) / interventionRuns.length
    : null;

  return {
    measured: true,
    date,
    mode,
    runs,
    excluded,
    scoredCount: scored.length,
    passedCount: passed,
    k2: `${Math.round(passRate * 100)}% (${passed}/${scored.length})${excluded ? ` — ${excluded} flake excluded` : ''}`,
    k2Status: passRate >= 0.9 ? 'GREEN' : 'RED',
    k3: meanTurns === null ? 'no passing runs' : `${meanTurns.toFixed(1)} mean turns (n=${turnRuns.length})`,
    k3Status: meanTurns === null ? 'RED' : meanTurns <= 6 ? 'GREEN' : 'RED',
    k4: meanInterventions === null ? 'not recorded' : `${meanInterventions.toFixed(2)} per task`,
    k4Status: meanInterventions === null ? 'PENDING' : meanInterventions <= 0.2 ? 'GREEN' : 'RED',
  };
}

const agent = deriveAgentKpis(process.env.HARNESS_MODE || 'sdk');

/**
 * K6 — typed-surface ratio: can an agent's tooling discover the public API from
 * the PUBLISHED artifact?
 *
 * Every manifest already reports 24/24 operations with complete signatures, so
 * the source-level ratio is 100%. What K6 measures is whether those signatures
 * survive into the published package in a form tooling can read:
 *   python     py.typed ships
 *   csharp     nupkg ships lib/<tfm>/*.xml
 *   javascript "types" entry resolves + exports targets resolve
 *   rust       docs.rs built rustdoc for the published version
 *   dart       dartdoc comments ship and pub.dev analysis is clean
 *
 * A language with no TYPE_SIGNALS check defined counts as UNMEASURED, not as a
 * pass — that conflation is what let rust and dart sit blank while reading as
 * "n/a" on the scorecard.
 */
function deriveK6() {
  const measured = LANGS.filter((l) => by(l, 'TYPE_SIGNALS'));
  const passing = measured.filter((l) => by(l, 'TYPE_SIGNALS').status === 'PASS');
  const unmeasured = LANGS.filter((l) => !by(l, 'TYPE_SIGNALS'));

  if (!measured.length) {
    return { value: 'PENDING_PHASE3', status: 'PENDING' };
  }
  const suffix = unmeasured.length ? ` — ${unmeasured.join(', ')} unmeasured` : '';
  return {
    value: `${passing.length}/${LANGS.length} languages expose a machine-readable API surface${suffix}`,
    status: passing.length === LANGS.length ? 'GREEN' : 'RED',
  };
}

const k6 = deriveK6();

/**
 * K9 descriptor, read from the MCP package rather than hardcoded — a literal
 * here silently goes stale the moment the server is versioned.
 */
function mcpDescriptorFor() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(REPO, 'apps', 'mcp-server', 'package.json'), 'utf-8'),
    );
    const primitives = ['tools', 'resources', 'prompts'];
    return `${pkg.name}@${pkg.version} on npm (${primitives.join(' + ')})`;
  } catch {
    return 'accumulate-studio-mcp on npm';
  }
}
const mcpDescriptor = mcpDescriptorFor();

// 2) Derive KPIs
/**
 * K1 — can an agent follow the published quickstart verbatim?
 *
 * Install-name parity alone is only a proxy. Where a RUNTIME_IMPORT check
 * exists, it is the stronger evidence: accumulate-sdk-opendlt@2.2.0 has correct
 * install-name parity and every exports path present in the tarball, yet
 * `import 'accumulate-sdk-opendlt'` throws ERR_MODULE_NOT_FOUND because a
 * runtime dependency is declared under devDependencies. Counting only name
 * parity reported K1 5/5 green while the published quickstart line did not run.
 *
 * A language passes K1 when its install name matches AND, if an import probe is
 * defined, that probe succeeds.
 */
const k1Pass = LANGS.filter((l) => {
  if (by(l, 'NAME_PARITY')?.status !== 'PASS') return false;
  const imp = by(l, 'RUNTIME_IMPORT');
  return !imp || imp.status === 'PASS';
});
const importChecked = LANGS.filter((l) => by(l, 'RUNTIME_IMPORT'));
const importBroken = importChecked.filter((l) => by(l, 'RUNTIME_IMPORT').status !== 'PASS');
const k1 =
  `${k1Pass.length}/5 quickstart-runnable (install-name parity` +
  (importChecked.length ? ` + import probe on ${importChecked.join(', ')}` : '') +
  ')' +
  (importBroken.length ? ` — root import BROKEN: ${importBroken.join(', ')}` : '');
const namePass = k1Pass;
const llmsPass = LANGS.filter((l) => by(l, 'LLMS_TXT')?.status === 'PASS');
const versionParity = by('fleet', 'VERSION_PARITY');
// Docs-vs-artifact drift = does the published artifact match what the docs
// promise (install name, resolvable exports, llms.txt shipped)?
//
// TYPE_SIGNALS is deliberately NOT in this set. It measures whether the type
// surface is machine-readable, which is K6's job; counting it here too would
// turn one defect into two red KPIs and misreport a dartdoc gap as "docs drift".
// Fleet version parity is likewise excluded — that is K8.
const DRIFT_IDS = ['NAME_PARITY', 'EXPORTS_RESOLVE', 'LLMS_TXT'];
const driftFail = av.results.some((r) => DRIFT_IDS.includes(r.id) && r.status === 'FAIL');

const kpis = [
  { id: 'K1', name: 'Quickstart-verbatim (install-name parity)', value: k1,
    status: namePass.length === 5 ? 'GREEN' : 'RED', target: '5/5' },
  { id: 'K2', name: 'Task first-try pass rate', value: agent.k2, status: agent.k2Status, target: '>= 90%' },
  { id: 'K3', name: 'Turns-to-first-tx', value: agent.k3, status: agent.k3Status, target: '<= 6' },
  { id: 'K4', name: 'Human interventions per task', value: agent.k4, status: agent.k4Status, target: '<= 0.2' },
  { id: 'K5', name: 'API-ingestion coverage (llms.txt shipped)', value: `${llmsPass.length}/5`,
    status: llmsPass.length === 5 ? 'GREEN' : 'RED', target: '5/5 (Phase 2)' },
  { id: 'K6', name: 'Typed-surface ratio', value: k6.value, status: k6.status, target: '100%' },
  { id: 'K7', name: 'Error-actionability', value: 'PENDING_PHASE3', status: 'PENDING', target: '>= 95%' },
  { id: 'K8', name: 'Fleet version parity', value: versionParity?.detail || '?',
    status: versionParity?.status === 'PASS' ? 'GREEN' : 'RED', target: '1 minor line' },
  { id: 'K9', name: 'MCP installable in <= 1 config block', value: mcpDescriptor,
    status: 'GREEN', target: 'published' },
  { id: 'K10', name: 'Docs-vs-artifact drift (artifact-verify)', value: driftFail ? 'drift present' : 'clean',
    status: driftFail ? 'RED' : 'GREEN', target: 'CI-gated, 0 drift' },
];

// 3) Per-language snapshot
const perLang = LANGS.map((l) => ({
  lang: l,
  version: (by(l, 'VERSION')?.detail.match(/@ ([^\s]+)/) || [])[1] || '?',
  name_parity: by(l, 'NAME_PARITY')?.status || '-',
  type_signals: by(l, 'TYPE_SIGNALS')?.status || '-',
  exports: by(l, 'EXPORTS_RESOLVE')?.status || '-',
  llms: by(l, 'LLMS_TXT')?.status || '-',
}));

// 4) Emit
const stamp = new Date().toISOString().slice(0, 10);
const icon = { GREEN: '🟢', RED: '🔴', PENDING: '⚪' };
const sIcon = { PASS: '✅', FAIL: '❌', EXPECTED_FAIL: '🔶', SKIP: '⚠️', INFO: 'ℹ️', '-': '·' };

let md = `# Accumulate AI-Agent Readiness — Scorecard\n\n`;
md += `> Generated by \`tools/agent-harness/scorecard.mjs\` from \`artifact-verify\`. `;
md += `Deterministic KPIs (K1, K5, K8, K10) are live now; agent-driven KPIs (K2–K4) and depth KPIs (K6, K7) light up as the runner (Phase 0) and Phase 3 land.\n\n`;
md += `**Baseline date:** ${stamp}\n\n`;

md += `## KPIs\n\n| KPI | Metric | Status | Value | Target |\n|---|---|:--:|---|---|\n`;
for (const k of kpis) md += `| ${k.id} | ${k.name} | ${icon[k.status]} | ${k.value} | ${k.target} |\n`;

md += `\n## Per-language artifact snapshot\n\n| Lang | Version | Name parity | Type signals | Exports | llms.txt |\n|---|---|:--:|:--:|:--:|:--:|\n`;
for (const p of perLang)
  md += `| ${p.lang} | ${p.version} | ${sIcon[p.name_parity]} | ${sIcon[p.type_signals]} | ${sIcon[p.exports]} | ${sIcon[p.llms]} |\n`;

// --- Agent-run results: the prioritization input for RB-02..RB-06 -----------
if (agent.measured) {
  md += `\n## Agent runs — ${agent.mode} mode (${agent.date})\n\n`;
  md += `${agent.passedCount}/${agent.scoredCount} scored runs passed`;
  md += agent.excluded ? ` · ${agent.excluded} excluded as \`network-flake\`\n\n` : `\n\n`;

  md += `| Lang | ${['task', ...new Set(agent.runs.map((r) => r.task.id))].slice(1).join(' | ')} |\n`;
  md += `|---|${'---|'.repeat(new Set(agent.runs.map((r) => r.task.id)).size)}\n`;
  const taskIds = [...new Set(agent.runs.map((r) => r.task.id))];
  for (const lang of LANGS) {
    const cells = taskIds.map((tid) => {
      const r = agent.runs.find((x) => x.lang === lang && x.task.id === tid);
      if (!r) return '·';
      return r.passed ? '✅' : `❌`;
    });
    if (cells.some((c) => c !== '·')) md += `| ${lang} | ${cells.join(' | ')} |\n`;
  }

  const failures = summarizeFailures(agent.runs);
  const entries = Object.entries(failures).sort((a, b) => b[1] - a[1]);
  if (entries.length) {
    md += `\n### Failure classes\n\n`;
    md += `The class is the prioritization input — it says *which runbook* fixes the failure.\n\n`;
    md += `| Class | Count | Counts toward K2 | Addressed by |\n|---|--:|:--:|---|\n`;
    for (const [cls, count] of entries) {
      const meta = FAILURE_CLASSES[cls] || { excludeFromK2: false, fixedBy: [] };
      md += `| \`${cls}\` | ${count} | ${meta.excludeFromK2 ? 'no' : 'yes'} | ${meta.fixedBy.join(', ') || '—'} |\n`;
    }
  } else {
    md += `\n### Failure classes\n\nNo failures recorded.\n`;
  }
} else {
  md += `\n## Agent runs\n\n`;
  md += `No run records found — K2/K3/K4 remain \`PENDING_RUNNER\`.\n\n`;
  md += `This is deliberately distinct from a measured zero. To produce a baseline:\n\n`;
  md += `\`\`\`bash\nnpm run harness:preflight    # toolchains + backend available?\nnpm run harness:run         # 8 tasks x 5 langs, sdk mode\nnpm run verify:scorecard\n\`\`\`\n`;
}

md += `\n## Legend\n\n`;
md += `- 🟢 green · 🔴 red · ⚪ pending measurement\n`;
md += `- ✅ pass · ❌ fail · 🔶 expected-fail (delivered in a later phase) · ⚠️ skip (check defined, could not run) · ℹ️ info\n`;
md += `- \`·\` **no check defined for this language** — unmeasured, which is not the same as passing\n\n`;
md += `## How to reproduce\n\n\`\`\`bash\nnpm run verify:artifacts     # raw artifact checks (deterministic KPIs)\nnpm run harness:run          # agent runs (K2-K4) — needs a backend + testnet\nnpm run verify:scorecard     # regenerate this file\n\`\`\`\n`;

writeFileSync(join(OUT_DIR, 'SCORECARD.md'), md);
writeFileSync(
  join(OUT_DIR, 'scorecard.json'),
  JSON.stringify(
    {
      baselineDate: stamp,
      kpis,
      perLang,
      agentRuns: agent.measured
        ? {
            mode: agent.mode,
            date: agent.date,
            scoredCount: agent.scoredCount,
            passedCount: agent.passedCount,
            excludedFlake: agent.excluded,
            failureClasses: summarizeFailures(agent.runs),
            runs: agent.runs.map((r) => ({
              lang: r.lang,
              task: r.task.id,
              passed: r.passed,
              turns: r.turns,
              interventions: r.interventions,
              failureClass: r.failureClass,
              sdkVersion: r.sdkVersion,
            })),
          }
        : null,
      artifactVerify: av,
    },
    null,
    2,
  ),
);

console.log(`Wrote docs/ai-agent-readiness/SCORECARD.md and scorecard.json (baseline ${stamp}).`);
const greens = kpis.filter((k) => k.status === 'GREEN').length;
const reds = kpis.filter((k) => k.status === 'RED').length;
const pend = kpis.filter((k) => k.status === 'PENDING').length;
console.log(`KPIs: ${greens} green, ${reds} red, ${pend} pending measurement.`);
