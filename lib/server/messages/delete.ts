import { and, eq, gte, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { messages } from '@/lib/server/db/schema';

/** Parameters for truncating a conversation from a given message onwards. */
export type DeleteMessagesFromParams = {
  /** Owning journey. */
  journeyId: string;
  /** `null` = syllabus chat scope. */
  chapterId: string | null;
  /**
   * First message to delete (inclusive). All later messages in the same scope
   * are also deleted. A no-op when this id is absent from the scope.
   */
  fromMessageId: string;
};

/**
 * Deletes a message and every later message in the same scope. Used to
 * truncate stored history when a past message is edited or an assistant turn
 * is regenerated. Safe when `fromMessageId` is absent — the call is a no-op.
 *
 * @param params - Journey scope and the first message id to delete from.
 */
export async function deleteMessagesFrom({
  journeyId,
  chapterId,
  fromMessageId,
}: DeleteMessagesFromParams): Promise<void> {
  const scope =
    chapterId === null
      ? and(eq(messages.journeyId, journeyId), isNull(messages.chapterId))
      : and(
          eq(messages.journeyId, journeyId),
          eq(messages.chapterId, chapterId),
        );

  await db
    .delete(messages)
    .where(
      and(
        scope,
        gte(
          messages.createdAt,
          sql`(SELECT created_at FROM messages WHERE id = ${fromMessageId})`,
        ),
      ),
    );
}
