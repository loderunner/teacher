'use server';

import { auth } from '@clerk/nextjs/server';

import { setJourneyStyle } from '@/lib/server/journeys/setStyle';

/** Input for the {@link setJourneyStyleAction} server action. */
export type SetJourneyStyleInput = {
  /** ID of the journey to update. */
  journeyId: string;
  /** New teaching style preset ID. */
  styleId: string;
};

/**
 * Server action that updates the teaching style of a journey.
 *
 * @param input - Journey ID and new style ID.
 * @throws Error when the caller is not authenticated.
 */
export async function setJourneyStyleAction({
  journeyId,
  styleId,
}: SetJourneyStyleInput): Promise<void> {
  const { userId } = await auth();
  if (userId === null) {
    throw new Error('Unauthorized');
  }

  await setJourneyStyle({
    userId,
    id: journeyId,
    styleId,
  });
}
