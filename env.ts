import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from 'node:process';

type LoadEnvParams = {
  /** Project root. Defaults to `process.cwd()`. */
  dir?: string;
};

/**
 * Load `.env*` files into `process.env` using Next.js file names and precedence,
 * including `.env.local` when `NODE_ENV` is `test`.
 */
export function loadEnv({ dir = process.cwd() }: LoadEnvParams = {}): void {
  const mode = process.env.NODE_ENV;

  const files = ['.env', `.env.${mode}`, '.env.local', `.env.${mode}.local`];

  for (const file of files) {
    const path = join(dir, file);
    if (existsSync(path)) {
      loadEnvFile(path);
    }
  }
}
