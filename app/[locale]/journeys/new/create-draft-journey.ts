'use server';

import { auth } from '@clerk/nextjs/server';

import { createDraftJourney } from '@/lib/server/journeys/create';
import { ensureUser } from '@/lib/server/users/ensure';
import { journeyPath } from '@/lib/url';

/** Input for {@link createDraftJourneyAction}. */
export type CreateDraftJourneyInput = {
  /** The user's initial message text; used as a draft title. */
  text: string;
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
 * Creates a draft journey when the user sends their first syllabus message.
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

  return { id: journey.id, path: journeyPath(journey.id, journey.title) };
}
