import { chainMock, chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveMessages } from './save';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

describe('saveMessages', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('inserts rows with onConflictDoUpdate for idempotent upserts', async () => {
    const insertChain = chainMock();
    insertChain.values.mockImplementation(() => insertChain);
    insertChain.onConflictDoUpdate.mockResolvedValueOnce(undefined);
    mockDb.insert.mockReturnValueOnce(insertChain as never);

    await saveMessages({
      journeyId: 'j1',
      chapterId: null,
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hi' }],
        },
      ],
    });

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(insertChain.values).toHaveBeenCalledOnce();
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalledOnce();
  });
});
