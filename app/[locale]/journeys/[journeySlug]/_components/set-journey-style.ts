'use server';

import { auth } from '@clerk/nextjs/server';

import { setJourneyStyle } from '@/lib/server/journeys/setStyle';

export type SetJourneyStyleInput = {
  journeyId: string;
  styleId: string;
};

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
