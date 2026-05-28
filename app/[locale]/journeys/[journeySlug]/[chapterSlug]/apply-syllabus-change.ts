'use server';

import { auth } from '@clerk/nextjs/server';
import { generateId } from 'ai';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { applySyllabusChange } from '@/lib/server/chapters/applySyllabusChange';
import { getJourney } from '@/lib/server/journeys/get';
import { getMessages, syncMessages } from '@/lib/server/messages';
import { syllabusSchema } from '@/lib/server/syllabus/schema';
import { chapterPath } from '@/lib/url';

/** Input for the {@link applySyllabusChangeAction} server action. */
export type ApplySyllabusChangeInput = {
  /** Journey ID owning the syllabus to replace. */
  journeyId: string;
  /** Full proposed new syllabus (unvalidated from client). */
  newSyllabus: unknown;
};

/** Result returned by {@link applySyllabusChangeAction}. */
export type ApplySyllabusChangeResult = {
  /** Canonical path of the active chapter after reconciliation. */
  chapterPath: string;
  /** ID of the persisted synthetic "applied" user message, if saved successfully. */
  syntheticMessageId?: string;
};

const inputSchema = z.object({
  journeyId: z.string().min(1),
  newSyllabus: syllabusSchema,
});

/**
 * Server action that applies a syllabus-change proposal. Validates the
 * proposed syllabus, runs the transactional reconciliation, appends a
 * synthetic user message to the chapter transcript, and computes the
 * canonical path of the (possibly renamed) active chapter so the client
 * can `router.push` only when the URL actually changed.
 *
 * @param input - Journey ID and the new syllabus.
 * @returns The canonical path of the active chapter and the synthetic message ID.
 * @throws Error when the caller is not authenticated, when the input is
 *   invalid, when the journey is missing, or when the proposal would
 *   destroy learner progress.
 */
export async function applySyllabusChangeAction(
  input: ApplySyllabusChangeInput,
): Promise<ApplySyllabusChangeResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  const parsed = inputSchema.parse(input);

  await applySyllabusChange({
    userId,
    journeyId: parsed.journeyId,
    newSyllabus: parsed.newSyllabus,
  });

  const journey = await getJourney({ userId, id: parsed.journeyId });
  if (journey === null) {
    throw new Error('Journey not found');
  }
  const active = journey.chapters.find((c) => c.status === 'active');
  if (active === undefined) {
    throw new Error('Invalid journey state after apply');
  }

  const syntheticMessageId = generateId();
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'ChapterChat' });

  try {
    const existing = await getMessages({
      journeyId: parsed.journeyId,
      chapterId: active.id,
    });
    await syncMessages({
      journeyId: parsed.journeyId,
      chapterId: active.id,
      messages: [
        ...existing,
        {
          id: syntheticMessageId,
          role: 'user',
          metadata: { type: 'action' },
          parts: [{ type: 'text', text: t('proposalAppliedMessage') }],
        },
      ],
    });
  } catch {
    return { chapterPath: chapterPath(journey, active) };
  }

  return { chapterPath: chapterPath(journey, active), syntheticMessageId };
}
