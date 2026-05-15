import { and, eq } from 'drizzle-orm';

import { dbTx } from '@/lib/server/db';
import { chapters, journeys } from '@/lib/server/db/schema';

/** Parameters for completing a chapter. */
export type CompleteChapterInput = {
  /** Clerk user ID — scopes every write to the owner of the journey. */
  userId: string;
  /** Journey the chapter belongs to. */
  journeyId: string;
  /** Zero-based index of the chapter to mark complete. */
  idx: number;
  /** Markdown summary to persist on the chapter row. */
  summary: string;
};

/** Result of a chapter completion. */
export type CompleteChapterResult = {
  /** Index of the next chapter unlocked, or `null` if there is no next chapter. */
  nextIdx: number | null;
};

/**
 * Marks a chapter as `done`, persists its summary, unlocks the next chapter,
 * and bumps `journeys.currentChapterIndex`. All writes happen in a single
 * transaction and are scoped to the journey owner via `journeys.userId`.
 *
 * Idempotent on already-done chapters: returns the current `nextIdx` without
 * re-writing.
 *
 * @param input - Owner, journey, chapter idx, and summary text.
 * @returns The index of the now-active chapter, or `null` if last chapter.
 */
export async function completeChapter({
  userId,
  journeyId,
  idx,
  summary,
}: CompleteChapterInput): Promise<CompleteChapterResult> {
  return dbTx.transaction(async (tx) => {
    const journeyRows = await tx
      .select({ id: journeys.id })
      .from(journeys)
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));

    if (journeyRows.length === 0) {
      throw new Error('Journey not found');
    }

    const chapterRows = await tx
      .select({
        id: chapters.id,
        idx: chapters.idx,
        status: chapters.status,
      })
      .from(chapters)
      .where(eq(chapters.journeyId, journeyId))
      .orderBy(chapters.idx);

    const current = chapterRows.find((c) => c.idx === idx) ?? null;
    if (current === null) {
      throw new Error('Chapter not found');
    }

    const lastIdx = chapterRows[chapterRows.length - 1]?.idx ?? idx;
    const nextIdx = idx + 1 <= lastIdx ? idx + 1 : null;

    if (current.status === 'done') {
      return { nextIdx };
    }

    await tx
      .update(chapters)
      .set({ status: 'done', summary })
      .where(
        and(eq(chapters.id, current.id), eq(chapters.journeyId, journeyId)),
      );

    if (nextIdx !== null) {
      await tx
        .update(chapters)
        .set({ status: 'active' })
        .where(
          and(eq(chapters.journeyId, journeyId), eq(chapters.idx, nextIdx)),
        );
    }

    const newCurrent = nextIdx ?? lastIdx;
    await tx
      .update(journeys)
      .set({ currentChapterIndex: newCurrent })
      .where(and(eq(journeys.id, journeyId), eq(journeys.userId, userId)));

    return { nextIdx };
  });
}
