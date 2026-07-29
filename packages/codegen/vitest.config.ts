import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

export default defineConfig({
  test: {
    globals: false,

    // The baseline/validation suites shell out to five real toolchains
    // (python, dart, cargo, dotnet, node) with blocking execSync. vitest runs
    // test FILES in parallel by default, so those subprocesses contend for CPU
    // and blow their per-command timeouts — producing failures that depend on
    // machine load rather than on the code. `python-baseline` took 14s alone
    // and 50s (failing) alongside the others.
    //
    // Run the files sequentially and allow generous timeouts: a suite that
    // compiles Rust and .NET is inherently slow, and a deterministic slow suite
    // beats a fast flaky one.
    fileParallelism: false,
    testTimeout: 180000,
    hookTimeout: 180000,
  },
  plugins: [
    {
      name: 'raw-loader',
      transform(_code: string, id: string) {
        if (id.endsWith('?raw')) {
          const filePath = id.replace(/\?raw$/, '');
          const content = readFileSync(filePath, 'utf-8');
          return {
            code: `export default ${JSON.stringify(content)};`,
            map: null,
          };
        }
      },
    },
  ],
});
