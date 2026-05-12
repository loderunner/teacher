import { dbTx } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';
import type { Syllabus } from '@/lib/server/syllabus/schema';

/** Parameters for creating a new journey. */
export type CreateJourneyParams = {
  /** Clerk user ID of the owner. */
  userId: string;
  /** Display title of the journey. */
  title: string;
  /** ID of the teaching style preset to apply. */
  styleId: string;
  /** Structured syllabus generated during the chat phase. */
  syllabus: Syllabus;
  /** Markdown summary of learner context captured from the bootstrap conversation. */
  memory: string;
};

/** Minimal journey data returned after creation. */
export type CreatedJourney = { id: string; title: string };

/**
 * Creates a journey and its initial chapters in a single transaction.
 *
 * @param params - Journey creation parameters.
 * @returns The newly created journey's ID and title.
 */
export async function createJourney({
  userId,
  title,
  styleId,
  syllabus,
  memory,
}: CreateJourneyParams): Promise<CreatedJourney> {
  return dbTx.transaction(async (tx) => {
    const [journey] = await tx
      .insert(journeys)
      .values({ userId, title, styleId, syllabus, memory })
      .returning({ id: journeys.id, title: journeys.title });

    if (syllabus.chapters.length > 0) {
      await tx.insert(chapters).values(
        syllabus.chapters.map((c, i) => ({
          journeyId: journey.id,
          idx: i,
          title: c.title,
          status: i === 0 ? ('active' as const) : ('locked' as const),
        })),
      );
    }

    return journey;
  });
}
