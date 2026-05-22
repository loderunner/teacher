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

  it('returns summaries for the given user', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([
      { id: 'j1', title: 'Rust basics' },
      { id: 'j2', title: 'TypeScript' },
    ]);

    const result = await listJourneys({ userId: 'user-1' });

    expect(result).toEqual([
      { id: 'j1', title: 'Rust basics' },
      { id: 'j2', title: 'TypeScript' },
    ]);
  });

  it('returns an empty array when the user has no journeys', async () => {
    mockDb.select.from.where.orderBy.mockResolvedValueOnce([]);

    const result = await listJourneys({ userId: 'user-1' });

    expect(result).toEqual([]);
  });
});
