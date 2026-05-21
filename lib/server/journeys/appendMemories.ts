import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

/** Parameters for appending new entries to a journey's learner memory. */
export type AppendJourneyMemoriesInput = {
  /** Clerk user ID — scopes the update to the owner. */
  userId: string;
  /** Journey ID to update. */
  journeyId: string;
  /** New memory entries to append, in order. */
  entries: string[];
};

/**
 * Appends one or more learner memory entries to a journey atomically.
 * Scoped to the owner so unauthorised users cannot mutate other journeys.
 *
 * @param input - Owner ID, journey ID, and new memory entries.
 */
export async function appendJourneyMemories({
  userId,
  journeyId,
  entries,
}: AppendJourneyMemoriesInput): Promise<void> {
  await db
    .update(journeys)
    .set({
      memory: sql`${journeys.memory} || ${JSON.stringify(entries)}::jsonb`,
    })
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
}
