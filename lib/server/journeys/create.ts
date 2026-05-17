import { db, dbTx } from '@/lib/server/db';
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
      syllabus: { chapters: [] },
      memory: '',
    })
    .returning({ id: journeys.id, title: journeys.title });

  if (rows.length === 0) {
    throw new Error('Failed to create draft journey');
  }

  return rows[0];
}
