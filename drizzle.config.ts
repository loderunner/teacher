import { defineConfig } from 'drizzle-kit';

import { loadEnv } from './env';

loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/server/db/schema.ts',
  out: './lib/server/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
