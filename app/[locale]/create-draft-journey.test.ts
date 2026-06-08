import { auth } from '@clerk/nextjs/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDraftJourneyAction } from './create-draft-journey';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@/lib/server/journeys/create', () => ({
  createDraftJourney: vi.fn(),
}));
vi.mock('@/lib/server/messages', () => ({ saveMessages: vi.fn() }));
vi.mock('@/lib/server/users/ensure', () => ({ ensureUser: vi.fn() }));

import { createDraftJourney } from '@/lib/server/journeys/create';
import { saveMessages } from '@/lib/server/messages';
import { ensureUser } from '@/lib/server/users/ensure';

const mockAuth = vi.mocked(auth);
const mockCreateDraftJourney = vi.mocked(createDraftJourney);
const mockEnsureUser = vi.mocked(ensureUser);
const mockSaveMessages = vi.mocked(saveMessages);

describe('createDraftJourneyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' } as never);
    mockEnsureUser.mockResolvedValue(undefined);
    mockCreateDraftJourney.mockResolvedValue({
      id: 'jid10chars',
      title: 'Learn Rust',
    });
    mockSaveMessages.mockResolvedValue(undefined);
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    await expect(
      createDraftJourneyAction({ text: 'Hi', styleId: 'teacher' }),
    ).rejects.toThrow('Unauthorized');
  });

  it('creates the draft journey and persists the first user message', async () => {
    const result = await createDraftJourneyAction({
      text: 'Learn Rust',
      styleId: 'teacher',
    });

    expect(mockCreateDraftJourney).toHaveBeenCalledExactlyOnceWith({
      userId: 'user-1',
      title: 'Learn Rust',
      styleId: 'teacher',
    });

    expect(mockSaveMessages).toHaveBeenCalledOnce();
    const args = mockSaveMessages.mock.calls[0][0];
    expect(args.journeyId).toBe('jid10chars');
    expect(args.chapterId).toBeNull();
    expect(args.messages).toHaveLength(1);
    expect(args.messages[0].role).toBe('user');
    expect(args.messages[0].parts).toEqual([
      { type: 'text', text: 'Learn Rust' },
    ]);

    expect(result.path).toBe('/journeys/learn-rust-jid10chars');
    expect(result.id).toBe('jid10chars');
  });
});
