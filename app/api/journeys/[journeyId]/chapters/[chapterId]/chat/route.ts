import { auth } from '@clerk/nextjs/server';
import {
  type SystemModelMessage,
  type UIMessage,
  convertToModelMessages,
  generateId,
  smoothStream,
  streamText,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
import { getModel } from '@/lib/ai/model';
import { composeChapterSystemPrompt } from '@/lib/chapter-chat/prompts';
import {
  createAppendMemoriesTool,
  createMarkChapterCompleteTool,
  createProposeSyllabusChangeTool,
} from '@/lib/chapter-chat/tools';
import type { ChatMessageMetadata } from '@/lib/journey-chat';
import { getJourney } from '@/lib/server/journeys/get';
import {
  deleteMessagesFrom,
  getMessages,
  saveMessages,
} from '@/lib/server/messages';
import { getStyle } from '@/lib/server/styles/get';
import { ensureUser } from '@/lib/server/users/ensure';

export const maxDuration = 60;

/**
 * Request body for `POST /api/journeys/[id]/chapters/[chapterId]/chat`.
 * Exported so callers can type-check their fetch body.
 */
export type RequestBody = {
  /** New or edited user message. Absent for regenerations and the start signal. */
  message?: UIMessage<ChatMessageMetadata>;
  /** Assistant message id to replace. Present for regenerations only. */
  regenerateFromMessageId?: string;
  /** Locale for selecting the correct system prompt language. */
  locale: Locale;
};

const requestBodySchema: z.ZodType<RequestBody> = z.object({
  message: z.custom<UIMessage<ChatMessageMetadata>>().optional(),
  regenerateFromMessageId: z.string().min(1).optional(),
  locale: z.union([z.literal('en'), z.literal('fr')]),
});

const ephemeralCache = { anthropic: { cacheControl: { type: 'ephemeral' } } };

type RouteContext = {
  params: Promise<{ journeyId: string; chapterId: string }>;
};

const stripSyllabusChangeContent = (list: UIMessage[]): UIMessage[] =>
  list.flatMap((m) => {
    if (m.role !== 'assistant') {
      return [m];
    }
    const parts = m.parts.filter(
      (p) => p.type !== 'tool-proposeSyllabusChange',
    );
    if (parts.length === 0) {
      return [];
    }
    return [{ ...m, parts }];
  });

export async function POST(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (userId === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { journeyId, chapterId } = await context.params;

  let parsed: RequestBody;
  try {
    parsed = requestBodySchema.parse(await req.json());
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { locale } = parsed;

  if (
    parsed.message !== undefined &&
    parsed.regenerateFromMessageId !== undefined
  ) {
    return new Response('Bad Request', { status: 400 });
  }

  let message: UIMessage<ChatMessageMetadata> | undefined;
  if (parsed.message !== undefined) {
    let validated: UIMessage<ChatMessageMetadata>[];
    try {
      validated = await validateUIMessages<UIMessage<ChatMessageMetadata>>({
        messages: [parsed.message],
      });
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    message = validated[0];
  }

  await ensureUser(userId);

  const journey = await getJourney({ userId, id: journeyId });
  if (journey === null) {
    return new Response('Not Found', { status: 404 });
  }

  const chapter = journey.chapters.find((c) => c.id === chapterId);
  if (chapter === undefined || chapter.status === 'locked') {
    return new Response('Not Found', { status: 404 });
  }

  const style = getStyle(journey.styleId);
  if (style === null) {
    return new Response('Bad Request', { status: 400 });
  }

  if (parsed.regenerateFromMessageId !== undefined) {
    await deleteMessagesFrom({
      journeyId,
      chapterId,
      fromMessageId: parsed.regenerateFromMessageId,
    });
  } else if (message !== undefined) {
    await deleteMessagesFrom({
      journeyId,
      chapterId,
      fromMessageId: message.id,
    });
    await saveMessages({ journeyId, chapterId, messages: [message] });
  } else {
    // Start signal — assistant-first turn for a fresh chapter.
    const existing = await getMessages({ journeyId, chapterId });
    if (existing.length === 0) {
      const startCue: UIMessage<ChatMessageMetadata> = {
        id: generateId(),
        role: 'user',
        parts: [{ type: 'text', text: 'Begin.' }],
        metadata: { hidden: true },
      };
      await saveMessages({ journeyId, chapterId, messages: [startCue] });
    }
  }

  const history = await getMessages({ journeyId, chapterId });

  const system: SystemModelMessage = {
    role: 'system',
    content: composeChapterSystemPrompt({ style, locale, journey, chapter }),
    providerOptions: ephemeralCache,
  };

  const tools = {
    appendMemories: createAppendMemoriesTool({ userId, journeyId: journey.id }),
    markChapterComplete: createMarkChapterCompleteTool({
      userId,
      journey,
      chapter,
      messages: history,
      style,
      locale,
    }),
    proposeSyllabusChange: createProposeSyllabusChangeTool(),
  };

  const converted = await convertToModelMessages(history);
  const modelMessages = converted.map((msg, i) =>
    i === converted.length - 1
      ? { ...msg, providerOptions: ephemeralCache }
      : msg,
  );

  const result = streamText({
    model: getModel(),
    system,
    messages: modelMessages,
    tools,
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: 'low' },
    },
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse({
    generateMessageId: generateId,
    onFinish: async ({ responseMessage }) => {
      const stripped = stripSyllabusChangeContent([responseMessage]);
      if (stripped.length > 0) {
        await saveMessages({
          journeyId: journey.id,
          chapterId,
          messages: stripped,
        });
      }
    },
  });
}
