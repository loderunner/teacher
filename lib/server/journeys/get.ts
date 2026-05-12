import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';
import { type Syllabus, syllabusSchema } from '@/lib/server/syllabus/schema';

/** A chapter as returned from the database for display. */
export type JourneyChapter = {
  /** Unique chapter ID. */
  id: string;
  /** Zero-based position in the journey. */
  idx: number;
  /** Chapter title. */
  title: string;
  /** Progression state of the chapter. */
  status: 'locked' | 'active' | 'done';
  /** Optional one-paragraph summary written after completion. */
  summary: string | null;
};

/** A fully hydrated journey including its chapters. */
export type Journey = {
  /** Unique journey ID. */
  id: string;
  /** Display title of the journey. */
  title: string;
  /** ID of the teaching style preset applied to this journey. */
  styleId: string;
  /** Structured syllabus for the journey. */
  syllabus: Syllabus;
  /** Ordered list of chapters. */
  chapters: JourneyChapter[];
};

/** Parameters for fetching a single journey. */
export type GetJourneyParams = { userId: string; id: string };

/**
 * Fetches a journey and its chapters for the given user.
 *
 * @param params - User ID and journey ID.
 * @returns The journey, or `null` if it does not exist or belongs to a different user.
 */
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
