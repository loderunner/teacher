import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';
import type { Syllabus } from '@/lib/server/syllabus/schema';

/** Parameters for saving the latest syllabus draft to an in-progress journey. */
export type UpdateDraftParams = {
  /** Target journey row. */
  journeyId: string;
  /** Full syllabus draft to store on the journey. */
  syllabus: Syllabus;
};

/**
 * Replaces the `syllabus` field on a drafting journey.
 * Called after each streaming turn that runs the update syllabus draft tool.
 *
 * @param params - Journey id and draft payload.
 */
export async function updateDraftSyllabus({
  journeyId,
  syllabus,
}: UpdateDraftParams): Promise<void> {
  await db
    .update(journeys)
    .set({ syllabus })
    .where(and(eq(journeys.id, journeyId), eq(journeys.status, 'drafting')));
}
