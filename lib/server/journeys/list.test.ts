import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listJourneys } from './list';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

describe('listJourneys', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('returns summaries ordered by updatedAt for the given user', async () => {
    const now = new Date('2025-01-02T00:00:00Z');
    const earlier = new Date('2025-01-01T00:00:00Z');

    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      {
        id: 'j1',
        title: 'Rust basics',
        currentChapterIndex: 2,
        updatedAt: now,
      },
      {
        id: 'j2',
        title: 'TypeScript',
        currentChapterIndex: 0,
        updatedAt: earlier,
      },
    ]);

    const result = await listJourneys({ userId: 'user-1' });

    expect(result).toEqual([
      {
        id: 'j1',
        title: 'Rust basics',
        currentChapterIndex: 2,
        updatedAt: now,
      },
      {
        id: 'j2',
        title: 'TypeScript',
        currentChapterIndex: 0,
        updatedAt: earlier,
      },
    ]);
  });

  it('returns an empty array when the user has no journeys', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([]);

    const result = await listJourneys({ userId: 'user-1' });

    expect(result).toEqual([]);
  });
});
