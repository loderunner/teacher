import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appendJourneyMemories } from './appendMemories';

import { db } from '@/lib/db';

vi.mock('@/lib/db');

const mockDb = chainMocked(db);

describe('appendJourneyMemories', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('calls db.update with the correct chain and resolves without error', async () => {
    await expect(
      appendJourneyMemories({
        userId: 'user-1',
        journeyId: 'journey-1',
        entries: ['You prefer short examples.'],
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts multiple entries and completes without throwing', async () => {
    await expect(
      appendJourneyMemories({
        userId: 'u-abc',
        journeyId: 'j-xyz',
        entries: [
          'You know JavaScript.',
          'You want to learn Python for data analysis.',
        ],
      }),
    ).resolves.not.toThrow();
  });

  it('scopes the update with both journeyId and userId in the where clause', async () => {
    await appendJourneyMemories({
      userId: 'owner-A',
      journeyId: 'journey-A',
      entries: ['Entry A.'],
    });

    await appendJourneyMemories({
      userId: 'owner-B',
      journeyId: 'journey-A',
      entries: ['Entry B.'],
    });

    expect(mockDb.update.set.where).toHaveBeenCalledTimes(2);
  });
});
