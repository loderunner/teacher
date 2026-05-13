import path from 'path';

import nextEnv from '@next/env';
import { configDefaults, defineConfig } from 'vitest/config';

nextEnv.loadEnvConfig(process.cwd());

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
