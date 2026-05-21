import { Pool } from '@neondatabase/serverless';
import {
  type NeonHttpQueryResultHKT,
  drizzle as drizzleNeonHTTP,
} from 'drizzle-orm/neon-http';
import {
  type NeonQueryResultHKT,
  drizzle as drizzleNeonServerless,
} from 'drizzle-orm/neon-serverless';
import {
  type NodePgQueryResultHKT,
  drizzle as drizzlePg,
} from 'drizzle-orm/node-postgres';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core';

const databaseURL = process.env.DATABASE_URL!;

const development =
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

/**
 * Common Drizzle database type shared across all drivers used by this app.
 * Using a union of the HKT types (rather than a union of the full database
 * types) avoids the inference bug described in drizzle-orm#3196.
 */
export type DB = PgAsyncDatabase<
  NodePgQueryResultHKT | NeonHttpQueryResultHKT | NeonQueryResultHKT
>;

/** HTTP-based Drizzle client for standard queries. */
export const db: DB = development
  ? drizzlePg(databaseURL)
  : drizzleNeonHTTP(databaseURL);

/**
 * WebSocket-capable Drizzle client for transactional queries.
 * In development this is the same `node-postgres` instance as `db`.
 * In production it uses the Neon serverless WebSocket driver, which is the
 * only Neon driver that supports interactive transactions.
 */
export const dbTx: DB = development
  ? db
  : drizzleNeonServerless({
      client: new Pool({ connectionString: databaseURL }),
    });
