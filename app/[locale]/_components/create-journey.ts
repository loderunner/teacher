'use server';

import { auth } from '@clerk/nextjs/server';
import type { UIMessage } from 'ai';
import { getLocale } from 'next-intl/server';

import { parseLocale } from '@/i18n/locale';
import { createJourney } from '@/lib/server/journeys/create';
import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';
import { ensureUser } from '@/lib/server/users/ensure';
import { bootstrapJourney } from '@/lib/syllabus-chat/bootstrap';
import { journeyPath } from '@/lib/url';

/** Input for the {@link createJourneyAction} server action. */
export type CreateJourneyInput = {
  /** Full chat transcript from the syllabus-building session. */
  messages: UIMessage[];
  /** Finalized syllabus draft to persist. */
  syllabus: Syllabus;
  /** Teaching style preset ID chosen by the user. */
  styleId: string;
};

/** Result returned by {@link createJourneyAction} after a journey is created. */
export type CreateJourneyResult = {
  /** Newly created journey ID. */
  id: string;
  /** URL path to the journey page, e.g. `/journeys/intro-to-rust-abc1234567`. */
  path: string;
};

/**
 * Server action that bootstraps and persists a new learning journey.
 * Derives a title and learner memory from the chat transcript, then
 * creates the journey and its chapters in the database.
 *
 * @param input - Chat messages, syllabus, and style selection.
 * @returns The new journey's ID and URL path.
 * @throws Error when the caller is not authenticated.
 */
export async function createJourneyAction(
  input: CreateJourneyInput,
): Promise<CreateJourneyResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  await ensureUser(userId);
  const locale = parseLocale(await getLocale());

  const syllabus = syllabusSchema.parse(input.syllabus);

  const { title, memory } = await bootstrapJourney({
    draft: syllabus,
    messages: input.messages,
    locale,
  });

  const journey = await createJourney({
    userId,
    title,
    styleId: input.styleId,
    syllabus,
    memory,
  });

  return { id: journey.id, path: journeyPath(journey.id, journey.title) };
}
