import { auth } from '@clerk/nextjs/server';
import { streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import { getJourney } from '@/lib/server/journeys/get';
import { syncMessages } from '@/lib/server/messages';
import { ensureUser } from '@/lib/server/users/ensure';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/server/journeys/get', () => ({
  getJourney: vi.fn(),
}));

vi.mock('@/lib/server/messages', () => ({
  syncMessages: vi.fn(),
}));

vi.mock('@/lib/server/styles/get', () => ({
  getStyle: vi.fn(() => ({
    id: 'teacher',
    systemPromptFragments: { en: 'x', fr: 'y' },
  })),
}));

vi.mock('@/lib/server/users/ensure', () => ({
  ensureUser: vi.fn(),
}));

vi.mock('@/lib/syllabus-chat', () => ({
  composeSyllabusSystemPrompt: vi.fn(() => 'system prompt'),
  updateSyllabusDraftTool: {
    description: 'tool',
    inputSchema: {},
  },
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual('ai');
  return {
    ...actual,
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: vi.fn(
        () => new Response(null, { status: 200 }),
      ),
    })),
  };
});

const mockAuth = vi.mocked(auth);
const mockGetJourney = vi.mocked(getJourney);
const mockEnsureUser = vi.mocked(ensureUser);
const mockSyncMessages = vi.mocked(syncMessages);
const mockStreamText = vi.mocked(streamText);

const validBody = {
  journeyId: 'journey1',
  styleId: 'teacher',
  locale: 'en',
  messages: [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ],
};

describe('POST /api/syllabus/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' } as never);
    mockEnsureUser.mockResolvedValue(undefined);
    mockGetJourney.mockResolvedValue({
      id: 'journey1',
      title: 'Draft',
      styleId: 'teacher',
      memory: [],

      status: 'drafting',
      syllabus: { chapters: [] },
      chapters: [],
    });
    mockSyncMessages.mockResolvedValue(undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    const res = await POST(
      new Request('http://localhost/api/syllabus/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(res.status).toBe(401);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when journeyId is missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/syllabus/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleId: 'teacher',
          locale: 'en',
          messages: validBody.messages,
        }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it('returns 403 when the journey is not found for the user', async () => {
    mockGetJourney.mockResolvedValueOnce(null);

    const res = await POST(
      new Request('http://localhost/api/syllabus/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(res.status).toBe(403);
    expect(mockSyncMessages).not.toHaveBeenCalled();
  });

  it('returns 409 when the journey is already active', async () => {
    mockGetJourney.mockResolvedValueOnce({
      id: 'journey1',
      title: 'Active',
      styleId: 'teacher',
      memory: [],

      status: 'active',
      syllabus: { chapters: [{ title: 'One' }] },
      chapters: [
        {
          id: 'c1',
          idx: 0,
          title: 'One',
          status: 'active',
          summary: null,
        },
      ],
    });

    const res = await POST(
      new Request('http://localhost/api/syllabus/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(res.status).toBe(409);
  });

  it('saves incoming messages before streaming', async () => {
    await POST(
      new Request('http://localhost/api/syllabus/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(mockSyncMessages).toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalled();
  });
});
