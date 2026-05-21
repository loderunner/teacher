import type { UIMessage } from 'ai';
import { and, notInArray, sql } from 'drizzle-orm';

import { messageScope } from './scope';

import { dbTx } from '@/lib/server/db';
import { messages } from '@/lib/server/db/schema';

/** Parameters for syncing messages into a conversation scope. */
export type SyncMessagesParams = {
  /** Owning journey. */
  journeyId: string;
  /** `null` = syllabus chat scope; a chapter id = chapter chat scope. */
  chapterId: string | null;
  /** Full UI message list to persist for the scope. */
  messages: UIMessage[];
};

/**
 * Persists the client's current message list for a scope and removes stale rows.
 *
 * Deletes every stored row for `(journeyId, chapterId)` whose `id` is not in
 * the provided list, then upserts the list. Runs in a single transaction so
 * reloads never see a half-applied branch. An empty `messages` list deletes
 * the entire scope.
 *
 * @param params - Journey scope and the authoritative message list for that scope.
 */
export async function syncMessages({
  journeyId,
  chapterId,
  messages: uiMessages,
}: SyncMessagesParams): Promise<void> {
  const scope = messageScope(journeyId, chapterId);

  await dbTx.transaction(async (tx) => {
    if (uiMessages.length === 0) {
      await tx.delete(messages).where(scope);
      return;
    }

    const keptIds = [...new Set(uiMessages.map((m) => m.id))];

    await tx
      .delete(messages)
      .where(and(scope, notInArray(messages.id, keptIds)));

    await tx
      .insert(messages)
      .values(
        uiMessages.map((m) => ({
          id: m.id,
          journeyId,
          chapterId,
          role: m.role,
          parts: m.parts,
        })),
      )
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          journeyId: sql`excluded.journey_id`,
          chapterId: sql`excluded.chapter_id`,
          role: sql`excluded.role`,
          parts: sql`excluded.parts`,
        },
      });
  });
}
