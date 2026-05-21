import { type SQL, and, eq, isNull } from 'drizzle-orm';

import { messages } from '@/lib/server/db/schema';

/**
 * Builds the WHERE clause that scopes message rows to a single conversation:
 * a syllabus draft (`chapterId === null`) or a specific chapter.
 *
 * @param journeyId - Owning journey.
 * @param chapterId - `null` = syllabus scope; a chapter id = chapter scope.
 */
export function messageScope(
  journeyId: string,
  chapterId: string | null,
): SQL | undefined {
  return chapterId === null
    ? and(eq(messages.journeyId, journeyId), isNull(messages.chapterId))
    : and(eq(messages.journeyId, journeyId), eq(messages.chapterId, chapterId));
}
