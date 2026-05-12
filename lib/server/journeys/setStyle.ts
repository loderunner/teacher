import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { journeys } from '@/lib/server/db/schema';

export type SetJourneyStyleInput = {
  userId: string;
  id: string;
  styleId: string;
};

export async function setJourneyStyle(
  input: SetJourneyStyleInput,
): Promise<void> {
  const { userId, id, styleId } = input;
  await db
    .update(journeys)
    .set({ styleId })
    .where(and(eq(journeys.id, id), eq(journeys.userId, userId)));
}
