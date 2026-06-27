import { defineConfig } from 'drizzle-kit';

import { loadEnv } from './env';

loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
