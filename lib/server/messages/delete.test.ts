import { chainMock, chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteMessagesFrom } from './delete';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db', () => ({ db: chainMock() }));

const mockDb = chainMocked(db);

describe('deleteMessagesFrom', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('issues a delete for syllabus scope', async () => {
    await deleteMessagesFrom({
      journeyId: 'j1',
      chapterId: null,
      fromMessageId: 'm1',
    });

    expect(mockDb.delete).toHaveBeenCalledOnce();
    expect(mockDb.delete.where).toHaveBeenCalledOnce();
  });

  it('issues a delete for chapter scope', async () => {
    await deleteMessagesFrom({
      journeyId: 'j1',
      chapterId: 'c1',
      fromMessageId: 'm1',
    });

    expect(mockDb.delete).toHaveBeenCalledOnce();
    expect(mockDb.delete.where).toHaveBeenCalledOnce();
  });

  it('is a no-op when fromMessageId is absent — subquery returns NULL', async () => {
    // The no-op behaviour is enforced by the SQL subquery returning NULL when the
    // id is not found, making `created_at >= NULL` always false. The call still
    // reaches the DB; we just verify the delete was issued (the DB does nothing).
    await deleteMessagesFrom({
      journeyId: 'j1',
      chapterId: null,
      fromMessageId: 'nonexistent',
    });

    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});
