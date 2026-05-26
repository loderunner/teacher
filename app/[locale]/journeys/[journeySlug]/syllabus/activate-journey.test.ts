import { auth } from '@clerk/nextjs/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateJourneyAction } from './activate-journey';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getLocale: vi.fn(() => Promise.resolve('en')),
}));
vi.mock('@/lib/server/journeys/activate', () => ({ activateJourney: vi.fn() }));
vi.mock('@/lib/server/journeys/get', () => ({ getJourney: vi.fn() }));
vi.mock('@/lib/server/users/ensure', () => ({ ensureUser: vi.fn() }));
vi.mock('@/lib/syllabus-chat', () => ({ bootstrapJourney: vi.fn() }));

import { activateJourney } from '@/lib/server/journeys/activate';
import { getJourney } from '@/lib/server/journeys/get';
import { ensureUser } from '@/lib/server/users/ensure';
import { bootstrapJourney } from '@/lib/syllabus-chat';

const mockAuth = vi.mocked(auth);
const mockGetJourney = vi.mocked(getJourney);
const mockBootstrap = vi.mocked(bootstrapJourney);
const mockActivate = vi.mocked(activateJourney);
const mockEnsureUser = vi.mocked(ensureUser);

const validSyllabus = { chapters: [{ title: 'One' }] };

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
    mockBootstrap.mockResolvedValue({ title: 'Final', memory: ['Mem'] });
    mockActivate.mockResolvedValue({ id: 'j1', title: 'Final' });
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    await expect(
      activateJourneyAction({
        journeyId: 'j1',
        messages: [],
        syllabus: validSyllabus,
      }),
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
      activateJourneyAction({
        journeyId: 'j1',
        messages: [],
        syllabus: validSyllabus,
      }),
    ).rejects.toThrow('not in drafting status');

    expect(mockBootstrap).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('bootstraps and activates the draft journey', async () => {
    const result = await activateJourneyAction({
      journeyId: 'j1',
      messages: [],
      syllabus: validSyllabus,
    });

    expect(mockBootstrap).toHaveBeenCalledOnce();
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
