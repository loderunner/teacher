import { chainMock, chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDraftJourney } from './create';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

vi.mock('@/lib/server/db', () => ({ db: chainMock() }));

const mockDb = chainMocked(db);

describe('createDraftJourney', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('inserts a drafting journey with an empty syllabus and memory', async () => {
    mockDb.insert.values.returning.mockResolvedValueOnce([
      { id: 'draft-id', title: 'Learn Rust' },
    ]);

    const result = await createDraftJourney({
      userId: 'user-1',
      title: 'Learn Rust',
      styleId: 'teacher',
    });

    expect(result).toEqual({ id: 'draft-id', title: 'Learn Rust' });
    expect(mockDb.insert).toHaveBeenCalledExactlyOnceWith(journeys);
    expect(mockDb.insert.values).toHaveBeenCalledExactlyOnceWith({
      userId: 'user-1',
      title: 'Learn Rust',
      styleId: 'teacher',
      status: 'drafting',
      syllabus: { chapters: [] },
      memory: [],
    });
    expect(mockDb.insert.values.returning).toHaveBeenCalledExactlyOnceWith({
      id: journeys.id,
      title: journeys.title,
    });
  });

  it('throws when no row is returned', async () => {
    mockDb.insert.values.returning.mockResolvedValueOnce([]);

    await expect(
      createDraftJourney({
        userId: 'user-1',
        title: 'Learn Rust',
        styleId: 'teacher',
      }),
    ).rejects.toThrow('Failed to create draft journey');
  });
});
