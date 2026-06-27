import { type UIMessage, generateText } from 'ai';

import type { Locale } from '@/i18n/locale';
import { getModel } from '@/lib/ai/model';
import { composeChapterSummaryPrompt } from '@/lib/chapter-teaching/prompts';
import type { JourneyChapter } from '@/lib/journeys/get';
import type { Style } from '@/lib/styles/get';

/** Parameters for generating a chapter summary at completion time. */
export type GenerateChapterSummaryParams = {
  /** Teaching style frames the summary voice. */
  style: Style;
  /** Locale of the summary. */
  locale: Locale;
  /** Chapter being summarised. */
  chapter: JourneyChapter;
  /** Chat transcript captured client-side. */
  messages: UIMessage[];
};

/**
 * Generates a Markdown summary of what was taught in a chapter.
 *
 * @param params - Style, locale, chapter, and transcript.
 * @returns The generated summary as a Markdown string.
 */
export async function generateChapterSummary({
  style,
  locale,
  chapter,
  messages,
}: GenerateChapterSummaryParams): Promise<string> {
  const prompt = composeChapterSummaryPrompt({
    style,
    locale,
    chapter,
    messages,
  });

  const { text } = await generateText({
    model: getModel(),
    prompt,
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive' }, effort: 'low' },
    },
  });

  return text;
}
