import { build } from 'file:///C:/Accumulate_Stuff/on-boarding-platform/accumulate-studio/node_modules/esbuild/lib/main.js';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
const rawLoader = {
  name: 'vite-raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: resolvePath(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw-text' }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, (a) => ({ contents: readFileSync(a.path, 'utf-8'), loader: 'text' }));
  },
};
await build({
  entryPoints: ['C:/tmp/htlc-p7/entry-p7.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node18',
  outfile: 'C:/tmp/htlc-p7/export-p7.bundle.mjs', plugins: [rawLoader], loader: { '.hbs': 'text', '.json': 'json' },
  nodePaths: ['C:/Accumulate_Stuff/on-boarding-platform/accumulate-studio/node_modules'], logLevel: 'warning',
});
console.log('built');
