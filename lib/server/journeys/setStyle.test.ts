import { chainMocked } from 'chain-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setJourneyStyle } from './setStyle';

import { db } from '@/lib/server/db';

vi.mock('@/lib/server/db');

const mockDb = chainMocked(db);

describe('setJourneyStyle', () => {
  beforeEach(() => {
    mockDb.mockReset();
  });

  it('calls db.update with the correct chain and resolves without error', async () => {
    await expect(
      setJourneyStyle({
        userId: 'user-1',
        id: 'journey-1',
        styleId: 'style-2',
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts all three required params and completes without throwing', async () => {
    await expect(
      setJourneyStyle({ userId: 'u-abc', id: 'j-xyz', styleId: 's-999' }),
    ).resolves.not.toThrow();
  });
});
