import { auth } from '@clerk/nextjs/server';
import {
  type ModelMessage,
  type UIMessage,
  convertToModelMessages,
  smoothStream,
  streamText,
  validateUIMessages,
} from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
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

const requestBodySchema = z.object({
  messages: z.array(z.unknown()),
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

  let parsed: z.infer<typeof requestBodySchema>;
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

  await ensureUser(userId);

  const style = getStyle(styleId);
  if (style === null) {
    return new Response('Invalid style', { status: 400 });
  }

  const system = composeSyllabusSystemPrompt({ style, locale });
  const history = await convertToModelMessages(messages);

  const modelMessages: ModelMessage[] = [
    { role: 'system', content: system, providerOptions: ephemeralCache },
    ...history.map((message, index) =>
      index === history.length - 1
        ? { ...message, providerOptions: ephemeralCache }
        : message,
    ),
  ];

  const initialUserMessage =
    messages.filter((message) => message.role === 'user').length === 1;

  const result = streamText({
    model: 'anthropic/claude-sonnet-4-6',
    messages: modelMessages,
    tools,
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        ...(initialUserMessage ? { effort: 'max' } : {}),
      },
    },
    experimental_transform: smoothStream(),
  });

  return result.toUIMessageStreamResponse();
}
