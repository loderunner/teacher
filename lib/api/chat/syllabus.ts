import { type UIMessage } from 'ai';
import { z } from 'zod';

import type { Locale } from '@/lib/i18n/locale';

/**
 * Request body for `POST /api/journeys/[journeyId]/syllabus/chat`.
 * Exported so callers can type-check their fetch body.
 */
export type SyllabusChatRequest = {
  /** New or edited user message. Absent for regenerations. */
  message?: UIMessage;
  /** Assistant message id to replace. Present for regenerations only. */
  regenerateFromMessageId?: string;
  /** Locale for selecting the correct system prompt language. */
  locale: Locale;
};

/** Zod schema for {@link SyllabusChatRequest}. */
export const syllabusChatRequestSchema: z.ZodType<SyllabusChatRequest> =
  z.strictObject({
    message: z
      .custom<UIMessage>()
      .optional()
      .describe('New or edited user message. Absent for regenerations.'),
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
