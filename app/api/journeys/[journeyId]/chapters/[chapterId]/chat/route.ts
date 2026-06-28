import { auth } from '@clerk/nextjs/server';
import {
  type SystemModelMessage,
  type UIMessage,
  consumeStream,
  convertToModelMessages,
  generateId,
  smoothStream,
  streamText,
  validateUIMessages,
} from 'ai';

import { composeChapterSystemPrompt } from './prompts';
import {
  createAppendMemoriesTool,
  createMarkChapterCompleteTool,
  createProposeSyllabusChangeTool,
} from './tools';

import { getModel } from '@/lib/ai/model';
import {
  type ChapterChatRequest,
  chapterChatRequestSchema,
} from '@/lib/api/chat/chapter';
import type { ChatMessageMetadata } from '@/lib/chat';
import { getJourney } from '@/lib/journeys/get';
import { deleteMessagesFrom, getMessages, saveMessages } from '@/lib/messages';
import { getStyle } from '@/lib/styles/get';
import { ensureUser } from '@/lib/users/ensure';

export const maxDuration = 60;

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

  let parsed: ChapterChatRequest;
  try {
    parsed = chapterChatRequestSchema.parse(await req.json());
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
    markChapterComplete: createMarkChapterCompleteTool(),
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
    abortSignal: req.signal,
  });

  return result.toUIMessageStreamResponse({
    generateMessageId: generateId,
    consumeSseStream: consumeStream,
    onFinish: async ({ responseMessage, isAborted }) => {
      if (isAborted) {
        return;
      }
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
