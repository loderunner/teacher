import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';

/** HTTP-based Drizzle client for standard queries. */
export const db = drizzle(process.env.DATABASE_URL!);

// WS-based client for transactions (neon-http doesn't support multi-statement transactions)
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

/** WebSocket-based Drizzle client for multi-statement transactions. */
export const dbTx = drizzleWs({ client: pool });
