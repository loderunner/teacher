import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

/** Parameters for updating the teaching style of a journey. */
export type SetJourneyStyleInput = {
  /** Clerk user ID — used to scope the update to the owner. */
  userId: string;
  /** Journey ID to update. */
  id: string;
  /** New teaching style preset ID. */
  styleId: string;
};

/**
 * Updates the teaching style of a journey.
 * The update is scoped to the owner to prevent unauthorized modifications.
 *
 * @param input - Journey ID, owner ID, and new style ID.
 */
export async function setJourneyStyle({
  userId,
  id,
  styleId,
}: SetJourneyStyleInput): Promise<void> {
  await db
    .update(journeys)
    .set({ styleId })
    .where(and(eq(journeys.id, id), eq(journeys.userId, userId)));
}
