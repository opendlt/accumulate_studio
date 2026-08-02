#!/usr/bin/env node
/**
 * agent-lsp navigate — jump-to-definition, find-references and symbol search.
 *
 * Diagnostics come from a compiler, but navigation needs a server that has
 * indexed the project. This drives the real language server for each toolchain
 * and returns one JSON shape regardless of which one answered.
 *
 *   navigate.mjs definition --lang rust --path <root> --file <f> --line N --col C
 *   navigate.mjs references --lang dart --path <root> --file <f> --line N --col C
 *   navigate.mjs symbol     --lang python --path <root> --query SmartSigner
 *
 * Exit codes: 0 results found · 1 none found · 2 usage/server error.
 */
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LspClient, toLspPosition, normaliseLocations } from './lsp-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

/**
 * How to start each language's server.
 *
 * `available: false` is reported honestly rather than silently degrading — an
 * agent needs to know a capability is missing, not receive an empty answer that
 * looks like "no references".
 */
function serverFor(lang, root) {
  switch (lang) {
    case 'rust':
      return { command: 'rust-analyzer', args: [], languageId: 'rust' };
    case 'dart':
      return { command: 'dart', args: ['language-server', '--protocol=lsp'], languageId: 'dart' };
    case 'python': {
      const ls = [join(root, 'node_modules', 'pyright', 'langserver.index.js'),
                  join(REPO, 'node_modules', 'pyright', 'langserver.index.js')]
        .find((p) => existsSync(p));
      return ls
        ? { command: process.execPath, args: [ls, '--stdio'], languageId: 'python' }
        : { unavailable: 'pyright is not installed (npm i pyright)' };
    }
    case 'javascript':
    case 'typescript': {
      const ls = [join(root, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
                  join(REPO, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs')]
        .find((p) => existsSync(p));
      return ls
        ? { command: process.execPath, args: [ls, '--stdio'], languageId: 'typescript' }
        : { unavailable: 'typescript-language-server is not installed (npm i typescript-language-server)' };
    }
    case 'csharp':
      return { unavailable: 'no C# language server installed (try `dotnet tool install -g csharp-ls`)' };
    default:
      return { unavailable: `unknown language ${lang}` };
  }
}

/**
 * Ask repeatedly until the server has something to say.
 *
 * Language servers index asynchronously. A query issued before indexing settles
 * returns an EMPTY result, which is indistinguishable from "this symbol has no
 * references" — the wrong answer delivered confidently. rust-analyzer answered
 * workspace/symbol in 261ms with nothing, seconds before it had the answer. A
 * fixed sleep is a guess about project size; retrying until non-empty (or the
 * deadline) adapts to it.
 */
async function askUntilReady(fn, { timeoutMs = 90000, intervalMs = 1500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await fn();
    if (Array.isArray(last) ? last.length > 0 : last) return last;
    if (Date.now() >= deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function usage(msg) {
  console.error(msg);
  console.error('usage: navigate.mjs <definition|references|symbol> --lang <l> --path <root> ' +
    '[--file <f> --line N --col C] [--query <name>]');
  process.exit(2);
}

async function main() {
  const argv = process.argv.slice(2);
  const verb = argv[0];
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

  if (!['definition', 'references', 'symbol'].includes(verb)) usage(`unknown verb: ${verb}`);
  const lang = opt('lang');
  const root = resolve(opt('path') ?? process.cwd());
  if (!lang) usage('--lang is required');
  if (!existsSync(root)) usage(`path not found: ${root}`);

  const spec = serverFor(lang, root);
  if (spec.unavailable) {
    console.log(JSON.stringify({ ok: false, available: false, lang, verb, reason: spec.unavailable }, null, 2));
    process.exit(2);
  }

  const started = Date.now();
  const client = new LspClient({ command: spec.command, args: spec.args, rootPath: root });
  let payload;
  try {
    await client.initialize();

    if (verb === 'symbol') {
      const query = opt('query');
      if (!query) usage('--query is required for symbol');
      const res = await askUntilReady(
        async () => {
          const r = await client.request('workspace/symbol', { query });
          return Array.isArray(r) ? r : [];
        },
        { timeoutMs: Number(opt('timeout-ms') ?? 90000) },
      );
      const symbols = (Array.isArray(res) ? res : []).map((s) => ({
        name: s.name,
        kind: s.kind,
        container: s.containerName ?? null,
        ...normaliseLocations(s.location ?? s)[0],
      }));
      payload = { ok: symbols.length > 0, lang, verb, query, count: symbols.length, symbols };
    } else {
      const file = opt('file');
      const line = Number(opt('line'));
      const col = Number(opt('col'));
      if (!file || !line || !col) usage('--file, --line and --col are required');
      const filePath = resolve(file);
      if (!existsSync(filePath)) usage(`file not found: ${filePath}`);

      const uri = client.openDocument(filePath, spec.languageId);

      const method = verb === 'definition' ? 'textDocument/definition' : 'textDocument/references';
      const params = {
        textDocument: { uri },
        position: toLspPosition(line, col),
        ...(verb === 'references' ? { context: { includeDeclaration: true } } : {}),
      };
      const locations = await askUntilReady(
        async () => normaliseLocations(await client.request(method, params)),
        { timeoutMs: Number(opt('timeout-ms') ?? 90000) },
      );
      payload = { ok: locations.length > 0, lang, verb, file: filePath, line, column: col,
                  count: locations.length, locations };
    }
  } catch (e) {
    payload = { ok: false, lang, verb, error: e.message };
  } finally {
    await client.shutdown();
  }

  payload.server = `${spec.command} ${spec.args.join(' ')}`.trim();
  payload.durationMs = Date.now() - started;
  console.log(JSON.stringify(payload, null, 2));
  process.exit(payload.ok ? 0 : 1);
}

main();
