import { auth } from '@clerk/nextjs/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDraftJourneyAction } from './create-draft-journey';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/server/journeys/create', () => ({
  createDraftJourney: vi.fn(),
}));

vi.mock('@/lib/server/users/ensure', () => ({
  ensureUser: vi.fn(),
}));

import { createDraftJourney } from '@/lib/server/journeys/create';
import { ensureUser } from '@/lib/server/users/ensure';

const mockAuth = vi.mocked(auth);
const mockCreateDraftJourney = vi.mocked(createDraftJourney);
const mockEnsureUser = vi.mocked(ensureUser);

describe('createDraftJourneyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' } as never);
    mockEnsureUser.mockResolvedValue(undefined);
    mockCreateDraftJourney.mockResolvedValue({
      id: 'jid10chars',
      title: 'Learn Rust',
    });
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    await expect(
      createDraftJourneyAction({ text: 'Hi', styleId: 'teacher' }),
    ).rejects.toThrow('Unauthorized');
  });

  it('creates a draft journey and returns the journey path', async () => {
    const result = await createDraftJourneyAction({
      text: 'Learn Rust',
      styleId: 'teacher',
    });

    expect(mockCreateDraftJourney).toHaveBeenCalledExactlyOnceWith({
      userId: 'user-1',
      title: 'Learn Rust',
      styleId: 'teacher',
    });
    expect(result.path).toBe('/journeys/learn-rust-jid10chars');
    expect(result.id).toBe('jid10chars');
  });
});
