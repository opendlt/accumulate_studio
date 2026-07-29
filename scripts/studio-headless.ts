#!/usr/bin/env npx tsx
/**
 * studio-headless.ts — RB-07B: agent-facing runtime introspection for Studio.
 *
 * Studio is a browser app, so for every other artifact in this program an agent
 * can verify its own output (run the tests, call the API, query the chain) but
 * for Studio it could not. This closes that: load a flow, generate code for a
 * target language, and emit a single machine-readable JSON document describing
 * exactly what happened.
 *
 * Runs under `npx tsx` against the codegen SOURCE. The built
 * `packages/codegen/dist` cannot be imported by Node — tsconfig.base.json sets
 * `moduleResolution: bundler`, so emitted ESM specifiers have no file
 * extensions and Node's resolver rejects them. That is fine for Studio (Vite
 * bundles it) but makes the package unusable from any Node script. The repo
 * already works around this the same way for `validate:manifests`.
 *
 * Usage:
 *   npx tsx scripts/studio-headless.ts --template token-transfer --lang rust
 *   npx tsx scripts/studio-headless.ts --flow ./my-flow.json --lang python
 *   npx tsx scripts/studio-headless.ts --all                 # every template x every language
 *   npx tsx scripts/studio-headless.ts --list
 *
 * Exit codes: 0 all generations succeeded · 1 at least one failed · 2 usage error.
 *
 * stdout carries ONLY the JSON document; progress goes to stderr. Same
 * discipline as the MCP server and the SDK CLIs.
 */

import { readFileSync, writeFileSync } from 'fs';
import { generateCodeFromManifest, loadAllManifests } from '../packages/codegen/src/index';
import { GOLDEN_PATH_TEMPLATES } from '../apps/studio/src/data/flow-templates';
import { BLOCK_CATALOG } from '../packages/types/src/index';
import type { Flow, SDKLanguage, BlockType } from '../packages/types/src/index';

const LANGUAGES: SDKLanguage[] = ['python', 'rust', 'dart', 'csharp', 'javascript'];

interface GenerationResult {
  template: string;
  language: SDKLanguage;
  ok: boolean;
  bytes: number;
  lines: number;
  nodeCount: number;
  durationMs: number;
  diagnostics: Diagnostic[];
  error: string | null;
}

interface Diagnostic {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Static checks on generated code. These are the failure modes that produce
 * output which *looks* fine but does not run — exactly what a human skims past
 * and an agent cannot detect without executing.
 */
function inspect(code: string, language: SDKLanguage): Diagnostic[] {
  const d: Diagnostic[] = [];

  // An unrendered Handlebars expression means a template variable was never
  // bound. Handlebars.compile is lazy, so this survives compilation silently.
  const unrendered = code.match(/\{\{[^}]*\}\}/g);
  if (unrendered) {
    d.push({
      level: 'error',
      message: `${unrendered.length} unrendered template expression(s): ${[...new Set(unrendered)].slice(0, 5).join(', ')}`,
    });
  }

  if (/\bundefined\b/.test(code)) {
    d.push({ level: 'warning', message: 'generated code contains the literal "undefined"' });
  }
  if (/\[object Object\]/.test(code)) {
    d.push({ level: 'error', message: 'generated code contains "[object Object]" — a value was stringified wrongly' });
  }
  if (!code.trim()) {
    d.push({ level: 'error', message: 'generated code is empty' });
  }

