import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from './get';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

describe('getMessages', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('returns rows ordered by createdAt for syllabus scope', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      {
        id: 'a',
        role: 'user',
        parts: [{ type: 'text', text: 'First' }],
        metadata: null,
      },
      {
        id: 'b',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Second' }],
        metadata: null,
      },
    ]);

    const result = await getMessages({ journeyId: 'j1', chapterId: null });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });
});
