import type { UIMessage } from 'ai';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { messages } from '@/lib/db/schema';

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
  const scope =
    chapterId === null
      ? and(eq(messages.journeyId, journeyId), isNull(messages.chapterId))
      : and(
          eq(messages.journeyId, journeyId),
          eq(messages.chapterId, chapterId),
        );

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      parts: messages.parts,
      metadata: messages.metadata,
    })
    .from(messages)
    .where(scope)
    .orderBy(asc(messages.createdAt));

  return rows
    .filter((row): row is (typeof rows)[number] & { role: UIMessage['role'] } =>
      isChatRole(row.role),
    )
    .map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts,
      ...(row.metadata !== null && row.metadata !== undefined
        ? { metadata: row.metadata }
        : {}),
    }));
}
