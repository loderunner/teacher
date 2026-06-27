import { chainMock, chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessages } from './get';

import { db } from '@/lib/db';

vi.mock('@/lib/db', () => ({ db: chainMock() }));

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

    expect(result).toEqual([
      { id: 'a', role: 'user', parts: [{ type: 'text', text: 'First' }] },
      { id: 'b', role: 'assistant', parts: [{ type: 'text', text: 'Second' }] },
    ]);
  });

  it('includes metadata when non-null', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      {
        id: 'a',
        role: 'user',
        parts: [{ type: 'text', text: 'Begin.' }],
        metadata: { hidden: true },
      },
    ]);

    const result = await getMessages({ journeyId: 'j1', chapterId: null });

    expect(result).toEqual([
      {
        id: 'a',
        role: 'user',
        parts: [{ type: 'text', text: 'Begin.' }],
        metadata: { hidden: true },
      },
    ]);
  });

  it('omits metadata key when null', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      { id: 'a', role: 'user', parts: [], metadata: null },
    ]);

    const result = await getMessages({ journeyId: 'j1', chapterId: null });

    expect(result[0]).not.toHaveProperty('metadata');
  });

  it('filters out unsupported roles', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      { id: 'a', role: 'tool', parts: [], metadata: null },
    ]);

    await expect(
      getMessages({ journeyId: 'j1', chapterId: null }),
    ).resolves.toEqual([]);
  });
});
