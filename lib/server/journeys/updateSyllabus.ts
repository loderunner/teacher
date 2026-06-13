import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';
import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';

/** Parameters for updating a journey's syllabus. */
export type UpdateJourneySyllabusParams = {
  /** Clerk user ID — scopes the update to the owner. */
  userId: string;
  /** Journey whose syllabus is being updated. */
  journeyId: string;
  /** New syllabus to persist. */
  syllabus: Syllabus;
};

/**
 * Overwrites the stored `syllabus` on a journey row, scoped to the owner.
 * Used during drafting to persist each `updateSyllabusDraft` tool call.
 *
 * @param params - Owner ID, journey ID, and new syllabus.
 */
export async function updateJourneySyllabus({
  userId,
  journeyId,
  syllabus,
}: UpdateJourneySyllabusParams): Promise<void> {
  await db
    .update(journeys)
    .set({ syllabus: syllabusSchema.parse(syllabus) })
    .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));
}
