import { dbTx } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';
import type { Syllabus } from '@/lib/server/syllabus/schema';

export type CreateJourneyParams = {
  userId: string;
  title: string;
  styleId: string;
  syllabus: Syllabus;
  memory: string;
};

export type CreatedJourney = { id: string; title: string };

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
