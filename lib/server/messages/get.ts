import type { UIMessage } from 'ai';
import { asc } from 'drizzle-orm';

import { messageScope } from './scope';

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
    })
    .from(messages)
    .where(messageScope(journeyId, chapterId))
    .orderBy(asc(messages.createdAt));

  return rows.map((row) => {
    if (!isChatRole(row.role)) {
      throw new Error(`Unsupported message role in storage: ${row.role}`);
    }
    return { id: row.id, role: row.role, parts: row.parts };
  });
}
