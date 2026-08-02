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

export const diagnosticsTools = [diagnoseTool];
