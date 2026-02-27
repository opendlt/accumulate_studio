import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@accumulate-studio/types': path.resolve(__dirname, '../../packages/types/src'),
      '@accumulate-studio/codegen': path.resolve(__dirname, '../../packages/codegen/src'),
    },
  },
  test: {
    globals: false,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
