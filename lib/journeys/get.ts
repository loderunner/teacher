import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { chapters, journeys } from '@/lib/db/schema';
import { type Syllabus, syllabusSchema } from '@/lib/syllabus/schema';

export type JourneyChapterStatus = 'locked' | 'active' | 'done';

/** A chapter as returned from the database for display. */
export type JourneyChapter = {
  /** Unique chapter ID. */
  id: string;
  /** Zero-based position in the journey. */
  idx: number;
  /** Chapter title. */
  title: string;
  /** Progression state of the chapter. */
  status: JourneyChapterStatus;
  /** Optional one-paragraph summary written after completion. */
  summary: string | null;
  /** Forward-looking one-paragraph overview of what the chapter covers. */
  overview: string;
  /** Ordered list of sub-topics covered in the chapter. */
  sections: string[];
};

/** A fully hydrated journey including its chapters. */
export type Journey = {
  /** Unique journey ID. */
  id: string;
  /** Display title of the journey. */
  title: string;
  /** ID of the teaching style preset applied to this journey. */
  styleId: string;
  /** Ordered list of learner memory entries for the journey. */
  memory: string[];
  /** Drafting journeys have no chapters until activation. */
  status: 'drafting' | 'active';
  /**
   * The syllabus produced by the drafting conversation. `null` until the model
   * publishes a first draft. Frozen at activation and never rewritten
   * afterwards — it is kept for display only. The current state of an active
   * journey lives in {@link chapters}, not here.
   */
  syllabusDraft: Syllabus | null;
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
      memory: journeys.memory,
      syllabusDraft: journeys.syllabusDraft,
      status: journeys.status,
    })
    .from(journeys)
    .where(and(eq(journeys.id, id), eq(journeys.userId, userId)));

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  let syllabusDraft: Syllabus | null = null;
  if (row.syllabusDraft !== null) {
    const parsed = syllabusSchema.safeParse(row.syllabusDraft);
    if (parsed.success) {
      syllabusDraft = parsed.data;
    }
  }

  const chapterRows = await db
    .select({
      id: chapters.id,
      idx: chapters.idx,
      title: chapters.title,
      status: chapters.status,
      summary: chapters.summary,
      overview: chapters.overview,
      sections: chapters.sections,
    })
    .from(chapters)
    .where(eq(chapters.journeyId, id))
    .orderBy(chapters.idx);

  return {
    id: row.id,
    title: row.title,
    styleId: row.styleId,
    memory: row.memory,
    status: row.status,
    syllabusDraft,
    chapters: chapterRows,
  };
}
