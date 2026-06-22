import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listJourneys } from './list';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

const updatedAt = new Date('2026-01-01T00:00:00Z');

const fixture = (id: string, title: string) => ({
  id,
  title,
  styleId: 'teacher',
  status: 'active' as const,
  chapterCount: 3,
  updatedAt,
});

describe('listJourneys', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('returns summaries for the given user', async () => {
    mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([
      fixture('j1', 'Rust basics'),
      fixture('j2', 'TypeScript'),
    ]);

    const result = await listJourneys({ userId: 'user-1', limit: 10 });

    expect(result).toEqual([
      fixture('j1', 'Rust basics'),
      fixture('j2', 'TypeScript'),
    ]);
  });

  it('returns an empty array when the user has no journeys', async () => {
    mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([]);

    const result = await listJourneys({ userId: 'user-1', limit: 10 });

    expect(result).toEqual([]);
  });

  it('applies the pagination cursor when provided', async () => {
    mockDb.select.from.where.orderBy.limit.mockResolvedValueOnce([
      fixture('j2', 'TypeScript'),
    ]);

    const result = await listJourneys({
      userId: 'user-1',
      limit: 10,
      updatedAt: new Date('2026-06-01T00:00:00Z'),
      id: 'abc1234567',
    });

    expect(result).toEqual([fixture('j2', 'TypeScript')]);
  });
});
