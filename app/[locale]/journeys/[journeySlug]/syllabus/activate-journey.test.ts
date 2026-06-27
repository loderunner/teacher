import { auth } from '@clerk/nextjs/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateJourneyAction } from './activate-journey';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(() => Promise.resolve('en')),
}));
vi.mock('@/lib/journeys/activate', () => ({ activateJourney: vi.fn() }));
vi.mock('@/lib/journeys/get', () => ({ getJourney: vi.fn() }));
vi.mock('@/lib/messages', () => ({ getMessages: vi.fn() }));
vi.mock('@/lib/users/ensure', () => ({ ensureUser: vi.fn() }));
vi.mock('@/lib/syllabus-draft', () => ({ bootstrapJourney: vi.fn() }));

import { activateJourney } from '@/lib/journeys/activate';
import { getJourney } from '@/lib/journeys/get';
import { getMessages } from '@/lib/messages';
import { bootstrapJourney } from '@/lib/syllabus-draft';
import { ensureUser } from '@/lib/users/ensure';

const mockAuth = vi.mocked(auth);
const mockGetJourney = vi.mocked(getJourney);
const mockGetMessages = vi.mocked(getMessages);
const mockBootstrap = vi.mocked(bootstrapJourney);
const mockActivate = vi.mocked(activateJourney);
const mockEnsureUser = vi.mocked(ensureUser);

const validSyllabus = {
  chapters: [{ title: 'One', summary: '', sections: ['Overview'] as string[] }],
};

describe('activateJourneyAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' } as never);
    mockEnsureUser.mockResolvedValue(undefined);
    mockGetJourney.mockResolvedValue({
      id: 'j1',
      title: 'Draft',
      styleId: 'teacher',
      memory: [],

      status: 'drafting',
      syllabus: { chapters: [] },
      chapters: [],
    });
    mockGetMessages.mockResolvedValue([]);
    mockBootstrap.mockResolvedValue({ title: 'Final', memory: ['Mem'] });
    mockActivate.mockResolvedValue({ id: 'j1', title: 'Final' });
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    await expect(
      activateJourneyAction({ journeyId: 'j1', syllabus: validSyllabus }),
    ).rejects.toThrow('Unauthorized');
  });

  it('throws and skips bootstrap when the journey is not drafting', async () => {
    mockGetJourney.mockResolvedValueOnce({
      id: 'j1',
      title: 'Done',
      styleId: 'teacher',
      memory: [],

      status: 'active',
      syllabus: validSyllabus,
      chapters: [],
    });

    await expect(
      activateJourneyAction({ journeyId: 'j1', syllabus: validSyllabus }),
    ).rejects.toThrow('not in drafting status');

    expect(mockBootstrap).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('bootstraps and activates the draft journey', async () => {
    const storedMessages = [
      {
        id: 'u1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Hi' }],
      },
    ];
    mockGetMessages.mockResolvedValueOnce(storedMessages);

    const result = await activateJourneyAction({
      journeyId: 'j1',
      syllabus: validSyllabus,
    });

    expect(mockGetMessages).toHaveBeenCalledExactlyOnceWith({
      journeyId: 'j1',
      chapterId: null,
    });
    expect(mockBootstrap).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ messages: storedMessages }),
    );
    expect(mockActivate).toHaveBeenCalledExactlyOnceWith({
      userId: 'user-1',
      journeyId: 'j1',
      title: 'Final',
      memory: ['Mem'],
      syllabus: validSyllabus,
    });
    expect(result.path).toBe('/journeys/final-j1');
  });
});
