import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/lib/server/db';
import { users } from '@/lib/server/db/schema';
import { ensureUser } from './ensure';

vi.mock('react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react')>();
  return { ...mod, cache: (fn: unknown) => fn };
});

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

describe('ensureUser', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('inserts the user row with onConflictDoNothing', async () => {
    await ensureUser('user-123');

    expect(mockDb.insert).toHaveBeenCalledWith(users);
    expect(mockDb.insert.values).toHaveBeenCalledWith({ id: 'user-123' });
    expect(mockDb.insert.values.onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it('returns void without error', async () => {
    const result = await ensureUser('user-456');

    expect(result).toBeUndefined();
  });
});
