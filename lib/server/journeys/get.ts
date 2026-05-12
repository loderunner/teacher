import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';
import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';

export type JourneyChapter = {
  id: string;
  idx: number;
  title: string;
  status: 'locked' | 'active' | 'done';
  summary: string | null;
};

export type Journey = {
  id: string;
  title: string;
  styleId: string;
  syllabus: Syllabus;
  chapters: JourneyChapter[];
};

export type GetJourneyParams = { userId: string; id: string };

export async function getJourney({
  userId,
  id,
}: GetJourneyParams): Promise<Journey | null> {
  const rows = await db
    .select({
      id: journeys.id,
      title: journeys.title,
      styleId: journeys.styleId,
      syllabus: journeys.syllabus,
    })
    .from(journeys)
    .where(and(eq(journeys.id, id), eq(journeys.userId, userId)));

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const syllabus = syllabusSchema.parse(row.syllabus);

  const chapterRows = await db
    .select({
      id: chapters.id,
      idx: chapters.idx,
      title: chapters.title,
      status: chapters.status,
      summary: chapters.summary,
    })
    .from(chapters)
    .where(eq(chapters.journeyId, id))
    .orderBy(chapters.idx);

  return {
    id: row.id,
    title: row.title,
    styleId: row.styleId,
    syllabus,
    chapters: chapterRows,
  };
}
