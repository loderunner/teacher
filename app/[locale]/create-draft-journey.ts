'use server';

import { auth } from '@clerk/nextjs/server';
import { nanoid } from 'nanoid';

import { createDraftJourney } from '@/lib/server/journeys/create';
import { syncMessages } from '@/lib/server/messages';
import { ensureUser } from '@/lib/server/users/ensure';
import { journeyPath } from '@/lib/url';

/** Input for {@link createDraftJourneyAction}. */
export type CreateDraftJourneyInput = {
  /** The user's initial message text. Becomes a draft title and the first chat message. */
  text: string;
  /** Teaching style preset ID selected in the hero. */
  styleId: string;
};

/** Result returned after the draft journey is created. */
export type CreateDraftJourneyResult = {
  /** Newly created journey ID. */
  id: string;
  /**
   * URL path for the draft journey (no locale prefix), e.g.
   * `/journeys/teach-me-rust-abc1234567`.
   */
  path: string;
};

/**
 * Creates a draft journey row and persists the user's first message in one
 * server roundtrip, so the syllabus chat page can resume from the database
 * after the redirect.
 *
 * @param input - Initial text and style.
 * @returns Journey id and path segment for the URL bar.
 * @throws Error when the caller is not authenticated.
 */
export async function createDraftJourneyAction(
  input: CreateDraftJourneyInput,
): Promise<CreateDraftJourneyResult> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  await ensureUser(userId);

  const title = input.text.slice(0, 120);
  const journey = await createDraftJourney({
    userId,
    title,
    styleId: input.styleId,
  });

  await syncMessages({
    journeyId: journey.id,
    chapterId: null,
    messages: [
      {
        id: nanoid(10),
        role: 'user',
        parts: [{ type: 'text', text: input.text }],
      },
    ],
  });

  return { id: journey.id, path: journeyPath(journey.id, journey.title) };
}
