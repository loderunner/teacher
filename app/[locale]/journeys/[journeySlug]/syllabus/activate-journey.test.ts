import { auth } from '@clerk/nextjs/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateJourneyAction } from './activate-journey';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(() => Promise.resolve('en')),
}));
vi.mock('@/lib/server/journeys/activate', () => ({ activateJourney: vi.fn() }));
vi.mock('@/lib/server/journeys/get', () => ({ getJourney: vi.fn() }));
vi.mock('@/lib/server/messages', () => ({ getMessages: vi.fn() }));
vi.mock('@/lib/server/users/ensure', () => ({ ensureUser: vi.fn() }));
vi.mock('@/lib/syllabus-chat', () => ({ bootstrapJourney: vi.fn() }));

import { activateJourney } from '@/lib/server/journeys/activate';
import { getJourney } from '@/lib/server/journeys/get';
import { getMessages } from '@/lib/server/messages';
import { ensureUser } from '@/lib/server/users/ensure';
import { bootstrapJourney } from '@/lib/syllabus-chat';

const mockAuth = vi.mocked(auth);
const mockGetJourney = vi.mocked(getJourney);
const mockGetMessages = vi.mocked(getMessages);
const mockBootstrap = vi.mocked(bootstrapJourney);
const mockActivate = vi.mocked(activateJourney);
const mockEnsureUser = vi.mocked(ensureUser);

const storedSyllabus = { chapters: [{ title: 'One' }] };

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
      syllabus: storedSyllabus,
      chapters: [],
    });
    mockGetMessages.mockResolvedValue([]);
    mockBootstrap.mockResolvedValue({ title: 'Final', memory: ['Mem'] });
    mockActivate.mockResolvedValue({ id: 'j1', title: 'Final' });
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    await expect(activateJourneyAction({ journeyId: 'j1' })).rejects.toThrow(
      'Unauthorized',
    );
  });

  it('throws and skips bootstrap when the journey is not drafting', async () => {
    mockGetJourney.mockResolvedValueOnce({
      id: 'j1',
      title: 'Done',
      styleId: 'teacher',
      memory: [],
      status: 'active',
      syllabus: storedSyllabus,
      chapters: [],
    });

    await expect(activateJourneyAction({ journeyId: 'j1' })).rejects.toThrow(
      'not in drafting status',
    );

    expect(mockBootstrap).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('bootstraps using the syllabus stored on the journey row', async () => {
    await activateJourneyAction({ journeyId: 'j1' });

    expect(mockBootstrap).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ draft: storedSyllabus }),
    );
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

    const result = await activateJourneyAction({ journeyId: 'j1' });

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
      syllabus: storedSyllabus,
    });
    expect(result.path).toBe('/journeys/final-j1');
  });
});
