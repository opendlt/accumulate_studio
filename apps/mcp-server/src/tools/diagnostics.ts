/**
 * acc.diagnose — compiler diagnostics over MCP.
 *
 * The LSP pillar exists so an agent can read type errors and symbol locations
 * without scraping human-formatted output. A real language server is the ideal
 * transport, but the servers are not installed uniformly (a given machine may
 * have rust-analyzer and Dart's but not pyright, OmniSharp or tsserver), and an
 * agent cannot rely on a capability that is absent for three of five languages.
 *
 * So this fronts whatever authoritative checker each toolchain already ships and
 * normalises it to one LSP-shaped schema. The semantics come from the same
 * compiler a language server would front — only the transport differs.
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));

export type DiagnoseArgs = {
  language: 'python' | 'rust' | 'dart' | 'csharp' | 'javascript';
  path: string;
};

/**
 * Locate the CLI by walking up to the repo root.
 *
 * A fixed number of `..` hops cannot work for both layouts: this module lives at
 * `src/tools/` in source and is bundled into `dist/`, so the depth differs and
 * one of the two silently resolves outside the repo.
 */
function diagnosticsScript(): string {
  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'tools', 'agent-lsp', 'diagnostics.mjs');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('agent-lsp diagnostics.mjs not found relative to the MCP server');
}

export async function diagnose(args: DiagnoseArgs): Promise<unknown> {
  const { language, path } = args;
  if (!language || !path) {
    return { ok: false, error: 'both "language" and "path" are required' };
  }

  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [diagnosticsScript(), '--lang', language, '--path', path],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        // Exit code 1 means "diagnostics present", which is a successful run —
        // only a usage/toolchain failure (2) is an error worth surfacing as one.
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({
            ok: false,
            language,
            path,
            error: err ? err.message : 'diagnostics produced no parsable output',
          });
        }
      },
    );
  });
}

export const diagnoseTool = {
  name: 'acc.diagnose',
  description:
    'Run the language toolchain over a project and return compiler diagnostics as structured JSON (file, line, column, severity, code, message). Use this to check whether generated or edited code actually compiles, instead of parsing raw compiler output. Covers python, rust, dart, csharp and javascript.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      language: {
        type: 'string',
        enum: ['python', 'rust', 'dart', 'csharp', 'javascript'],
        description: 'Which toolchain to run.',
      },
      path: {
        type: 'string',
        description: 'Absolute path to the project root to check.',
      },
    },
    required: ['language', 'path'] as string[],
  },
  handler: diagnose,
};

/** Locate the navigate CLI the same way as the diagnostics one. */
function navigateScript(): string {
  let dir = HERE;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'tools', 'agent-lsp', 'navigate.mjs');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('agent-lsp navigate.mjs not found relative to the MCP server');
}

export type NavigateArgs = {
  action: 'definition' | 'references' | 'symbol';
  language: 'python' | 'rust' | 'dart' | 'csharp' | 'javascript';
  path: string;
  file?: string;
  line?: number;
  column?: number;
  query?: string;
};

export async function navigate(args: NavigateArgs): Promise<unknown> {
  const { action, language, path, file, line, column, query } = args;
  if (!action || !language || !path) {
    return { ok: false, error: '"action", "language" and "path" are required' };
  }

  const argv = [navigateScript(), action, '--lang', language, '--path', path];
  if (action === 'symbol') {
    if (!query) return { ok: false, error: '"query" is required for action "symbol"' };
    argv.push('--query', query);
  } else {
    if (!file || !line || !column) {
      return { ok: false, error: '"file", "line" and "column" are required for definition/references' };
    }
    argv.push('--file', file, '--line', String(line), '--col', String(column));
  }

  return new Promise((resolve) => {
    execFile(process.execPath, argv, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      // Exit 1 means "no results", which is an answer, not a failure.
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ ok: false, action, language, error: err ? err.message : 'no parsable output' });
      }
    });
  });
}

export const navigateTool = {
  name: 'acc.navigate',
  description:
    'Resolve code navigation questions with a real language server: jump to a definition, find every reference to a symbol, or search the workspace for a symbol by name. Returns file/line/column locations as JSON. Use this instead of grepping when you need to know where something is defined or used.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['definition', 'references', 'symbol'],
        description:
          '"definition" and "references" take a position; "symbol" searches the workspace by name.',
      },
      language: {
        type: 'string',
        enum: ['python', 'rust', 'dart', 'csharp', 'javascript'],
        description: 'Which language server to drive.',
      },
      path: { type: 'string', description: 'Absolute path to the project root.' },
      file: { type: 'string', description: 'Absolute path to the file (definition/references).' },
      line: { type: 'number', description: '1-based line number (definition/references).' },
      column: { type: 'number', description: '1-based column number (definition/references).' },
      query: { type: 'string', description: 'Symbol name to search for (symbol).' },
    },
    required: ['action', 'language', 'path'] as string[],
  },
  handler: navigate,
};

export const diagnosticsTools = [diagnoseTool, navigateTool];
