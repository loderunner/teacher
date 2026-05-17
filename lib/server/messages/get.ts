import type { UIMessage } from 'ai';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/server/db';
import { messages } from '@/lib/server/db/schema';

/** Parameters for fetching messages for a conversation scope. */
export type GetMessagesParams = {
  /** Owning journey. */
  journeyId: string;
  /** `null` = syllabus chat scope. */
  chapterId: string | null;
};

function isChatRole(role: string): role is UIMessage['role'] {
  return role === 'user' || role === 'assistant' || role === 'system';
}

/**
 * Returns UI messages for the given scope, oldest first.
 *
 * @param params - Journey and optional chapter scope.
 */
export async function getMessages({
  journeyId,
  chapterId,
}: GetMessagesParams): Promise<UIMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      parts: messages.parts,
      metadata: messages.metadata,
    })
    .from(messages)
    .where(
      chapterId === null
        ? and(eq(messages.journeyId, journeyId), isNull(messages.chapterId))
        : and(
            eq(messages.journeyId, journeyId),
            eq(messages.chapterId, chapterId),
          ),
    )
    .orderBy(asc(messages.createdAt));

  return rows.map((row) => {
    if (!isChatRole(row.role)) {
      throw new Error(`Unsupported message role in storage: ${row.role}`);
    }
    const base: UIMessage = {
      id: row.id,
      role: row.role,
      parts: row.parts as UIMessage['parts'],
    };
    if (row.metadata !== null && row.metadata !== undefined) {
      return {
        ...base,
        metadata: row.metadata,
      };
    }
    return base;
  });
}
