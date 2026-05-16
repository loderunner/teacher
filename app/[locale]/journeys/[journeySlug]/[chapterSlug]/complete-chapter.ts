'use server';

import { auth } from '@clerk/nextjs/server';
import { type UIMessage, validateUIMessages } from 'ai';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';

import { parseLocale } from '@/i18n/locale';
import { generateChapterSummary } from '@/lib/chapter-chat/complete';
import { chapterTaskDescription } from '@/lib/chapter-chat/prompts';
import { checkGuardrail, extractLastUserText } from '@/lib/guardrail';
import { completeChapter } from '@/lib/server/chapters/complete';
import { getJourney } from '@/lib/server/journeys/get';
import { getStyle } from '@/lib/server/styles/get';
import { chapterPath } from '@/lib/url';

/** Input for the {@link completeChapterAction} server action. */
export type CompleteChapterInput = {
  /** Journey ID owning the chapter. */
  journeyId: string;
  /** Zero-based index of the chapter being completed. */
  chapterIdx: number;
  /** Full chat transcript for this chapter (client-supplied until Story 5). */
  messages: UIMessage[];
};

/**
 * Result returned by {@link completeChapterAction}.
 * Either a successful completion or a guardrail refusal with a user-facing
 * reason to display in the chat.
 */
export type CompleteChapterResult =
  | {
      /** Chapter was completed successfully. */
      ok: true;
      /** Canonical URL of the next chapter, or `null` when there is no next. */
      nextChapterPath: string | null;
    }
  | {
      /** Request was blocked by the abuse guardrail. */
      ok: false;
      /** User-facing reason to display in the chat. */
      reason: string;
    };

const inputSchema = z.object({
  journeyId: z.string().min(1),
  chapterIdx: z.number().int().min(0),
  messages: z.array(z.custom<UIMessage>()),
});

/**
 * Server action that finalises a chapter: generates a summary, persists it,
 * marks the chapter `done`, and unlocks the next chapter.
 *
 * Until Story 5 lands chat-history persistence, the transcript used for the
 * summary is supplied by the client. The summary is non-security-sensitive
 * (educational colour text only); a malicious client can at worst produce a
 * misleading recap. The input is still validated for structural safety via
 * `validateUIMessages` before being passed to the LLM.
 *
 * Returns `{ ok: false, reason }` when the guardrail blocks the last user
 * message in the transcript. Throws on system-level errors (auth, database).
 *
 * @param input - Journey ID, chapter index, and chat transcript.
 * @returns Completion result or a guardrail refusal.
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
  const messages = await validateUIMessages({ messages: parsed.messages });

  const lastUserText = extractLastUserText(messages);
  if (lastUserText !== null) {
    const { blocked, reason } = await checkGuardrail({
      input: lastUserText,
      taskContext: chapterTaskDescription,
    });
    if (blocked) {
      return { ok: false, reason };
    }
  }

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
      ok: true,
      nextChapterPath: next === null ? null : chapterPath(journey, next),
    };
  }

  const style = getStyle(journey.styleId);
  if (style === null) {
    throw new Error('Invalid style');
  }

  const locale = parseLocale(await getLocale());

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
    return { ok: true, nextChapterPath: null };
  }

  const nextChapter = journey.chapters.find((c) => c.idx === nextIdx);
  if (nextChapter === undefined) {
    return { ok: true, nextChapterPath: null };
  }

  return { ok: true, nextChapterPath: chapterPath(journey, nextChapter) };
}