  // The 1e8 footgun: a bare decimal ACME amount that was never scaled.
  if (/amount\s*[:=]\s*["']?\d+\.\d+["']?/i.test(code)) {
    d.push({
      level: 'warning',
      message: 'a decimal amount literal is present — confirm it was scaled to base units (1 ACME = 1e8)',
    });
  }

  // Mainnet must never appear in generated example code.
  if (/mainnet/i.test(code)) {
    d.push({ level: 'error', message: 'generated code references mainnet' });
  }

  // Cheap language-shaped sanity checks.
  const balanced = (open: string, close: string) =>
    (code.split(open).length - 1) === (code.split(close).length - 1);
  if (language !== 'python' && !balanced('{', '}')) {
    d.push({ level: 'error', message: 'unbalanced braces in generated code' });
  }
  if (!balanced('(', ')')) {
    d.push({ level: 'error', message: 'unbalanced parentheses in generated code' });
  }

  return d;
}

/**
 * Structural checks on the FLOW, before generation.
 *
 * Without these the tool reports a clean pass for a flow whose blocks do not
 * exist: the generator emits a preamble, no operation, and nothing in the
 * output text looks wrong. Verified against a flow containing a single
 * `NotARealBlockType` node — it produced 53 lines of valid-looking Python.
 */
function inspectFlow(flow: Flow): Diagnostic[] {
  const d: Diagnostic[] = [];
  const nodes = flow.nodes ?? [];

  if (!nodes.length) {
    d.push({ level: 'error', message: 'flow has no nodes' });
    return d;
  }

  const known = new Set(Object.keys(BLOCK_CATALOG));
  for (const n of nodes) {
    if (!known.has(n.type as BlockType)) {
      d.push({
        level: 'error',
        message: `node "${n.id}" has unknown block type "${n.type}" — it will silently generate no code`,
      });
    }
  }

  // A multi-node flow with no connections is almost always a malformed import;
  // execution order would be undefined.
  if (nodes.length > 1 && !(flow.connections ?? []).length) {
    d.push({ level: 'error', message: `flow has ${nodes.length} nodes but no connections` });
  }

  const ids = nodes.map((n) => n.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) {
    d.push({ level: 'error', message: `duplicate node ids: ${[...new Set(dupes)].join(', ')}` });
  }

  return d;
}

function generateOne(templateId: string, flow: Flow, language: SDKLanguage): GenerationResult {
  const manifests = loadAllManifests();
  const started = Date.now();
  const base = {
    template: templateId,
    language,
    nodeCount: flow.nodes?.length ?? 0,
  };

  const flowDiagnostics = inspectFlow(flow);

  try {
    const code = generateCodeFromManifest(flow, language, 'sdk', manifests[language] ?? null);
    const diagnostics = [...flowDiagnostics, ...inspect(code, language)];
    return {
      ...base,
      ok: !diagnostics.some((x) => x.level === 'error'),
      bytes: Buffer.byteLength(code, 'utf-8'),
      lines: code.split('\n').length,
      durationMs: Date.now() - started,
      diagnostics,
      error: null,
    };
  } catch (e) {
    return {
      ...base,
      ok: false,
      bytes: 0,
      lines: 0,
      durationMs: Date.now() - started,
      diagnostics: flowDiagnostics,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

// --- CLI --------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (n: string, d?: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (n: string) => argv.includes(`--${n}`);

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

function main(): void {
  if (flag('list')) {
    process.stdout.write(
      JSON.stringify(
        {
          templates: GOLDEN_PATH_TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            nodeCount: t.flow.nodes.length,
          })),
          languages: LANGUAGES,
        },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  const langArg = opt('lang');
  const languages: SDKLanguage[] = flag('all')
    ? LANGUAGES
    : langArg
      ? (langArg.split(',').map((s) => s.trim()) as SDKLanguage[])
      : LANGUAGES;
  for (const l of languages) {
    if (!LANGUAGES.includes(l)) fail(`unknown language "${l}" (known: ${LANGUAGES.join(', ')})`);
  }

  // Resolve the flows under test: --all, a named template, or a flow file.
  let jobs: Array<{ id: string; flow: Flow }>;
  const flowPath = opt('flow');
  const templateId = opt('template');

  if (flag('all')) {
    jobs = GOLDEN_PATH_TEMPLATES.map((t) => ({ id: t.id, flow: t.flow }));
  } else if (flowPath) {
    try {
      const parsed = JSON.parse(readFileSync(flowPath, 'utf-8'));
      jobs = [{ id: parsed.name || flowPath, flow: parsed as Flow }];
    } catch (e) {
      fail(`could not read flow file "${flowPath}": ${(e as Error).message}`);
    }
  } else if (templateId) {
    const t = GOLDEN_PATH_TEMPLATES.find((x) => x.id === templateId);
    if (!t) {
      fail(
        `unknown template "${templateId}". Available: ${GOLDEN_PATH_TEMPLATES.map((x) => x.id).join(', ')}`,
      );
    }
    jobs = [{ id: t.id, flow: t.flow }];
  } else {
    fail('specify --template <id>, --flow <file>, or --all (see --list)');
  }

  const results: GenerationResult[] = [];
  for (const job of jobs) {
    for (const language of languages) {
      process.stderr.write(`generating ${job.id} / ${language}...\n`);
      results.push(generateOne(job.id, job.flow, language));
    }
  }

  const failed = results.filter((r) => !r.ok);
  const doc = {
    schema: 1,
    ok: failed.length === 0,
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      templates: jobs.length,
      languages: languages.length,
      errors: results.reduce((n, r) => n + r.diagnostics.filter((d) => d.level === 'error').length, 0),
      warnings: results.reduce((n, r) => n + r.diagnostics.filter((d) => d.level === 'warning').length, 0),
    },
    results,
  };

  const out = opt('out');
  const json = JSON.stringify(doc, null, 2);
  if (out) writeFileSync(out, json);
  process.stdout.write(json + '\n');

  process.stderr.write(
    `\n${doc.summary.passed}/${doc.summary.total} generations clean ` +
      `(${doc.summary.errors} errors, ${doc.summary.warnings} warnings)\n`,
  );
  process.exit(failed.length ? 1 : 0);
}

main();
