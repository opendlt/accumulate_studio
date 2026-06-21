import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// `vite-plugin-checker` is loaded ONLY for `vite dev` (command === 'serve'), via a
// dynamic import. We must NOT import it for `vite build`: its worker initialization
// keeps the Node process alive after "✓ built", hanging CI/Vercel forever. Build-time
// type safety comes from the explicit `tsc --noEmit` in the package's "build" script.
export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()];
  if (command === 'serve') {
    const checker = (await import('vite-plugin-checker')).default;
    plugins.push(checker({ typescript: { tsconfigPath: './tsconfig.json' } }));
  }
  return {
    plugins,
    resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@accumulate-studio/types': path.resolve(__dirname, '../../packages/types/src'),
      '@accumulate-studio/codegen': path.resolve(__dirname, '../../packages/codegen/src'),
      '@accumulate-studio/verification': path.resolve(__dirname, '../../packages/verification/src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  };
});
