import { and, eq } from 'drizzle-orm';

import { dbTx } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';
import type { Syllabus } from '@/lib/server/syllabus/schema';

/** Parameters for activating a draft journey. */
export type ActivateJourneyParams = {
  /** Clerk user ID of the owner. */
  userId: string;
  /** Journey row to transition from drafting to active. */
  journeyId: string;
  /** Final title from {@link bootstrapJourney}. */
  title: string;
  /** Learner context memory from {@link bootstrapJourney}. */
  memory: string;
  /** Final syllabus to persist and create chapters from. */
  syllabus: Syllabus;
};

/** Minimal result returned after activation. */
export type ActivatedJourney = { id: string; title: string };

/**
 * Transitions a draft journey to active status in a single transaction:
 * updates the journey row, then inserts chapter rows (first active, rest locked).
 *
 * @param params - Owner, journey id, and finalized fields.
 * @returns The journey id and title after update.
 * @throws Error when the row is missing, not owned by the user, or not drafting.
 */
export async function activateJourney({
  userId,
  journeyId,
  title,
  memory,
  syllabus,
}: ActivateJourneyParams): Promise<ActivatedJourney> {
  return dbTx.transaction(async (tx) => {
    const updated = await tx
      .update(journeys)
      .set({
        status: 'active',
        title,
        memory,
        syllabus,
      })
      .where(
        and(
          eq(journeys.id, journeyId),
          eq(journeys.userId, userId),
          eq(journeys.status, 'drafting'),
        ),
      )
      .returning({ id: journeys.id, title: journeys.title });

    if (updated.length === 0) {
      throw new Error(
        'Journey not found, not owned by user, or not in drafting status',
      );
    }

    const row = updated[0];

    if (syllabus.chapters.length > 0) {
      await tx.insert(chapters).values(
        syllabus.chapters.map((c, i) => ({
          journeyId: row.id,
          idx: i,
          title: c.title,
          status: i === 0 ? ('active' as const) : ('locked' as const),
        })),
      );
    }

    return row;
  });
}
