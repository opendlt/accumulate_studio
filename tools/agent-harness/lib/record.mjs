/**
 * record.mjs — run-record persistence (RB-01 step 1).
 *
 * Layout:  results/<ISO-date>/<mode>/<lang>--<task-id>.json
 *
 * Records carry the spec hash so that editing a task spec invalidates
 * cross-run comparison instead of silently changing what "the same task" means.
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const RESULTS_DIRNAME = 'results';

export function resultsRoot(harnessDir) {
  return join(harnessDir, RESULTS_DIRNAME);
}

/** Build a record from a completed run. Shape matches schemas/harness-run.schema.json. */
export function buildRecord({
  lang,
  mode,
  task,
  backend,
  network,
  sdkVersion,
  passed,
  turns,
  interventions,
  failureClass,
  assertionResults,
  artifacts,
  env,
  durationMs,
  transcriptPath,
  error,
  startedAt,
}) {
  return {
    schema: 1,
    lang,
    mode,
    backend,
    network,
    task: { id: task.id, file: task.file, title: task.title, specHash: task.specHash },
    sdkVersion: sdkVersion ?? null,
    passed: Boolean(passed),
    turns: turns ?? null,
    interventions: interventions ?? 0,
    failureClass: passed ? null : failureClass || 'other',
    assertions: assertionResults ?? [],
    artifacts: artifacts ?? {},
    // Public identifiers only — never the provisioned private key.
    environment: env
      ? {
          liteIdentity: env.liteIdentity,
          liteTokenAccount: env.liteTokenAccount,
          publicKeyHex: env.publicKeyHex,
          suggestedAdiUrl: env.suggestedAdiUrl,
        }
      : null,
    durationMs: durationMs ?? null,
    transcriptPath: transcriptPath ?? null,
    error: error ?? null,
    startedAt: startedAt ?? null,
    finishedAt: new Date().toISOString(),
  };
}

export function saveRecord(harnessDir, record, dateStamp) {
  const date = dateStamp || record.finishedAt.slice(0, 10);
  const dir = join(resultsRoot(harnessDir), date, record.mode);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.lang}--${record.task.id}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2));
  return file;
}

export function saveTranscript(harnessDir, record, text, dateStamp) {
  const date = dateStamp || new Date().toISOString().slice(0, 10);
  const dir = join(resultsRoot(harnessDir), date, record.mode, 'transcripts');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.lang}--${record.task.id}.txt`);
  writeFileSync(file, text ?? '');
  return file;
}

/** Newest results date directory, or null when nothing has been run. */
export function latestRunDate(harnessDir) {
  const root = resultsRoot(harnessDir);
  if (!existsSync(root)) return null;
  const dates = readdirSync(root)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && statSync(join(root, d)).isDirectory())
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * Load all records for a mode from the newest run date.
 * Returns [] when nothing has been run — the caller uses that to preserve
 * PENDING_RUNNER rather than reporting a fabricated zero.
 */
function readRunsAt(harnessDir, date, mode) {
  const dir = join(resultsRoot(harnessDir), date, mode);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Load run records for a mode.
 *
 * Picks the newest date that ACTUALLY CONTAINS records, not merely the newest
 * directory. A run crossing midnight UTC used to create a later date directory
 * holding only transcripts; selecting it blindly returned zero records and made
 * the scorecard report PENDING_RUNNER — silently hiding a completed 40-run
 * baseline, which reads identically to "the harness was never run".
 */
export function loadRuns(harnessDir, mode = 'sdk', dateStamp = null) {
  if (dateStamp) return { date: dateStamp, runs: readRunsAt(harnessDir, dateStamp, mode) };

  const root = resultsRoot(harnessDir);
  if (!existsSync(root)) return { date: null, runs: [] };
  const dates = readdirSync(root)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && statSync(join(root, d)).isDirectory())
    .sort()
    .reverse();

  for (let i = 0; i < dates.length; i++) {
    const runs = readRunsAt(harnessDir, dates[i], mode);
    if (!runs.length) continue;

    // A fleet run takes hours, so it can cross midnight and land in two
    // directories. Reading only the newest then scores the tail of the sweep as
    // if it were the whole fleet — a 40-run sweep reported as 9. Merge the
    // immediately preceding day when it exists, which is exactly the span a
    // single sweep can cover, and keep the newest record per task so a re-run
    // supersedes rather than duplicates. Older sweeps are NOT merged: filling
    // gaps from last week's data would present stale results as current.
    const prev = dates[i + 1];
    const isAdjacent = prev && (Date.parse(dates[i]) - Date.parse(prev)) === 86_400_000;
    if (!isAdjacent) return { date: dates[i], runs };

    const merged = new Map();
    for (const r of [...readRunsAt(harnessDir, prev, mode), ...runs]) {
      merged.set(`${r.lang}/${r.task?.id ?? r.task}`, r);
    }
    return { date: dates[i], runs: [...merged.values()] };
  }
  return { date: dates[0] ?? null, runs: [] };
}

/** Every mode that has records under the newest date. */
export function availableModes(harnessDir, dateStamp = null) {
  const date = dateStamp || latestRunDate(harnessDir);
  if (!date) return [];
  const dir = join(resultsRoot(harnessDir), date);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
}
