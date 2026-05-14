import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureUser } from './ensure';

import { db } from '@/lib/server/db';
import { users } from '@/lib/server/db/schema';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
vi.mock('react', () => ({ cache: (fn: Function) => fn }));
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
