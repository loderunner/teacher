import { auth } from '@clerk/nextjs/server';
import {
  type SystemModelMessage,
  type UIMessage,
  convertToModelMessages,
  smoothStream,
  streamText,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
import { composeChapterSystemPrompt } from '@/lib/chapter-chat/prompts';
import { createUpdateMemoryTool } from '@/lib/chapter-chat/tools';
import { getJourney } from '@/lib/server/journeys/get';
import { getStyle } from '@/lib/server/styles/get';
import { ensureUser } from '@/lib/server/users/ensure';

export const maxDuration = 60;

/**
 * Request body for `POST /api/journeys/[id]/chapters/[chapterId]/chat`.
 * Exported so callers can type-check their fetch body.
 */
export type RequestBody = {
  /** Chat history to send to the model. */
  messages: UIMessage[];
  /** Locale for selecting the correct system prompt language. */
  locale: Locale;
};

const requestBodySchema: z.ZodType<RequestBody> = z.object({
  messages: z.array(z.custom<UIMessage>()),
  locale: z.union([z.literal('en'), z.literal('fr')]),
});

const ephemeralCache = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
};

type RouteContext = {
  params: Promise<{ journeyId: string; chapterId: string }>;
};

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

  let messages: UIMessage[] = [];
  if (parsed.messages.length > 0) {
    try {
      messages = await validateUIMessages({ messages: parsed.messages });
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
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

  const system: SystemModelMessage = {
    role: 'system',
    content: composeChapterSystemPrompt({ style, locale, journey, chapter }),
    providerOptions: ephemeralCache,
  };

  const tools = {
    updateMemory: createUpdateMemoryTool({ userId, journeyId: journey.id }),
  };

  const history = await convertToModelMessages(messages);

  // Anthropic requires at least one message. When the client sends an empty
  // history (assistant-first turn), inject a silent start cue so the model
  // responds from the system prompt alone.
  const startCue = { role: 'user' as const, content: 'Begin.' };
  const modelMessages =
    history.length === 0
      ? [startCue]
      : history.map((message, index) =>
          index === history.length - 1
            ? { ...message, providerOptions: ephemeralCache }
            : message,
        );

  const result = streamText({
    model: 'anthropic/claude-sonnet-4-6',
    system,
    messages: modelMessages,
    tools,
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: 'low',
      },
    },
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
