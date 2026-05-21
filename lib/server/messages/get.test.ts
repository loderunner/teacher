import { chainMock, chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from './get';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db', () => ({ db: chainMock() }));

const mockDb = chainMocked(db);

describe('getMessages', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('returns rows ordered by createdAt for syllabus scope', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'First' }] },
      {
        id: 'b',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Second' }],
      },
    ]);

    const result = await getMessages({ journeyId: 'j1', chapterId: null });

    expect(result).toEqual([
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'First' }] },
      {
        id: 'b',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Second' }],
      },
    ]);
  });

  it('throws when an unsupported role is stored', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      { id: 'a', role: 'tool', parts: [] },
    ]);

    await expect(
      getMessages({ journeyId: 'j1', chapterId: null }),
    ).rejects.toThrow('Unsupported message role in storage: tool');
  });
});
