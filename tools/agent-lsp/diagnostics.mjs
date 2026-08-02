#!/usr/bin/env node
/**
 * agent-lsp diagnostics — uniform, machine-readable compiler feedback.
 *
 * The LSP pillar exists so an agent can read type errors and symbol locations
 * without scraping human-formatted output. A real language server is the ideal
 * transport, but only some are installed on any given machine (this one has
 * rust-analyzer and dart's, not pyright/OmniSharp/tsserver), and an agent cannot
 * use a tool that is absent for three of five languages.
 *
 * So this normalises whatever authoritative checker each toolchain ships into
 * one LSP-shaped schema. The semantics come from the same compiler the language
 * server would front, so the diagnostics are identical in substance — only the
 * transport differs.
 *
 * Output (stdout, one JSON object):
 *   { ok, lang, root, diagnostics: [ { file, line, column, severity, code, message } ],
 *     counts: { error, warning }, tool, durationMs }
 *
 * Exit codes: 0 clean · 1 diagnostics present · 2 usage/toolchain error.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LANGS = ['rust', 'python', 'dart', 'javascript', 'csharp'];

function run(cmd, args, cwd) {
  // Windows needs a shell to resolve .cmd/.bat shims (cargo, dart, dotnet), but
  // a shell MANGLES an absolute path argument — invoking node with a full path
  // to tsc.js under shell:true produced empty output and every project looked
  // clean. Real executables are spawned directly.
  const needsShell = process.platform === 'win32' && cmd !== process.execPath;
  return new Promise((res) => {
    execFile(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024, shell: needsShell },
      (err, stdout, stderr) => {
        if (process.env.AGENT_LSP_DEBUG) {
          console.error(`[agent-lsp] ${cmd} ${args.join(' ')} (cwd=${cwd}, shell=${needsShell})`);
          console.error(`[agent-lsp] exit=${err ? err.code : 0}`);
          console.error(`[agent-lsp] stdout: ${JSON.stringify((stdout ?? '').slice(0, 400))}`);
          console.error(`[agent-lsp] stderr: ${JSON.stringify((stderr ?? '').slice(0, 400))}`);
        }
        res({ err, stdout: stdout ?? '', stderr: stderr ?? '' });
      });
  });
}

/** Locate typescript's CLI without relying on shell shims. */
function findTsc(root) {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(root, 'node_modules', 'typescript', 'lib', 'tsc.js'),
    join(here, '..', '..', 'node_modules', 'typescript', 'lib', 'tsc.js'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}


/** cargo emits newline-delimited JSON diagnostics — the same ones rust-analyzer surfaces. */
import { splitLines, parseCargo, parseDart, parseCompilerText, parsePyCompile } from './parsers.mjs';

async function diagnose(lang, root) {
  switch (lang) {
    case 'rust': {
      const r = await run('cargo', ['check', '--message-format=json', '--quiet'], root);
      return { tool: 'cargo check', diagnostics: parseCargo(r.stdout) };
    }
    case 'dart': {
      const r = await run('dart', ['analyze', '--format=machine', root], root);
      return { tool: 'dart analyze', diagnostics: parseDart(`${r.stdout}\n${r.stderr}`) };
    }
    case 'javascript': {
      // Resolve tsc's entry point and run it through node. `npx tsc` shells out
      // to a platform shim that exits 1 with an empty error log on this
      // maintainer's Windows box, which made every project report clean.
      const tsc = findTsc(root);
      if (!tsc) {
        throw new Error('typescript not found — install it in the project or the monorepo root');
      }
      const r = await run(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], root);
      return { tool: 'tsc --noEmit', diagnostics: parseCompilerText(r.stdout, r.stderr) };
    }
    case 'csharp': {
      const r = await run('dotnet', ['build', '--nologo', '-v', 'q'], root);
      return { tool: 'dotnet build', diagnostics: parseCompilerText(r.stdout, r.stderr) };
    }
    case 'python': {
      const r = await run('python', ['-m', 'compileall', '-q', root], root);
      return { tool: 'python -m compileall', diagnostics: parsePyCompile(`${r.stdout}\n${r.stderr}`) };
    }
    default:
      throw new Error(`unknown language ${lang}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const lang = opt('lang');
  const root = resolve(opt('path') ?? process.cwd());

  if (!lang || !LANGS.includes(lang)) {
    console.error(`usage: diagnostics.mjs --lang <${LANGS.join('|')}> [--path <dir>]`);
    process.exit(2);
  }
  if (!existsSync(root)) {
    console.log(JSON.stringify({ ok: false, lang, root, error: `path not found: ${root}` }));
    process.exit(2);
  }

  const started = Date.now();
  let result;
  try {
    result = await diagnose(lang, root);
  } catch (e) {
    console.log(JSON.stringify({ ok: false, lang, root, error: e.message }));
    process.exit(2);
  }

  // Some toolchains report the same diagnostic on both stdout and stderr, or
  // once per target framework. Duplicates inflate the counts an agent uses to
  // decide whether it is making progress.
  const seen = new Set();
  const diagnostics = result.diagnostics.filter((d) => {
    const k = `${d.file}:${d.line}:${d.column}:${d.code}:${d.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const counts = { error: 0, warning: 0 };
  for (const d of diagnostics) if (counts[d.severity] !== undefined) counts[d.severity]++;

  console.log(JSON.stringify({
    ok: counts.error === 0,
    lang, root, tool: result.tool,
    counts, diagnostics,
    durationMs: Date.now() - started,
  }, null, 2));
  process.exit(counts.error === 0 ? 0 : 1);
}

main();
