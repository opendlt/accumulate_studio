import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

export default defineConfig({
  test: {
    globals: false,
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
