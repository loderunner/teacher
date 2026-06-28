import { auth } from '@clerk/nextjs/server';
import { streamText } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import { getJourney } from '@/lib/journeys/get';
import { deleteMessagesFrom, getMessages, saveMessages } from '@/lib/messages';
import { ensureUser } from '@/lib/users/ensure';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/journeys/get', () => ({
  getJourney: vi.fn(),
}));

vi.mock('@/lib/messages', () => ({
  deleteMessagesFrom: vi.fn(),
  getMessages: vi.fn(),
  saveMessages: vi.fn(),
}));

vi.mock('@/lib/styles/get', () => ({
  getStyle: vi.fn(() => ({
    id: 'teacher',
    systemPromptFragments: { en: 'x', fr: 'y' },
  })),
}));

vi.mock('@/lib/users/ensure', () => ({
  ensureUser: vi.fn(),
}));

vi.mock('./prompts', () => ({
  composeChapterSystemPrompt: vi.fn(() => 'chapter system prompt'),
}));

vi.mock('./tools', () => ({
  createAppendMemoriesTool: vi.fn(() => ({})),
  createMarkChapterCompleteTool: vi.fn(() => ({})),
  createProposeSyllabusChangeTool: vi.fn(() => ({})),
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

const activeJourney = {
  id: 'journey1',
  title: 'My Journey',
  styleId: 'teacher',
  memory: [],
  status: 'active' as const,
  syllabus: {
    chapters: [{ title: 'Chapter 1', summary: '', sections: ['Overview'] }],
  },
  chapters: [
    {
      id: 'chapter1',
      idx: 0,
      title: 'Chapter 1',
      status: 'active' as const,
      summary: null,
    },
  ],
};

const routeContext = {
  params: Promise.resolve({ journeyId: 'journey1', chapterId: 'chapter1' }),
};

const makeRequest = (body: unknown, signal?: AbortSignal) =>
  new Request('http://localhost/api/journeys/journey1/chapters/chapter1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

const userMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello' }],
};

describe('POST /api/journeys/[journeyId]/chapters/[chapterId]/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user-1' } as never);
    mockEnsureUser.mockResolvedValue(undefined);
    mockGetJourney.mockResolvedValue(activeJourney);
    mockDeleteMessagesFrom.mockResolvedValue(undefined);
    mockGetMessages.mockResolvedValue([]);
    mockSaveMessages.mockResolvedValue(undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce({ userId: null } as never);

    const res = await POST(makeRequest({ locale: 'en' }), routeContext);

    expect(res.status).toBe(401);
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

  it('returns 404 when journey is not found', async () => {
    mockGetJourney.mockResolvedValueOnce(null);

    const res = await POST(
      makeRequest({ message: userMessage, locale: 'en' }),
      routeContext,
    );

    expect(res.status).toBe(404);
  });

  it('returns 404 when chapter is locked', async () => {
    mockGetJourney.mockResolvedValueOnce({
      ...activeJourney,
      chapters: [
        {
          id: 'chapter1',
          idx: 0,
          title: 'Chapter 1',
          status: 'locked' as const,
          summary: null,
        },
      ],
    });

    const res = await POST(
      makeRequest({ message: userMessage, locale: 'en' }),
      routeContext,
    );

    expect(res.status).toBe(404);
  });

  describe('start signal (neither message nor regenerateFromMessageId)', () => {
    it('persists a hidden start cue when DB history is empty', async () => {
      mockGetMessages
        .mockResolvedValueOnce([]) // existing check
        .mockResolvedValueOnce([]); // history for model

      await POST(makeRequest({ locale: 'en' }), routeContext);

      expect(mockSaveMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          journeyId: 'journey1',
          chapterId: 'chapter1',
          messages: [
            expect.objectContaining({
              role: 'user',
              parts: [{ type: 'text', text: 'Begin.' }],
              metadata: { hidden: true },
            }),
          ],
        }),
      );
      expect(mockStreamText).toHaveBeenCalled();
    });

    it('does not persist a start cue when DB history already exists', async () => {
      const existingMessage = { id: 'u1', role: 'user' as const, parts: [] };
      mockGetMessages
        .mockResolvedValueOnce([existingMessage]) // existing check
        .mockResolvedValueOnce([existingMessage]); // history for model

      await POST(makeRequest({ locale: 'en' }), routeContext);

      expect(mockSaveMessages).not.toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ metadata: { hidden: true } }),
          ]),
        }),
      );
    });
  });

  describe('submit-message (message present)', () => {
    it('truncates then saves the message', async () => {
      await POST(
        makeRequest({ message: userMessage, locale: 'en' }),
        routeContext,
      );

      expect(mockDeleteMessagesFrom).toHaveBeenCalledExactlyOnceWith({
        journeyId: 'journey1',
        chapterId: 'chapter1',
        fromMessageId: 'u1',
      });
      expect(mockSaveMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ id: 'u1' }),
          ]),
        }),
      );
    });

    it('persists applied-change cue with action metadata', async () => {
      const appliedMessage = {
        id: 'ac1',
        role: 'user',
        parts: [{ type: 'text', text: 'Syllabus updated.' }],
        metadata: { action: 'syllabusChangeApplied' },
      };

      await POST(
        makeRequest({ message: appliedMessage, locale: 'en' }),
        routeContext,
      );

      expect(mockSaveMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              metadata: { action: 'syllabusChangeApplied' },
            }),
          ]),
        }),
      );
    });
  });

  describe('regenerate-message', () => {
    it('truncates from the given id without saving', async () => {
      await POST(
        makeRequest({ regenerateFromMessageId: 'a1', locale: 'en' }),
        routeContext,
      );

      expect(mockDeleteMessagesFrom).toHaveBeenCalledExactlyOnceWith({
        journeyId: 'journey1',
        chapterId: 'chapter1',
        fromMessageId: 'a1',
      });
      expect(mockStreamText).toHaveBeenCalled();
    });
  });

  describe('onFinish', () => {
    it('saves the assistant response, stripping tool-proposeSyllabusChange parts', async () => {
      const assistantMessage = {
        id: 'a1',
        role: 'assistant' as const,
        parts: [
          { type: 'text' as const, text: 'Here is the plan.' },
          {
            type: 'tool-proposeSyllabusChange' as const,
            toolCallId: 'tc1',
            state: 'result' as const,
            input: {},
            output: undefined,
          },
        ],
      };
      mockStreamText.mockReturnValueOnce({
        toUIMessageStreamResponse: vi.fn(
          (opts: {
            onFinish?: (e: {
              responseMessage: typeof assistantMessage;
              messages: never[];
              isContinuation: boolean;
              isAborted: boolean;
            }) => Promise<void> | void;
          }) => {
            void opts.onFinish?.({
              responseMessage: assistantMessage,
              messages: [],
              isContinuation: false,
              isAborted: false,
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
          messages: [
            expect.objectContaining({
              parts: [{ type: 'text', text: 'Here is the plan.' }],
            }),
          ],
        }),
      );
    });

    it('does not save when all parts are stripped', async () => {
      const assistantMessage = {
        id: 'a1',
        role: 'assistant' as const,
        parts: [
          {
            type: 'tool-proposeSyllabusChange' as const,
            toolCallId: 'tc1',
            state: 'result' as const,
            input: {},
            output: undefined,
          },
        ],
      };
      mockStreamText.mockReturnValueOnce({
        toUIMessageStreamResponse: vi.fn(
          (opts: {
            onFinish?: (e: {
              responseMessage: typeof assistantMessage;
              messages: never[];
              isContinuation: boolean;
              isAborted: boolean;
            }) => Promise<void> | void;
          }) => {
            void opts.onFinish?.({
              responseMessage: assistantMessage,
              messages: [],
              isContinuation: false,
              isAborted: false,
            });
            return new Response(null, { status: 200 });
          },
        ),
      } as never);

      await POST(
        makeRequest({ message: userMessage, locale: 'en' }),
        routeContext,
      );

      // The pre-stream save of userMessage happened; onFinish save should not happen
      const calls = mockSaveMessages.mock.calls;
      const onFinishSave = calls.find((call) =>
        call[0].messages.some((m: { id: string }) => m.id === 'a1'),
      );
      expect(onFinishSave).toBeUndefined();
    });

    it('forwards req.signal to streamText', async () => {
      const controller = new AbortController();
      const req = makeRequest(
        { message: userMessage, locale: 'en' },
        controller.signal,
      );
      await POST(req, routeContext);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({ abortSignal: req.signal }),
      );
    });

    it('does not save when the stream is aborted', async () => {
      const assistantMessage = {
        id: 'a1',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: 'Here is the plan.' }],
      };
      mockStreamText.mockReturnValueOnce({
        toUIMessageStreamResponse: vi.fn(
          (opts: {
            onFinish?: (e: {
              responseMessage: typeof assistantMessage;
              messages: never[];
              isContinuation: boolean;
              isAborted: boolean;
            }) => Promise<void> | void;
          }) => {
            void opts.onFinish?.({
              responseMessage: assistantMessage,
              messages: [],
              isContinuation: false,
              isAborted: true,
            });
            return new Response(null, { status: 200 });
          },
        ),
      } as never);

      await POST(
        makeRequest({ message: userMessage, locale: 'en' }),
        routeContext,
      );

      const onFinishSave = mockSaveMessages.mock.calls.find((call) =>
        call[0].messages.some(
          (m: { id: string }) => m.id === assistantMessage.id,
        ),
      );
      expect(onFinishSave).toBeUndefined();
    });
  });
});
