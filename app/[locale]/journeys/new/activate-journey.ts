'use server';

import { auth } from '@clerk/nextjs/server';
import type { UIMessage } from 'ai';
import { getLocale } from 'next-intl/server';

import { parseLocale } from '@/i18n/locale';
import { activateJourney } from '@/lib/server/journeys/activate';
import { getJourney } from '@/lib/server/journeys/get';
import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';
import { ensureUser } from '@/lib/server/users/ensure';
import { bootstrapJourney } from '@/lib/syllabus-chat';
import { journeyPath } from '@/lib/url';

/** Input for {@link activateJourneyAction}. */
export type ActivateJourneyInput = {
  journeyId: string;
  messages: UIMessage[];
  syllabus: Syllabus;
  styleId: string;
};

/** Result returned after a draft journey is activated. */
export type ActivateJourneyResult = {
  /** Canonical path after activation (title slug may have changed). */
  path: string;
};

/**
 * Finalises a draft journey: derives title and memory, then activates the row
 * and inserts chapter records.
 *
 * @param input - Journey id, transcript, syllabus, and style.
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
  const locale = parseLocale(await getLocale());

  const syllabus = syllabusSchema.parse(input.syllabus);

  const existing = await getJourney({ userId, id: input.journeyId });
  if (existing === null || existing.status !== 'drafting') {
    throw new Error('Journey not found or not in drafting status');
  }

  if (existing.styleId !== input.styleId) {
    throw new Error('Style mismatch for journey');
  }

  const { title, memory } = await bootstrapJourney({
    draft: syllabus,
    messages: input.messages,
    locale,
  });

  const activated = await activateJourney({
    userId,
    journeyId: input.journeyId,
    title,
    memory,
    syllabus,
  });

  return { path: journeyPath(activated.id, activated.title) };
}
