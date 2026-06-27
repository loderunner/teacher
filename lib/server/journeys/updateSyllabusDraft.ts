import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';
import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';

/** Parameters for updating the syllabus draft on a journey in drafting status. */
export type UpdateSyllabusDraftParams = {
  /** Clerk user ID — scopes the update to the owner. */
  userId: string;
  /** Journey ID to update. */
  journeyId: string;
  /** New syllabus to persist. */
  syllabus: Syllabus;
};

/**
 * Persists a new syllabus draft to the journeys table. Scoped to the owner and
 * to journeys still in `drafting` status so stale tool calls cannot overwrite
 * an already-activated journey.
 *
 * @param params - Owner ID, journey ID, and the new syllabus.
 */
export async function updateSyllabusDraft({
  userId,
  journeyId,
  syllabus,
}: UpdateSyllabusDraftParams): Promise<void> {
  await db
    .update(journeys)
    .set({ syllabus: syllabusSchema.parse(syllabus) })
    .where(
      and(
        eq(journeys.id, journeyId),
        eq(journeys.userId, userId),
        eq(journeys.status, 'drafting'),
      ),
    );
}
