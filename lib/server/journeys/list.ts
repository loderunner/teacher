import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

/** A lightweight journey summary returned from a list query. */
export type JourneySummary = {
  /** Unique journey ID. */
  id: string;
  /** Display title of the journey. */
  title: string;
};

/** Parameters for listing journeys. */
export type ListJourneysParams = {
  /** Clerk user ID — results are scoped to this user. */
  userId: string;
};

/**
 * Returns all journeys for a user, most recently updated first.
 *
 * @param params - The user whose journeys to list.
 * @returns An array of journey summaries, ordered by `updatedAt` descending.
 */
export async function listJourneys({
  userId,
}: ListJourneysParams): Promise<JourneySummary[]> {
  return db
    .select({
      id: journeys.id,
      title: journeys.title,
    })
    .from(journeys)
    .where(eq(journeys.userId, userId))
    .orderBy(desc(journeys.updatedAt));
}
