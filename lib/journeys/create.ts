import { db } from '@/lib/db';
import { journeys } from '@/lib/db/schema';

/** Parameters for creating a draft journey at chat start. */
export type CreateDraftJourneyParams = {
  /** Clerk user ID of the owner. */
  userId: string;
  /** Draft title derived from the user's first message text. */
  title: string;
  /** ID of the teaching style preset to apply. */
  styleId: string;
};

/** Minimal return type from draft creation. */
export type CreatedDraftJourney = { id: string; title: string };

/**
 * Creates a draft journey row (`status = drafting`) with no chapters.
 * Called when the user sends their first syllabus message.
 *
 * @param params - Owner, rough title, and style.
 * @returns The new journey's ID and title.
 */
export async function createDraftJourney({
  userId,
  title,
  styleId,
}: CreateDraftJourneyParams): Promise<CreatedDraftJourney> {
  const rows = await db
    .insert(journeys)
    .values({
      userId,
      title,
      styleId,
      status: 'drafting',
      memory: [],
    })
    .returning({ id: journeys.id, title: journeys.title });

  if (rows.length === 0) {
    throw new Error('Failed to create draft journey');
  }

  return rows[0];
}
