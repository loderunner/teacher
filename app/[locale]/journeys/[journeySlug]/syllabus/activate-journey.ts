'use server';

import { auth } from '@clerk/nextjs/server';
import { getLocale } from 'next-intl/server';

import { bootstrapJourney } from './bootstrap';

import { parseLocale } from '@/lib/i18n/locale';
import { activateJourney } from '@/lib/journeys/activate';
import { getJourney } from '@/lib/journeys/get';
import { getMessages } from '@/lib/messages';
import { type Syllabus, syllabusSchema } from '@/lib/syllabus/schema';
import { ensureUser } from '@/lib/users/ensure';
import { canonicalPath } from '../url';

/** Input for {@link activateJourneyAction}. */
export type ActivateJourneyInput = {
  journeyId: string;
  syllabus: Syllabus;
};

/** Result returned after a draft journey is activated. */
export type ActivateJourneyResult = {
  /** Canonical path after activation (title slug may have changed). */
  path: string;
};

/**
 * Finalises a draft journey: derives title and memory, then activates the row
 * and inserts chapter records. The journey row's stored `styleId` is the
 * source of truth — picker changes during drafting do not propagate.
 *
 * @param input - Journey id and syllabus.
 * @returns URL path to the active journey root.
 * @throws Error when unauthenticated, journey is missing, or not drafting.
 */
export async function activateJourneyAction(
  input: ActivateJourneyInput,
): Promise<ActivateJourneyResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  await ensureUser(userId);

  const existing = await getJourney({ userId, id: input.journeyId });
  if (existing === null || existing.status !== 'drafting') {
    throw new Error('Journey not found or not in drafting status');
  }

  const syllabus = syllabusSchema.parse(input.syllabus);
  const locale = parseLocale(await getLocale());

  const messages = await getMessages({
    journeyId: input.journeyId,
    chapterId: null,
  });

  const { title, memory } = await bootstrapJourney({
    draft: syllabus,
    messages,
    locale,
  });

  const activated = await activateJourney({
    userId,
    journeyId: input.journeyId,
    title,
    memory,
    syllabus,
  });

  return { path: canonicalPath(activated) };
}
