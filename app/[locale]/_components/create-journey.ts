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

export type CreateJourneyInput = {
  messages: UIMessage[];
  syllabus: Syllabus;
  styleId: string;
};

export type CreateJourneyResult = { id: string; path: string };

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
