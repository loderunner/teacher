import path from 'path';

import { configDefaults, defineConfig } from 'vitest/config';

import { loadEnv } from './env';

loadEnv();

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, '**/.agents/**', '**/.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
