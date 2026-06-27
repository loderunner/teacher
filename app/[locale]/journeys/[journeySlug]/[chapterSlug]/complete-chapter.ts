'use server';

import { auth } from '@clerk/nextjs/server';
import { type UIMessage, generateText } from 'ai';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

import { type Locale, parseLocale } from '@/i18n/locale';
import { getModel } from '@/lib/ai/model';
import { completeChapter } from '@/lib/chapters/complete';
import { type JourneyChapter, getJourney } from '@/lib/journeys/get';
import { getMessages } from '@/lib/messages';
import { type Style, getStyle } from '@/lib/styles/get';
import { chapterPath } from '@/lib/url';

/** Input for the {@link completeChapterAction} server action. */
export type CompleteChapterInput = {
  /** Journey ID owning the chapter. */
  journeyId: string;
  /** Zero-based index of the chapter being completed. */
  chapterIdx: number;
};

/** Result returned by {@link completeChapterAction}. */
export type CompleteChapterResult = {
  /** Canonical URL of the next chapter, or `null` when there is no next. */
  nextChapterPath: string | null;
};

const inputSchema = z.object({
  journeyId: z.string().min(1),
  chapterIdx: z.number().int().min(0),
});

const summaryInstructions: Record<Locale, string> = {
  en: `Summarise what was actually taught in this chapter and what the learner demonstrated. Write in the second person ("You learned…, you explored…, you practised…").

Aim for a summary that would fill roughly a quarter of an A4 page — around 150 to 400 words. Use bullet points where they help list concepts or skills. Stick to facts visible in the transcript — do not invent material that was not discussed.

Output only the summary. No introduction, no label, no commentary — just the summary text itself.`,
  fr: `Résumez ce qui a réellement été enseigné dans ce chapitre et ce que l'apprenant a démontré. Rédigez à la deuxième personne (« Vous avez appris…, vous avez exploré…, vous avez pratiqué… »).

Visez un résumé qui remplirait environ un quart d'une page A4 — entre 150 et 400 mots. Utilisez des puces pour lister les concepts ou compétences. Tenez-vous-en aux faits visibles dans la transcription — n'inventez pas de contenu qui n'a pas été abordé.

Produisez uniquement le résumé. Aucune introduction, aucun titre, aucun commentaire — seulement le texte du résumé.`,
};

const composeChapterSummaryPrompt = ({
  style,
  locale,
  chapter,
  messages,
}: {
  style: Style;
  locale: Locale;
  chapter: JourneyChapter;
  messages: UIMessage[];
}): string => {
  const transcript = messages
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join(' ');
      return `${m.role}: ${text}`;
    })
    .join('\n');

  return `${style.systemPromptFragments[locale]}

${summaryInstructions[locale]}

Chapter: ${chapter.title}

Transcript:
${transcript}`;
};

const generateChapterSummary = async ({
  style,
  locale,
  chapter,
  messages,
}: {
  style: Style;
  locale: Locale;
  chapter: JourneyChapter;
  messages: UIMessage[];
}): Promise<string> => {
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
};

/**
 * Server action that finalises a chapter: generates a summary, persists it,
 * marks the chapter `done`, and unlocks the next chapter.
 *
 * Loads the chat transcript from the DB; the client no longer supplies it.
 *
 * @param input - Journey ID and chapter index.
 * @returns The canonical path of the next chapter, or `null` if last chapter.
 * @throws Error when the caller is not authenticated or inputs are invalid.
 */
export async function completeChapterAction(
  input: CompleteChapterInput,
): Promise<CompleteChapterResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  const parsed = inputSchema.parse(input);

  const journey = await getJourney({ userId, id: parsed.journeyId });
  if (journey === null) {
    throw new Error('Journey not found');
  }

  const chapter = journey.chapters.find((c) => c.idx === parsed.chapterIdx);
  if (chapter === undefined) {
    throw new Error('Chapter not found');
  }

  if (chapter.status !== 'active') {
    const nextIdx = parsed.chapterIdx + 1;
    const next = journey.chapters.find((c) => c.idx === nextIdx) ?? null;
    return {
      nextChapterPath: next === null ? null : chapterPath(journey, next),
    };
  }

  const style = getStyle(journey.styleId);
  if (style === null) {
    throw new Error('Invalid style');
  }

  const locale = parseLocale(await getLocale());

  const messages = await getMessages({
    journeyId: journey.id,
    chapterId: chapter.id,
  });

  const summary = await generateChapterSummary({
    style,
    locale,
    chapter,
    messages,
  });

  const { nextIdx } = await completeChapter({
    userId,
    journeyId: journey.id,
    idx: chapter.idx,
    summary,
  });

  if (nextIdx === null) {
    return { nextChapterPath: null };
  }

  const nextChapter = journey.chapters.find((c) => c.idx === nextIdx);
  if (nextChapter === undefined) {
    return { nextChapterPath: null };
  }

  return { nextChapterPath: chapterPath(journey, nextChapter) };
}
