import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

/** Parameters for replacing a journey's learner memory. */
export type UpdateJourneyMemoryInput = {
  /** Clerk user ID — scopes the update to the owner. */
  userId: string;
  /** Journey ID to update. */
  journeyId: string;
  /** New Markdown memory string (full replacement). */
  memory: string;
};

/**
 * Replaces the Markdown learner memory of a journey.
 * Scoped to the owner so unauthorised users cannot mutate other journeys.
 *
 * @param input - Owner ID, journey ID, and new memory string.
 */
export async function updateJourneyMemory({
  userId,
  journeyId,
  memory,
}: UpdateJourneyMemoryInput): Promise<void> {
  await db
    .update(journeys)
    .set({ memory })
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
}
