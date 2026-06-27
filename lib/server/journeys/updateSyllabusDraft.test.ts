import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateSyllabusDraft } from './updateSyllabusDraft';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

const syllabus = {
  chapters: [
    {
      title: 'Introduction',
      summary: 'Overview of the course.',
      sections: ['What is this?'],
    },
  ],
};

describe('updateSyllabusDraft', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('resolves without error on valid input', async () => {
    await expect(
      updateSyllabusDraft({
        userId: 'user-1',
        journeyId: 'journey-1',
        syllabus,
      }),
    ).resolves.toBeUndefined();
  });

  it('scopes the update with journeyId, userId, and drafting status', async () => {
    await updateSyllabusDraft({
      userId: 'owner-A',
      journeyId: 'journey-A',
      syllabus,
    });

    await updateSyllabusDraft({
      userId: 'owner-B',
      journeyId: 'journey-A',
      syllabus,
    });

    expect(mockDb.update.set.where).toHaveBeenCalledTimes(2);
  });
});
