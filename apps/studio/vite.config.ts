import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Inline type errors during `vite dev` ONLY (command === 'serve'). The checker is
    // deliberately absent from `vite build`: its tsc worker fails to exit and hangs
    // CI/Vercel after "✓ built". Build-time type safety comes from the explicit
    // `tsc --noEmit` in the package's "build" script instead.
    ...(command === 'serve'
      ? [checker({ typescript: { tsconfigPath: './tsconfig.json' } })]
      : []),
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
}));
