import { auth } from '@clerk/nextjs/server';
import {
  type SystemModelMessage,
  type UIMessage,
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
import { checkGuardrail, extractLastUserText } from '@/lib/guardrail';
import { getStyle } from '@/lib/server/styles/get';
import { ensureUser } from '@/lib/server/users/ensure';
import { composeSyllabusSystemPrompt } from '@/lib/syllabus-chat/prompts';
import { updateSyllabusDraft } from '@/lib/syllabus-chat/tool';

export const maxDuration = 60;

/**
 * Request body for `POST /api/syllabus/chat`.
 * Exported so callers can type-check their fetch body.
 */
export type RequestBody = {
  /** Chat history to send to the model. */
  messages: UIMessage[];
  /** Teaching style preset ID used to build the system prompt. */
  styleId: string;
  /** Locale for selecting the correct system prompt language. */
  locale: Locale;
};

const requestBodySchema: z.ZodType<RequestBody> = z.object({
  messages: z.array(z.custom<UIMessage>()),
  styleId: z.string().min(1),
  locale: z.union([z.literal('en'), z.literal('fr')]),
});

const tools = { updateSyllabusDraft };

const ephemeralCache = {
  anthropic: { cacheControl: { type: 'ephemeral' } },
};

export async function POST(req: Request): Promise<Response> {
  const { userId } = await auth();
  if (userId === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  let parsed: RequestBody;
  try {
    parsed = requestBodySchema.parse(await req.json());
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { styleId, locale } = parsed;

  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({
      messages: parsed.messages,
    });
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const lastUserText = extractLastUserText(messages);
  if (lastUserText !== null) {
    const { blocked, reason } = await checkGuardrail({
      input: lastUserText,
      taskContext:
        'helping a student plan a learning syllabus for a new educational journey',
    });
    if (blocked) {
      return new Response(reason, { status: 422 });
    }
  }

  await ensureUser(userId);

  const style = getStyle(styleId);
  if (style === null) {
    return new Response('Invalid style', { status: 400 });
  }

  const system: SystemModelMessage = {
    role: 'system',
    content: composeSyllabusSystemPrompt({ style, locale }),
    providerOptions: ephemeralCache,
  };

  const history = await convertToModelMessages(messages);
  const modelMessages = history.map((message, index) =>
    index === history.length - 1
      ? { ...message, providerOptions: ephemeralCache }
      : message,
  );

  const initialUserMessage =
    messages.filter((message) => message.role === 'user').length === 1;

  const result = streamText({
    model: 'anthropic/claude-sonnet-4-6',
    system,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        ...(initialUserMessage ? { effort: 'max' } : {}),
      },
    },
    experimental_transform: smoothStream({ delayInMs: null }),
  });

  return result.toUIMessageStreamResponse();
}
