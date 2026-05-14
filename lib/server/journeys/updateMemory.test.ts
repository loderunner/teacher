import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateJourneyMemory } from './updateMemory';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

describe('updateJourneyMemory', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('calls db.update with the correct chain and resolves without error', async () => {
    await expect(
      updateJourneyMemory({
        userId: 'user-1',
        journeyId: 'journey-1',
        memory: 'Learner is a beginner at Python.',
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts all three required params and completes without throwing', async () => {
    await expect(
      updateJourneyMemory({
        userId: 'u-abc',
        journeyId: 'j-xyz',
        memory: 'Some memory content.',
      }),
    ).resolves.not.toThrow();
  });

  it('passes the memory value to db.update.set', async () => {
    await updateJourneyMemory({
      userId: 'user-2',
      journeyId: 'journey-2',
      memory: 'Advanced learner.',
    });

    expect(mockDb.update.set).toHaveBeenCalledWith({
      memory: 'Advanced learner.',
    });
  });

  it('scopes the update with both journeyId and userId in the where clause', async () => {
    await updateJourneyMemory({
      userId: 'owner-A',
      journeyId: 'journey-A',
      memory: 'Memory A.',
    });

    await updateJourneyMemory({
      userId: 'owner-B',
      journeyId: 'journey-A',
      memory: 'Memory B.',
    });

    expect(mockDb.update.set.where).toHaveBeenCalledTimes(2);
  });
});
