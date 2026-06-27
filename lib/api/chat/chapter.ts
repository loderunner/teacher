import { type UIMessage } from 'ai';
import { z } from 'zod';

import type { Locale } from '@/i18n/locale';
import type { ChatMessageMetadata } from '@/lib/journey-chat';

/**
 * Request body for `POST /api/journeys/[id]/chapters/[chapterId]/chat`.
 * Exported so callers can type-check their fetch body.
 */
export type ChapterChatRequest = {
  /** New or edited user message. Absent for regenerations and the start signal. */
  message?: UIMessage<ChatMessageMetadata>;
  /** Assistant message id to replace. Present for regenerations only. */
  regenerateFromMessageId?: string;
  /** Locale for selecting the correct system prompt language. */
  locale: Locale;
};

/** Zod schema for {@link ChapterChatRequest}. */
export const chapterChatRequestSchema: z.ZodType<ChapterChatRequest> =
  z.strictObject({
    message: z
      .custom<UIMessage<ChatMessageMetadata>>()
      .optional()
      .describe(
        'New or edited user message. Absent for regenerations and the start signal.',
      ),
    regenerateFromMessageId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Assistant message id to replace. Present for regenerations only.',
      ),
    locale: z
      .union([z.literal('en'), z.literal('fr')])
      .describe('Locale for selecting the correct system prompt language.'),
  });
