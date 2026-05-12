import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/server/db/schema.ts',
  out: './lib/server/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
