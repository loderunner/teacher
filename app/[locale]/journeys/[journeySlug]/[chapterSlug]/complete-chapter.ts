'use server';

import { auth } from '@clerk/nextjs/server';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

import { parseLocale } from '@/i18n/locale';
import { generateChapterSummary } from '@/lib/chapter-teaching/complete';
import { completeChapter } from '@/lib/chapters/complete';
import { getJourney } from '@/lib/journeys/get';
import { getMessages } from '@/lib/messages';
import { getStyle } from '@/lib/styles/get';
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
