import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Typecheck in-process (tsc --noEmit). composite:true does NOT emit here, so
    // no stray .js/.d.ts land in src; the build fails on a type error.
    checker({ typescript: { tsconfigPath: './tsconfig.json' } }),
  ],
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
});
