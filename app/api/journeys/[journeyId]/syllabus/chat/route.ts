import { auth } from '@clerk/nextjs/server';
import {
  type SystemModelMessage,
  type UIMessage,
  convertToModelMessages,
  generateId,
  smoothStream,
  stepCountIs,
  streamText,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
import { getModel } from '@/lib/ai/model';
import { getJourney } from '@/lib/server/journeys/get';
import {
  deleteMessagesFrom,
  getMessages,
  saveMessages,
} from '@/lib/server/messages';
import { getStyle } from '@/lib/server/styles/get';
import { PRESETS } from '@/lib/server/styles/presets';
import { ensureUser } from '@/lib/server/users/ensure';
import {
  composeSyllabusSystemPrompt,
  createUpdateSyllabusDraftTool,
} from '@/lib/syllabus-chat';

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ journeyId: string }>;
};

/**
 * Request body for `POST /api/journeys/[journeyId]/syllabus/chat`.
 * Exported so callers can type-check their fetch body.
 */
export type RequestBody = {
  /** New or edited user message. Absent for regenerations. */
  message?: UIMessage;
  /** Assistant message id to replace. Present for regenerations only. */
  regenerateFromMessageId?: string;
  /** Locale for selecting the correct system prompt language. */
  locale: Locale;
};

const requestBodySchema: z.ZodType<RequestBody> = z.object({
  message: z.custom<UIMessage>().optional(),
  regenerateFromMessageId: z.string().min(1).optional(),
  locale: z.union([z.literal('en'), z.literal('fr')]),
});

const ephemeralCache = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
};

export async function POST(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (userId === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { journeyId } = await context.params;

  let parsed: RequestBody;
  try {
    parsed = requestBodySchema.parse(await req.json());
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { locale } = parsed;

  // Only one of message or regenerateFromMessageId should be present.
  const hasBoth =
    parsed.message !== undefined &&
    parsed.regenerateFromMessageId !== undefined;
  const hasNeither =
    parsed.message === undefined &&
    parsed.regenerateFromMessageId === undefined;
  if (hasBoth || hasNeither) {
    return new Response('Bad Request', { status: 400 });
  }

  let message: UIMessage | undefined;
  if (parsed.message !== undefined) {
    let validated: UIMessage[];
    try {
      validated = await validateUIMessages({ messages: [parsed.message] });
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

  if (journey.status !== 'drafting') {
    return new Response('Conflict', { status: 409 });
  }

  const style = getStyle(journey.styleId) ?? PRESETS[0];

  if (parsed.regenerateFromMessageId !== undefined) {
    await deleteMessagesFrom({
      journeyId,
      chapterId: null,
      fromMessageId: parsed.regenerateFromMessageId,
    });
  } else if (message !== undefined) {
    await deleteMessagesFrom({
      journeyId,
      chapterId: null,
      fromMessageId: message.id,
    });
    await saveMessages({ journeyId, chapterId: null, messages: [message] });
  }

  const history = await getMessages({ journeyId, chapterId: null });

  const system: SystemModelMessage = {
    role: 'system',
    content: composeSyllabusSystemPrompt({ style, locale }),
    providerOptions: ephemeralCache,
  };

  const converted = await convertToModelMessages(history);
  const modelMessages = converted.map((msg, i) =>
    i === converted.length - 1
      ? { ...msg, providerOptions: ephemeralCache }
      : msg,
  );

  const initialUserMessage =
    history.filter((m) => m.role === 'user').length === 1;

  const result = streamText({
    model: getModel(),
    system,
    messages: modelMessages,
    tools: {
      updateSyllabusDraft: createUpdateSyllabusDraftTool({ userId, journeyId }),
    },
    stopWhen: stepCountIs(5),
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        ...(initialUserMessage ? { effort: 'max' } : {}),
      },
    },
    experimental_transform: smoothStream({ delayInMs: null }),
  });

  return result.toUIMessageStreamResponse({
    generateMessageId: generateId,
    onFinish: async ({ responseMessage }) => {
      await saveMessages({
        journeyId,
        chapterId: null,
        messages: [responseMessage],
      });
    },
  });
}
