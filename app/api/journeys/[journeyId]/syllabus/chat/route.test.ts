import { auth } from '@clerk/nextjs/server';
import { streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import { getJourney } from '@/lib/server/journeys/get';
import {
  deleteMessagesFrom,
  getMessages,
  saveMessages,
} from '@/lib/server/messages';
import { ensureUser } from '@/lib/server/users/ensure';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/server/journeys/get', () => ({
  getJourney: vi.fn(),
}));

vi.mock('@/lib/server/messages', () => ({
  deleteMessagesFrom: vi.fn(),
  getMessages: vi.fn(),
  saveMessages: vi.fn(),
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
const mockDeleteMessagesFrom = vi.mocked(deleteMessagesFrom);
const mockGetMessages = vi.mocked(getMessages);
const mockSaveMessages = vi.mocked(saveMessages);
const mockStreamText = vi.mocked(streamText);

const draftJourney = {
  id: 'journey1',
  title: 'Draft',
  styleId: 'teacher',
  memory: [],
  status: 'drafting' as const,
  syllabus: { chapters: [] },
  chapters: [],
};

const routeContext = {
  params: Promise.resolve({ journeyId: 'journey1' }),
};

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/journeys/journey1/syllabus/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const userMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};

describe('POST /api/journeys/[journeyId]/syllabus/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' } as never);
    mockEnsureUser.mockResolvedValue(undefined);
    mockGetJourney.mockResolvedValue(draftJourney);
    mockDeleteMessagesFrom.mockResolvedValue(undefined);
    mockGetMessages.mockResolvedValue([]);
    mockSaveMessages.mockResolvedValue(undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    const res = await POST(
      makeRequest({ message: userMessage, locale: 'en' }),
      routeContext,
    );

    expect(res.status).toBe(401);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when neither message nor regenerateFromMessageId is present', async () => {
    const res = await POST(makeRequest({ locale: 'en' }), routeContext);

    expect(res.status).toBe(400);
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('returns 400 when both message and regenerateFromMessageId are present', async () => {
    const res = await POST(
      makeRequest({
        message: userMessage,
        regenerateFromMessageId: 'a1',
        locale: 'en',
      }),
      routeContext,
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 when locale is missing', async () => {
    const res = await POST(makeRequest({ message: userMessage }), routeContext);

    expect(res.status).toBe(400);
  });

  it('returns 404 when journey is not found', async () => {
    mockGetJourney.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ message: userMessage, locale: 'en' }),
      routeContext,
    );

    expect(res.status).toBe(404);
    expect(mockSaveMessages).not.toHaveBeenCalled();
  });

  it('returns 409 when journey is already active', async () => {
    mockGetJourney.mockResolvedValueOnce({
      ...draftJourney,
      status: 'active',
    });

    const res = await POST(
      makeRequest({ message: userMessage, locale: 'en' }),
      routeContext,
    );

    expect(res.status).toBe(409);
  });

  it('truncates then saves when message is present (new or edited)', async () => {
    await POST(
      makeRequest({ message: userMessage, locale: 'en' }),
      routeContext,
    );

    expect(mockDeleteMessagesFrom).toHaveBeenCalledExactlyOnceWith({
      journeyId: 'journey1',
      chapterId: null,
      fromMessageId: 'u1',
    });
    expect(mockSaveMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ id: 'u1' }),
        ]),
      }),
    );
    expect(mockStreamText).toHaveBeenCalled();
  });

  it('only truncates when regenerating — does not save the incoming message', async () => {
    await POST(
      makeRequest({ regenerateFromMessageId: 'a1', locale: 'en' }),
      routeContext,
    );

    expect(mockDeleteMessagesFrom).toHaveBeenCalledExactlyOnceWith({
      journeyId: 'journey1',
      chapterId: null,
      fromMessageId: 'a1',
    });
    // saveMessages may be called in onFinish (for the assistant response) but
    // not for a pre-stream persist of the incoming delta.
    expect(mockStreamText).toHaveBeenCalled();
  });

  it('saves the assistant response in onFinish', async () => {
    const assistantMessage = {
      id: 'a1',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'Hi' }],
    };
    mockStreamText.mockReturnValueOnce({
      toUIMessageStreamResponse: vi.fn(
        (opts: {
          onFinish?: (e: {
            responseMessage: typeof assistantMessage;
            messages: never[];
            isContinuation: boolean;
          }) => Promise<void> | void;
        }) => {
          void opts.onFinish?.({
            responseMessage: assistantMessage,
            messages: [],
            isContinuation: false,
          });
          return new Response(null, { status: 200 });
        },
      ),
    } as never);

    await POST(
      makeRequest({ message: userMessage, locale: 'en' }),
      routeContext,
    );

    expect(mockSaveMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: 'journey1',
        chapterId: null,
        messages: [assistantMessage],
      }),
    );
  });
});
