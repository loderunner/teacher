import path from 'path';

import nextEnv from '@next/env';
import { defineConfig } from 'vitest/config';

nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
