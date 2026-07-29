#!/usr/bin/env node
/**
 * build-headless.mjs — bundle the headless Studio runner for Node.
 *
 * `packages/codegen` is bundler-only in two independent ways:
 *   1. tsconfig.base.json sets `moduleResolution: bundler`, so the emitted ESM
 *      has extensionless specifiers Node's resolver rejects.
 *   2. `template-loader.ts` imports `.hbs` files with Vite's `?raw` suffix,
 *      which only a bundler understands.
 *
 * Studio is fine (Vite handles both), but it means no Node script can consume
 * the generator. Rather than change the module strategy for the whole monorepo,
 * this bundles the headless entry with esbuild — the same approach
 * apps/mcp-server already uses — plus a small plugin to resolve `?raw` as text.
 *
 * Usage: node scripts/build-headless.mjs   (wired into npm run build:headless)
 */

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

/** Resolve Vite's `X.hbs?raw` imports and load the file as a string. */
const rawLoader = {
  name: 'vite-raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolvePath(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'raw-text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, (args) => ({
      contents: readFileSync(args.path, 'utf-8'),
      loader: 'text',
    }));
  },
};

await build({
  entryPoints: [join(REPO, 'scripts', 'studio-headless.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: join(REPO, 'tools', 'studio-headless', 'dist', 'studio-headless.mjs'),
  plugins: [rawLoader],
  loader: { '.hbs': 'text', '.json': 'json' },
  logLevel: 'warning',
  // Node builtins stay external; everything else is inlined so the tool runs
  // from a clean checkout without a workspace install.
  external: ['node:*', 'fs', 'path', 'url', 'os', 'crypto', 'child_process'],
});

console.log('Built tools/studio-headless/dist/studio-headless.mjs');
