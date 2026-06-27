'use server';

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

import { applySyllabusChange } from '@/lib/chapters/applySyllabusChange';
import { getJourney } from '@/lib/journeys/get';
import { syllabusSchema } from '@/lib/syllabus/schema';
import { canonicalPath } from './url';

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
};

const inputSchema = z.object({
  journeyId: z.string().min(1),
  newSyllabus: syllabusSchema,
});

/**
 * Server action that applies a syllabus-change proposal. Validates the
 * proposed syllabus, runs the transactional reconciliation, and computes
 * the canonical path of the (possibly renamed) active chapter so the
 * client can `router.push` only when the URL actually changed.
 *
 * @param input - Journey ID and the new syllabus.
 * @returns The canonical path of the active chapter.
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

  return {
    chapterPath: canonicalPath(journey, active),
  };
}
